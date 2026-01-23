
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

function extractGuestsSemantically(text: string): string[] {
    const candidates: string[] = [];
    const anchors = ["conversa com", "recebe", "bate um papo com", "convidados:"];
    const normText = text.replace(/[\n\r]+/g, ' ');

    anchors.forEach(anchor => {
        const regex = new RegExp(`${anchor}\\s+((?:[A-ZÀ-ÿ][a-zà-ÿ]+(?:\\s+(?:da|de|do|dos|das|e)\\s+)?(?:[A-ZÀ-ÿ][a-zà-ÿ]+\\s*)*,?)+)`, 'gi');
        let match;
        while ((match = regex.exec(normText)) !== null) {
            const captured = match[1];
            const split = captured.split(/,|\se\s/);
            split.forEach(s => {
                const clean = s.trim();
                // Filter basic generic words
                if (clean.length > 2) {
                    candidates.push(clean);
                }
            });
        }
    });

    return candidates;
}

// Check if name is a duplicate/fuzzy match of existing
function isDuplicateGuest(candidate: string, existingGuests: Guest[]): boolean {
    const normCandidate = normalizeString(candidate);

    for (const g of existingGuests) {
        if (!g.name) continue;
        const normExisting = normalizeString(g.name);

        // 1. Direct inclusion (substring)
        if (normExisting.includes(normCandidate) || normCandidate.includes(normExisting)) {
            return true;
        }

        // 2. Fuzzy match
        const dist = levenshteinDistance(normCandidate, normExisting);
        const similarity = 1 - (dist / Math.max(normCandidate.length, normExisting.length));
        if (similarity > 0.8) { // Strict fuzzy for duplicate detection
            return true;
        }
    }
    return false;
}

async function analyzeGuestLinkedinV6() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const REPORT_FILE = "guest_linkedin_preview_v6.md";
    const TARGET_IDS = ['Hw92hyNTvPI', 'zt5GRyllUc4', 'vvmXlbNwtQk', 'p2GYFWmzUp8', 'sRrpDPUChyQ', 'e5952Hbr9Xg']; // Problematic ones + new target
    const RANDOM_SAMPLE_SIZE = 9;

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

        let report = `# Guest LinkedIn Enrichment Analysis V6 (Uniqueness & Deduplication)\n\n`;

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

            // 2. Semantic Extraction (Filtered)
            const semanticGuests = extractGuestsSemantically(description);
            if (semanticGuests.length > 0) {
                const newSemanticGuests = semanticGuests.filter(sg => {
                    // Filter Ignored Names
                    if (IGNORED_NAMES.some(ignored => normalizeString(ignored) === normalizeString(sg))) return false;
                    // Filter duplicates against *current* guests list
                    return !isDuplicateGuest(sg, guests);
                });

                if (newSemanticGuests.length > 0) {
                    report += `> **Analysis**: Semantic extraction added: ${newSemanticGuests.join(', ')}.\n`;
                    newSemanticGuests.forEach(name => guests.push({ name }));
                } else {
                    // report += `> **Analysis**: Semantic extraction found '${semanticGuests.join(', ')}' but they were duplicates/ignored.\n`;
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
            report += `| Guest Name | Matched LinkedIn | Method | Confidence | Score |\n`;
            report += `| :--- | :--- | :--- | :--- | :--- |\n`;

            // Global Assignments Map: GuestIndex -> Best Match
            // We want to verify 1-to-1: One URL cannot be assigned to multiple guests.
            // Approach: Calculate ALL scores for (Guest, URL) pairs. Sort by score. Assign greedily.

            interface MatchCandidate {
                guestIndex: number;
                url: string;
                method: string;
                confidence: string;
                score: number;
            }

            const allCandidates: MatchCandidate[] = [];

            processGuests.forEach((guest, index) => {
                if (!guest.name) return;
                const normGuestName = normalizeString(guest.name);
                const guestNameParts = guest.name.toLowerCase().split(' ').map(p => normalizeString(p)).filter(p => p.length > 2);

                for (const url of uniqueUrls) {
                    const urlUsername = extractLinkedInUsername(url);
                    if (!urlUsername) continue;

                    // 1. Exact Inclusion (High Score)
                    let matchesPart = false;
                    for (const part of guestNameParts) {
                        if (urlUsername.includes(part)) {
                            matchesPart = true;
                            break;
                        }
                    }

                    if (matchesPart) {
                        // Longer part match is better? e.g. "Melanie" vs "Mel"
                        // Base score 10. Bonus for length of matched part?
                        allCandidates.push({
                            guestIndex: index,
                            url: url,
                            method: "Name Part Match",
                            confidence: "High",
                            score: 10
                        });
                    }

                    // 2. Fuzzy Match
                    const chunks = [normGuestName];
                    if (guestNameParts.length > 0) chunks.push(guestNameParts.join('')); // FirstLast

                    for (const chunk of chunks) {
                        const dist = levenshteinDistance(chunk, urlUsername);
                        const similarity = 1 - (dist / Math.max(chunk.length, urlUsername.length));

                        // Strict threshold for fuzzy
                        if (similarity > 0.6) {
                            allCandidates.push({
                                guestIndex: index,
                                url: url,
                                method: `Fuzzy (${similarity.toFixed(2)})`,
                                confidence: "Medium",
                                score: 5 + similarity
                            });
                        }
                    }
                }
            });

            // Greedy Assignment
            // Sort by Score Descending
            allCandidates.sort((a, b) => b.score - a.score);

            const assignments: { [guestIndex: number]: MatchCandidate } = {};
            const assignedUrls = new Set<string>();
            const assignedGuests = new Set<number>();

            for (const cand of allCandidates) {
                if (assignedGuests.has(cand.guestIndex)) continue; // Guest already has a better match
                if (assignedUrls.has(cand.url)) continue; // URL already assigned to a better match

                assignments[cand.guestIndex] = cand;
                assignedGuests.add(cand.guestIndex);
                assignedUrls.add(cand.url);
            }

            // Pass 2: Deduction (Elimination)
            if (processGuests.length <= uniqueUrls.length) {
                const unassignedGuestsIndices = processGuests.map((_, i) => i).filter(i => !assignments[i]);
                const unassignedUrlsList = uniqueUrls.filter(u => !assignedUrls.has(u));

                if (unassignedGuestsIndices.length === 1 && unassignedUrlsList.length === 1) {
                    const idx = unassignedGuestsIndices[0];
                    assignments[idx] = {
                        guestIndex: idx,
                        url: unassignedUrlsList[0],
                        method: "Deduction (Single Elimination)",
                        confidence: "Medium",
                        score: 4
                    };
                    assignedUrls.add(unassignedUrlsList[0]);
                    assignedGuests.add(idx);
                }
            }

            // Generate Report Table
            processGuests.forEach((guest, index) => {
                const match = assignments[index];
                if (match) {
                    report += `| ${guest.name} | ${match.url} | ${match.method} | ${match.confidence} | ${match.score.toFixed(2)} |\n`;
                } else {
                    report += `| ${guest.name} | *Not Found* | - | - | - |\n`;
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

analyzeGuestLinkedinV6().catch(console.error);
