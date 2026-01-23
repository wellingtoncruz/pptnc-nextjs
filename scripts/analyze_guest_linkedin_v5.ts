
import { Firestore } from "@google-cloud/firestore";
import * as fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface Guest {
    name: string;
    linkedin?: string;
    [key: string]: any;
}

interface EpisodeData {
    title?: string;
    description?: string;
    guests?: Guest[];
    [key: string]: any;
}

const KNOWN_COHOSTS = [
    "Valdir Scarin",
    "Raphael Lacerda"
];

const IGNORED_NAMES = [
    "Wellington Cruz",
    "Wellington Alves"
];

// Basic Levenshtein Distance
function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function normalizeString(str: string): string {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractLinkedInUsername(url: string): string {
    const match = url.match(/linkedin\.com\/in\/([a-zA-Z0-9\-\%]+)/i);
    return match ? normalizeString(match[1]) : "";
}

function extractLinkedInUrls(text: string): string[] {
    const regex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9\-\%\_]+(?:\/[a-zA-Z0-9\-\%\_]+)?)/gi;
    const matches = text.match(regex) || [];

    return matches.map(m => {
        let cleaned = m;
        if (!cleaned.match(/^https?:\/\//)) {
            cleaned = "https://" + cleaned;
        }
        if (cleaned.endsWith("/")) {
            cleaned = cleaned.slice(0, -1);
        }
        const usernameMatch = cleaned.match(/linkedin\.com\/in\/([^\/]+)/i);
        if (usernameMatch) {
            return `https://www.linkedin.com/in/${usernameMatch[1]}`;
        }
        return cleaned;
    });
}

// Function to extract names semantically
function extractGuestsSemantically(text: string): string[] {
    const candidates: string[] = [];
    // Patterns: "conversa com Name1, Name2 e Name3", "recebe Name1...", "bate um papo com Name1"
    // We look for capitalized words following these phrases, separated by commas or "e"
    // This is heuristic and might pick up non-names (e.g. "CEO da Empresa").

    // Regex logic:
    // Look for anchor phrases
    // Capture group: ((?:[A-ZÀ-ÿ][a-zà-ÿ]+\s*)+) -> Words starting with Uppercase
    // Then checks for comma or " e " separator.

    // Simplified approach: find the anchor, then grab the following chunks of text that look like names.
    const anchors = ["conversa com", "recebe", "bate um papo com", "convidados:"];
    const normText = text.replace(/[\n\r]+/g, ' '); // use original casing for name detection

    anchors.forEach(anchor => {
        const regex = new RegExp(`${anchor}\\s+((?:[A-ZÀ-ÿ][a-zà-ÿ]+(?:\\s+(?:da|de|do|dos|das|e)\\s+)?(?:[A-ZÀ-ÿ][a-zà-ÿ]+\\s*)*,?)+)`, 'gi');
        let match;
        while ((match = regex.exec(normText)) !== null) {
            const captured = match[1];
            // captured is likely "Name1, Name2 e Name3"
            // Split by comma and " e "
            const split = captured.split(/,|\se\s/);
            split.forEach(s => {
                const clean = s.trim();
                if (clean.length > 2 && !candidates.includes(clean)) {
                    // Filter out some common false positives if they slipped in
                    const lower = clean.toLowerCase();
                    if (!['com', 'para', 'sobre', 'que', 'uma'].includes(lower)) {
                        candidates.push(clean);
                    }
                }
            });
        }
    });

    return candidates;
}


