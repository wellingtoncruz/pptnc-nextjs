
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

// Extract username part from LinkedIn URL for better fuzzy matching
function extractLinkedInUsername(url: string): string {
    // match /in/username or /in/username/
    const match = url.match(/\/in\/([\w\-À-ÿ]+)/);
    return match ? normalizeString(match[1]) : "";
}

function extractLinkedInUrls(text: string): string[] {
    // Regex matches https://linkedin.com/in/username
    // Updated to be robust with boundaries
    const regex = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w\-À-ÿ]+/g;
    return text.match(regex) || [];
}

async function analyzeGuestLinkedinV2() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const REPORT_FILE = "guest_linkedin_preview_v2.md";
    const TARGET_IDS = ['zt5GRyllUc4', 'vvmXlbNwtQk', 'p2GYFWmzUp8', 'sRrpDPUChyQ'];
    const RANDOM_SAMPLE_SIZE = 11; // Total 15 (4 specific + 11 random)

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

        console.log(`Selected ${sample.length} episodes for analysis (4 specific + ${randomSample.length} random).`);

        let report = `# Guest LinkedIn Enrichment Analysis V2 (Refined)\n\n`;

        for (const doc of sample) {
            const data = doc.data() as EpisodeData;
            const title = data.title || "No Title";
            const description = data.description || "";
            const guests = (data.guests || []).map(g => ({ ...g })); // Clone to avoid mutation issues implies

            report += `## Episode: ${title}\n`;
            report += `**ID**: ${doc.id}\n`;

            if (!description) {
                report += `> ⚠️ **Warning**: No description found.\n\n`;
                continue;
            }

            const urls = extractLinkedInUrls(description);
            // Deduplicate URLs
            const uniqueUrls = [...new Set(urls)];

            if (uniqueUrls.length === 0) {
                report += `> ℹ️ Info: No LinkedIn URLs found in description.\n`;
                // Temporary debug to see description content for specific IDs
                if (TARGET_IDS.includes(doc.id)) {
                    report += `> **DEBUG Description Snippet**: ${description.slice(0, 200).replace(/\n/g, '\\n')}...\n`;
                }
                report += `\n`;
                continue;
            }

            report += `**Found LinkedIn URLs (${uniqueUrls.length}):**\n`;
            uniqueUrls.forEach(u => report += `- ${u}\n`);

            if (guests.length === 0) {
                report += `> ⚠️ **Warning**: No 'guests' array in DB.\n\n`;
                continue;
            }

            report += `\n**Proposed Enrichments:**\n`;
            report += `| Guest Name | Matched LinkedIn | Method | Confidence |\n`;
            report += `| :--- | :--- | :--- | :--- |\n`;

            const assignments: { [guestIndex: number]: { url: string, method: string, confidence: string, score: number } } = {};
            const assignedUrls = new Set<string>();

            // Pass 1: Name Part Match & Fuzzy Match
            guests.forEach((guest, index) => {
                if (!guest.name) return;

                const normGuestName = normalizeString(guest.name);

                // Identify parts of the guest name (first, last)
                const guestNameParts = guest.name.toLowerCase().split(' ').map(p => normalizeString(p)).filter(p => p.length > 2);

                for (const url of uniqueUrls) {
                    if (assignedUrls.has(url)) continue; // Although we might want to evaluate all pairs first? Let's keep it simple for now. 

                    const urlUsername = extractLinkedInUsername(url);
                    if (!urlUsername) continue;

                    // 1. Exact Inclusion (High Confidence)
                    // Check if full first+last name is in username? Or just parts.
                    let matchesPart = false;
                    for (const part of guestNameParts) {
                        if (urlUsername.includes(part)) {
                            matchesPart = true;
                            break;
                        }
                    }

                    if (matchesPart) {
                        // Check if it's already assigned with higher confidence? 
                        // Simplified: First good match takes it, but we should probably score it.
                        if (!assignments[index] || assignments[index].score < 10) {
                            assignments[index] = { url, method: "Name Part Match", confidence: "High", score: 10 };
                        }
                        continue;
                    }

                    // 2. Fuzzy Match (Levenshtein)
                    // Compare urlUsername with guestName (normalized)
                    const chunks = [normGuestName];
                    // Also try FirstLast
                    const firstLast = guestNameParts.join('');
                    if (firstLast) chunks.push(firstLast);

                    for (const chunk of chunks) {
                        const dist = levenshteinDistance(chunk, urlUsername);
                        const similarity = 1 - (dist / Math.max(chunk.length, urlUsername.length));

                        // User mentioned "Stipkovic" vs "cstipkovic" -> 's' vs 'c' or missing letters
                        // Threshold e.g. 0.7
                        if (similarity > 0.6) {
                            if (!assignments[index] || assignments[index].score < 5 + similarity) {
                                assignments[index] = { url, method: `Fuzzy (${similarity.toFixed(2)})`, confidence: "Medium", score: 5 + similarity };
                            }
                        }
                    }
                }
            });

            // Mark matched URLs as assigned
            Object.values(assignments).forEach(a => assignedUrls.add(a.url));

            // Pass 2: Deduction (Elimination)
            // If we have 2 guests, 2 URLs, and 1 is assigned, assign the other.
            if (guests.length === 2 && uniqueUrls.length === 2 && assignedUrls.size === 1) {
                const unassignedGuestIndex = guests.findIndex((_, i) => !assignments[i]);
                const unassignedUrl = uniqueUrls.find(u => !assignedUrls.has(u));

                if (unassignedGuestIndex !== -1 && unassignedUrl) {
                    assignments[unassignedGuestIndex] = {
                        url: unassignedUrl,
                        method: "Deduction (Elimination)",
                        confidence: "Medium",
                        score: 4
                    };
                    assignedUrls.add(unassignedUrl);
                }
            }
            // Also Multi-guest deduction: If N guests, N URLs, N-1 assigned...
            else if (guests.length === uniqueUrls.length && assignedUrls.size === guests.length - 1) {
                const unassignedGuestIndex = guests.findIndex((_, i) => !assignments[i]);
                const unassignedUrl = uniqueUrls.find(u => !assignedUrls.has(u));
                if (unassignedGuestIndex !== -1 && unassignedUrl) {
                    assignments[unassignedGuestIndex] = {
                        url: unassignedUrl,
                        method: "Deduction (Multi-Elimination)",
                        confidence: "Medium",
                        score: 4
                    };
                    assignedUrls.add(unassignedUrl);
                }
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

analyzeGuestLinkedinV2().catch(console.error);
