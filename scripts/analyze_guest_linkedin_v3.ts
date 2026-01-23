
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
    "Wellington Cruz",
    "Wellington Alves", // Sometimes likely refers to Wellington Cruz?
    "Raphael Lacerda" // Just in case, common co-host
];

// Basic Levenshtein Distance Implementation
function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1 // deletion
                    )
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
    const match = url.match(/\/in\/([\w\-À-ÿ]+)/);
    return match ? normalizeString(match[1]) : "";
}

function extractLinkedInUrls(text: string): string[] {
    // Regex matching, now robust to case and some spacing issues if processed beforehand
    const regex = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w\-À-ÿ]+/gi;
    return text.match(regex) || [];
}

async function analyzeGuestLinkedinV3() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const REPORT_FILE = "guest_linkedin_preview_v3.md";
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

        let report = `# Guest LinkedIn Enrichment Analysis V3 (Refined + Co-hosts)\n\n`;

        for (const doc of sample) {
            const data = doc.data() as EpisodeData;
            const title = data.title || "No Title";
            let description = data.description || "";
            // Pre-process description: remove newlines to join broken lines/contexts
            const cleanDescription = description.replace(/[\n\r]+/g, ' ');

            let guests = (data.guests || []).map(g => ({ ...g }));

            report += `## Episode: ${title}\n`;
            report += `**ID**: ${doc.id}\n`;

            if (!description) {
                report += `> ⚠️ **Warning**: No description found.\n\n`;
                continue;
            }

            // Detect Co-hosts in description and add to guests if missing
            const addedCohosts: string[] = [];
            KNOWN_COHOSTS.forEach(cohost => {
                const normCohost = normalizeString(cohost);
                const normDesc = normalizeString(cleanDescription);
                if (normDesc.includes(normCohost)) {
                    // Check if already in guests
                    const exists = guests.some(g => normalizeString(g.name).includes(normCohost) || normCohost.includes(normalizeString(g.name)));
                    if (!exists) {
                        guests.push({ name: cohost });
                        addedCohosts.push(cohost);
                    }
                }
            });

            if (addedCohosts.length > 0) {
                report += `> **Analysis**: Detected co-host(s) in description: ${addedCohosts.join(', ')}. Treated as guests.\n`;
            }

            const urls = extractLinkedInUrls(cleanDescription);
            const uniqueUrls = [...new Set(urls)];

            if (uniqueUrls.length === 0) {
                report += `> ℹ️ Info: No LinkedIn URLs found.\n\n`;
                // Just in case, try extraction on strict newline version?
                // Sometimes 'linkedin.com/in/\nusername' ? 
                // Let's try removing ALL spaces for a second pass logic if desperate? No, that's dangerous.
                continue;
            }

            report += `**Found LinkedIn URLs:**\n`;
            uniqueUrls.forEach(u => report += `- ${u}\n`);
            report += `\n`;

            if (guests.length === 0) {
                report += `> ⚠️ **Warning**: No guests.\n\n`;
                continue;
            }

            report += `**Proposed Enrichments:**\n`;
            report += `| Guest Name | Matched LinkedIn | Method | Confidence |\n`;
            report += `| :--- | :--- | :--- | :--- |\n`;

            const assignments: { [guestIndex: number]: { url: string, method: string, confidence: string, score: number } } = {};
            const assignedUrls = new Set<string>();

            // Pass 1: Name Part Match & Fuzzy Match
            guests.forEach((guest, index) => {
                if (!guest.name) return;
                const normGuestName = normalizeString(guest.name);
                const guestNameParts = guest.name.toLowerCase().split(' ').map(p => normalizeString(p)).filter(p => p.length > 2);

                for (const url of uniqueUrls) {
                    if (assignedUrls.has(url)) continue;

                    const urlUsername = extractLinkedInUsername(url);
                    if (!urlUsername) continue;

                    // 1. Exact Inclusion (High Confidence)
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

                        // Relaxed threshold for user feedback case (stipkovic)
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
            // Logic: If N guests Total, and we have enough URLs, fill gaps.
            // Specifically, if guests.length <= uniqueUrls.length (enough URLs for everyone)
            // And only 1 guest is unassigned and 1 URL unassigned? 
            if (guests.length <= uniqueUrls.length) {
                const unassignedGuests = guests.map((_, i) => i).filter(i => !assignments[i]);
                const unassignedUrlsList = uniqueUrls.filter(u => !assignedUrls.has(u));

                if (unassignedGuests.length === 1 && unassignedUrlsList.length >= 1) {
                    // Best remaining URL? Or just the first one?
                    // If there's only 1 URL left, take it. 
                    if (unassignedUrlsList.length === 1) {
                        assignments[unassignedGuests[0]] = {
                            url: unassignedUrlsList[0],
                            method: "Deduction (Single Elimination)",
                            confidence: "Medium",
                            score: 4
                        };
                        assignedUrls.add(unassignedUrlsList[0]);
                    } else {
                        // Multiple URLs left, 1 guest. Can we guess? 
                        // Maybe checking order of appearance in description vs order of guests? 
                        // Too complex for now.
                    }
                }
                // If unassignedGuests > 1, and unassignedUrls == unassignedGuests? 
                // Hard to map 1:1 without order.
            }

            // Generate Report Table
            guests.forEach((guest, index) => {
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

analyzeGuestLinkedinV3().catch(console.error);
