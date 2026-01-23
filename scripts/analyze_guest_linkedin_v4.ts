
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
    // url can be "linkedin.com/in/username" or "https://..."
    const match = url.match(/linkedin\.com\/in\/([a-zA-Z0-9\-\%]+)/i);
    return match ? normalizeString(match[1]) : "";
}

function extractLinkedInUrls(text: string): string[] {
    // Regex to capture linkedin urls with or without protocol
    // We capture the full pattern "linkedin.com/in/username"
    // We strictly look for "linkedin.com/in/" followed by valid chars.
    // We stop at invalid URL chars like space, brackets, comma, or another slash?
    // Actually, slashes at the end are common (e.g. /in/user/).
    // But slashes followed by text (e.g. /in/user/OtherString) logic is tricky.
    // We'll capture greedy valid chars, then clean trailing slash.

    // Pattern:
    // (https?://)?(www\.)?linkedin\.com/in/[WORD]
    const regex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9\-\%\_]+(?:\/[a-zA-Z0-9\-\%\_]+)?)/gi;

    const matches = text.match(regex) || [];

    // Clean matches
    return matches.map(m => {
        // Fix potential "glued" text at the end if regex grabbed too much? 
        // Our regex charset [a-zA-Z0-9\-\%\_] plus optional slash seems safe-ish.
        // But the user example "jfmalbano/Tatiana" -> The slash is a delimiter!
        // If we extracted "jfmalbano/Tatiana", that's wrong.
        // We generally shouldn't allow "/" inside the username unless it's a known locale pattern?
        // LinkedIn public profiles are usually just /in/username (no internal slashes) or /in/username-hash.
        // So we should probably NOT allow slashes in the username part for safety, or assume trailing slash is end.

        let cleaned = m;
        // If it starts without protocol, maybe add it for consistency in output?
        if (!cleaned.match(/^https?:\/\//)) {
            cleaned = "https://" + cleaned;
        }

        // Remove trailing slash
        if (cleaned.endsWith("/")) {
            cleaned = cleaned.slice(0, -1);
        }

        // If it contains a slash in the username part, truncate it?
        // extract username again
        const usernameMatch = cleaned.match(/linkedin\.com\/in\/([^\/]+)/i);
        if (usernameMatch) {
            const username = usernameMatch[1];
            // Rebuild standard URL
            return `https://www.linkedin.com/in/${username}`;
        }

        return cleaned;
    });
}

async function analyzeGuestLinkedinV4() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const REPORT_FILE = "guest_linkedin_preview_v4.md";
    const TARGET_IDS = ['zt5GRyllUc4', 'vvmXlbNwtQk', 'p2GYFWmzUp8', 'sRrpDPUChyQ', '6kI0v-wAsDg'];
    const RANDOM_SAMPLE_SIZE = 10;

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

        let report = `# Guest LinkedIn Enrichment Analysis V4 (Final refinements)\n\n`;

        for (const doc of sample) {
            const data = doc.data() as EpisodeData;
            const title = data.title || "No Title";
            let description = data.description || "";

            // Pre-process description
            // 1. Replace newlines with spaces to fix "broken" lines
            // 2. Add spaces around slashes? "jfmalbano/Tatiana" -> "jfmalbano / Tatiana" might help extraction boundaries?
            // Actually, if we forbid slash in regex usage, "jfmalbano/Tatiana" will match "jfmalbano" and stop at slash. That is safer.
            const cleanDescription = description.replace(/[\n\r]+/g, ' ');

            let guests = (data.guests || []).map(g => ({ ...g }));

            report += `## Episode: ${title}\n`;
            report += `**ID**: ${doc.id}\n`;

            if (!description) {
                report += `> ⚠️ **Warning**: No description found.\n\n`;
                continue;
            }

            // Detect Co-hosts
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

            if (addedCohosts.length > 0) {
                report += `> **Analysis**: Detected co-host(s): ${addedCohosts.join(', ')}.\n`;
            }

            // Filter out Ignored Names (Host) from guests list effectively for matching purposes
            // We keep them in "guests" locally to index match?? 
            // Better to just filter them out of process list.
            const processGuests = guests.filter(g => {
                const normName = normalizeString(g.name);
                return !IGNORED_NAMES.some(ignored => normalizeString(ignored) === normName);
            });

            if (guests.length !== processGuests.length) {
                const removed = guests.filter(g => !processGuests.includes(g)).map(g => g.name);
                report += `> **Analysis**: Ignoring host(s): ${removed.join(', ')}.\n`;
            }


            const urls = extractLinkedInUrls(cleanDescription);
            const uniqueUrls = [...new Set(urls)];

            if (uniqueUrls.length === 0) {
                report += `> ℹ️ Info: No LinkedIn URLs found.\n\n`;
                // Debug snippet
                if (TARGET_IDS.includes(doc.id)) {
                    report += `> **DEBUG Snippet**: ...${cleanDescription.slice(0, 100)}...\n\n`;
                }
                continue;
            }

            report += `**Found LinkedIn URLs:**\n`;
            uniqueUrls.forEach(u => report += `- ${u}\n`);
            report += `\n`;

            if (processGuests.length === 0) {
                report += `> ℹ️ Info: No valid guests to match (only host or empty).\n\n`;
                continue;
            }

            report += `**Proposed Enrichments:**\n`;
            report += `| Guest Name | Matched LinkedIn | Method | Confidence |\n`;
            report += `| :--- | :--- | :--- | :--- |\n`;

            const assignments: { [guestIndex: number]: { url: string, method: string, confidence: string, score: number } } = {};
            const assignedUrls = new Set<string>();

            // Matching Logic
            processGuests.forEach((guest, index) => {
                // Use original index from processGuests
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

analyzeGuestLinkedinV4().catch(console.error);