async function analyzeGuestLinkedinV5() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const REPORT_FILE = "guest_linkedin_preview_v5_random.md";
    // Cleared target IDs for random sampling
    const TARGET_IDS: string[] = [];
    const RANDOM_SAMPLE_SIZE = 15;

    try {
        console.log(`Fetching full episodes...`);
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where('isFullEpisode', '==', true)
            .get();

        if (snapshot.empty) {
            console.log("No full episodes found.");
            return;
        }

        const allDocs = snapshot.docs;
        const targetDocs = allDocs.filter(d => TARGET_IDS.includes(d.id));
        const otherDocs = allDocs.filter(d => !TARGET_IDS.includes(d.id));

        const shuffled = otherDocs.sort(() => 0.5 - Math.random());
        const randomSample = shuffled.slice(0, RANDOM_SAMPLE_SIZE);

        const sample = [...targetDocs, ...randomSample];

        console.log(`Selected ${sample.length} episodes for analysis.`);

        let report = `# Guest LinkedIn Enrichment Analysis V5 (Semantic Extraction)\n\n`;

        for (const doc of sample) {
            const data = doc.data() as EpisodeData;
            const title = data.title || "No Title";
            let description = data.description || "";
            const cleanDescription = description.replace(/[\n\r]+/g, ' ');

            let guests = (data.guests || []).map(g => ({ ...g }));

            report += `## Episode: ${title}\n`;
            report += `**ID**: ${doc.id}\n`;

            if (!description) {
                report += `> ⚠️ **Warning**: No description found.\n\n`;
                continue;
            }

            // 1. Detect Co-hosts
            const addedCohosts: string[] = [];
            KNOWN_COHOSTS.forEach(cohost => {
                const normCohost = normalizeString(cohost);
                const normDesc = normalizeString(cleanDescription);
                if (normDesc.includes(normCohost)) {
                    const exists = guests.some(g => normalizeString(g.name).includes(normCohost) || normCohost.includes(normalizeString(g.name)));
                    if (!exists) {
                        guests.push({ name: cohost });
                        addedCohosts.push(cohost);
                    }
                }
            });

            // 2. Semantic Extraction (New)
            const semanticGuests = extractGuestsSemantically(description); // process original description or clean? 
            // extractGuestsSemantically uses cleanDescription inside logic if needed, but here we pass description. 
            // Actually let's pass clearDescription to be safe with regex multiline issues?
            // Nope, regex handles multiline if we don't stripping newlines.
            // But let's pass cleanDescription to avoid splitting phrases.

            // Just for reporting what we found
            if (semanticGuests.length > 0) {
                const newSemanticGuests = semanticGuests.filter(sg => {
                    const normSg = normalizeString(sg);
                    // Filter out host
                    if (IGNORED_NAMES.some(ignored => normalizeString(ignored) === normSg)) return false;
                    // Filter out existing guests
                    return !guests.some(g => normalizeString(g.name).includes(normSg) || normSg.includes(normalizeString(g.name)));
                });

                if (newSemanticGuests.length > 0) {
                    report += `> **Analysis**: Semantic extraction found potential guests: ${newSemanticGuests.join(', ')}.\n`;
                    newSemanticGuests.forEach(name => guests.push({ name }));
                }
            }


            if (addedCohosts.length > 0) {
                report += `> **Analysis**: Detected co-host(s): ${addedCohosts.join(', ')}.\n`;
            }

            // Filter out Ignored Names
            const processGuests = guests.filter(g => {
                const normName = normalizeString(g.name);
                return !IGNORED_NAMES.some(ignored => normalizeString(ignored) === normName);
            });


            const urls = extractLinkedInUrls(cleanDescription);
            const uniqueUrls = [...new Set(urls)];

            if (uniqueUrls.length === 0) {
                report += `> ℹ️ Info: No LinkedIn URLs found.\n\n`;
                // Debug snippet logic
                if (TARGET_IDS.includes(doc.id)) {
                    // report += `> DEBUG: ${cleanDescription.slice(0,100)}...\n`
                }
                continue;
            }

            report += `**Found LinkedIn URLs:**\n`;
            uniqueUrls.forEach(u => report += `- ${u}\n`);
            report += `\n`;

            if (processGuests.length === 0) {
                report += `> ℹ️ Info: No valid guests to match.\n\n`;
                continue;
            }

            report += `**Proposed Enrichments:**\n`;
            report += `| Guest Name | Matched LinkedIn | Method | Confidence |\n`;
            report += `| :--- | :--- | :--- | :--- |\n`;

            const assignments: { [guestIndex: number]: { url: string, method: string, confidence: string, score: number } } = {};
            const assignedUrls = new Set<string>();

            // Matching Logic
            processGuests.forEach((guest, index) => {
                if (!guest.name) return;
                const normGuestName = normalizeString(guest.name);
                const guestNameParts = guest.name.toLowerCase().split(' ').map(p => normalizeString(p)).filter(p => p.length > 2);

                for (const url of uniqueUrls) {
                    if (assignedUrls.has(url)) continue;

                    const urlUsername = extractLinkedInUsername(url);
                    if (!urlUsername) continue;

                    // 1. Exact Inclusion
                    let matchesPart = false;
                    for (const part of guestNameParts) {
                        if (urlUsername.includes(part)) {
                            matchesPart = true;
                            break;
                        }
                    }

                    if (matchesPart) {
                        if (!assignments[index] || assignments[index].score < 10) {
                            assignments[index] = { url, method: "Name Part Match", confidence: "High", score: 10 };
                        }
                        continue;
                    }

                    // 2. Fuzzy Match
                    const chunks = [normGuestName, guestNameParts.join('')];
                    for (const chunk of chunks) {
                        const dist = levenshteinDistance(chunk, urlUsername);
                        const similarity = 1 - (dist / Math.max(chunk.length, urlUsername.length));

                        if (similarity > 0.6) {
                            if (!assignments[index] || assignments[index].score < 5 + similarity) {
                                assignments[index] = { url, method: `Fuzzy (${similarity.toFixed(2)})`, confidence: "Medium", score: 5 + similarity };
                            }
                        }
                    }
                }
            });

            // Mark matched
            Object.values(assignments).forEach(a => assignedUrls.add(a.url));

            // Pass 2: Deduction
            if (processGuests.length <= uniqueUrls.length) {
                const unassignedGuestsIndices = processGuests.map((_, i) => i).filter(i => !assignments[i]);
                const unassignedUrlsList = uniqueUrls.filter(u => !assignedUrls.has(u));

                if (unassignedGuestsIndices.length === 1 && unassignedUrlsList.length === 1) {
                    const idx = unassignedGuestsIndices[0];
                    assignments[idx] = {
                        url: unassignedUrlsList[0],
                        method: "Deduction (Single Elimination)",
                        confidence: "Medium",
                        score: 4
                    };
                    assignedUrls.add(unassignedUrlsList[0]);
                }
            }

            // Generate Report Table
            processGuests.forEach((guest, index) => {
                const match = assignments[index];
                if (match) {
                    report += `| ${guest.name} | ${match.url} | ${match.method} | ${match.confidence} |\n`;
                } else {
                    report += `| ${guest.name} | *Not Found* | - | - |\n`;
                }
            });
            report += `\n`;
        }

        fs.writeFileSync(REPORT_FILE, report);
        console.log(`Report generated at: ${REPORT_FILE}`);

    } catch (error) {
        console.error("Error analyzing linkedin:", error);
        process.exit(1);
    }
}

analyzeGuestLinkedinV5().catch(console.error);
