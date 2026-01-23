
import { Firestore } from "@google-cloud/firestore";
import * as fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface Guest {
    name: string;
    linkedin?: string;
    role?: string;
    company?: string;
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

function toTitleCase(str: string): string {
    if (!str) return "";

    // Known acronyms that should be kept Uppercase
    const acronyms = new Set([
        "CEO", "CTO", "CIO", "COO", "CFO", "CMO", "CPO", "CSO", "CISO",
        "AI", "BI", "TI", "IT", "UX", "UI", "QA", "SRE", "API", "SDK", "ERP", "CRM", "IOT", "M&A",
        "CCEE", "PM3", "SXSW", "AWS", "GCP", "LLM", "RAG", "NFT", "DAO", "DEFI",
        "JSL", "MSD", "CLT", "PJ", "VMBEARS", "VM BEARS", "LGPD", "ESG"
    ]);

    // Minor words that should be lowercase (unless first)
    const minorWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'por', 'na', 'no', 'nas', 'nos', 'at']);

    return str.split(' ').map((word, index) => {
        const upper = word.toUpperCase();
        // Remove trailing punctuation for check if needed, but simplistic approach first:
        // Let's handle clean word check:
        const cleanWord = word.replace(/[^a-zA-Z0-9À-ÿ]/g, "");
        const cleanUpper = cleanWord.toUpperCase();

        if (acronyms.has(cleanUpper)) {
            // Restore punctuation if any
            return upper.replace(cleanUpper, cleanUpper); // This might be tricky if casing mixed.
            // Safer: Just return the uppercase variant if it matches strict acronym list
            return upper;
        }

        const lower = word.toLowerCase();
        if (index > 0 && minorWords.has(lower)) {
            return lower;
        }

        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
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

// Infer role and company
function inferRoleAndCompany(guestName: string, text: string): { role?: string, company?: string } {
    const escapedName = guestName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normText = text.replace(/[\n\r]+/g, ' ');

    let role = undefined;
    let company = undefined;

    // Pattern 1: "Name, Role da Company"
    // "Thiago Rolemberg, CTO da Cloudwalk"
    // Regex logic: Name + comma + (Role words) + (da/do/na/no/em/at) + (Company words)
    // Limits: Role < 50 chars, Company < 50 chars. Stop at punctuation or connectors.
    // NOTE: This is heuristic.

    const regex1 = new RegExp(`${escapedName}[,]\\s+([^,.]+?)\\s+(?:da|do|na|no|em|no|at)\\s+([^,.]+?)(?:[.,]|$|\\sue)`, 'i');
    const match1 = normText.match(regex1);

    if (match1) {
        if (match1[1].length < 50) role = match1[1].trim();
        if (match1[2].length < 50) company = match1[2].trim();
    }
    else {
        // Pattern 2: "Name (Role)" or "Name (Role da Company)"
        const regex2 = new RegExp(`${escapedName}\\s*\\(([^)]+)\\)`, 'i');
        const match2 = normText.match(regex2);
        if (match2) {
            const content = match2[1].trim();
            // Check if it has " da " inside parens
            const splitDa = content.split(/\s+(?:da|do|na|no|em|at)\s+/i);
            if (splitDa.length === 2) {
                role = splitDa[0];
                company = splitDa[1];
            } else {
                role = content;
            }
        }
        else {
            // Pattern 3: "Role da Company, Name" - Skipping for simplicity/risk
        }
    }

    // Clean up role/company (remove stopwords at end?)
    return { role, company };
}


function isDuplicateGuest(candidate: string, existingGuests: Guest[]): boolean {
    const normCandidate = normalizeString(candidate);
    for (const g of existingGuests) {
        if (!g.name) continue;
        const normExisting = normalizeString(g.name);
        if (normExisting.includes(normCandidate) || normCandidate.includes(normExisting)) {
            return true;
        }
        const dist = levenshteinDistance(normCandidate, normExisting);
        const similarity = 1 - (dist / Math.max(normCandidate.length, normExisting.length));
        if (similarity > 0.8) {
            return true;
        }
    }
    return false;
}

async function updateDatabase() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";

    try {
        console.log(`Fetching ALL full episodes...`);
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where('isFullEpisode', '==', true)
            .get();

        if (snapshot.empty) {
            console.log("No full episodes found.");
            return;
        }

        console.log(`Processing ${snapshot.size} episodes...`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data() as EpisodeData;
            const title = data.title || "No Title";
            let description = data.description || "";
            const cleanDescription = description.replace(/[\n\r]+/g, ' ');

            let guests = (data.guests || []).map(g => ({ ...g }));

            // 1. Detect Co-hosts (Prevent Company Inference)
            KNOWN_COHOSTS.forEach(cohost => {
                const normCohost = normalizeString(cohost);
                const normDesc = normalizeString(cleanDescription);
                if (normDesc.includes(normCohost)) {
                    const exists = guests.some(g => normalizeString(g.name).includes(normCohost) || normCohost.includes(normalizeString(g.name)));
                    if (!exists) {
                        guests.push({ name: cohost, role: "Co-host" });
                    }
                }
            });

            // 2. Semantic Extraction
            const semanticGuests = extractGuestsSemantically(description);
            // const addedSemantically: string[] = [];

            if (semanticGuests.length > 0) {
                const newSemanticGuests = semanticGuests.filter(sg => {
                    if (IGNORED_NAMES.some(ignored => normalizeString(ignored) === normalizeString(sg))) return false;
                    return !isDuplicateGuest(sg, guests);
                });

                newSemanticGuests.forEach(name => {
                    // Infer Role & Company
                    const inference = inferRoleAndCompany(name, description);

                    guests.push({
                        name: toTitleCase(name),
                        role: toTitleCase(inference.role || ""),
                        company: toTitleCase(inference.company || "")
                    });
                });
            }

            // Filter out Ignored Names from matching pool, but we KEEP them in guests array which is what we save.
            const processGuests = guests.filter(g => {
                const normName = normalizeString(g.name);
                return !IGNORED_NAMES.some(ignored => normalizeString(ignored) === normName);
            });

            // Ensure Title Case for ALL processed guests
            processGuests.forEach(g => {
                g.name = toTitleCase(g.name);
                if (g.role) g.role = toTitleCase(g.role);
                if (g.company) g.company = toTitleCase(g.company);
            });

            const urls = extractLinkedInUrls(cleanDescription);
            const uniqueUrls = [...new Set(urls)];

            // Matching Logic
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

                    let matchesPart = false;
                    for (const part of guestNameParts) {
                        if (urlUsername.includes(part)) {
                            matchesPart = true;
                            break;
                        }
                    }

                    if (matchesPart) {
                        allCandidates.push({
                            guestIndex: index,
                            url: url,
                            method: "Name Part Match",
                            confidence: "High",
                            score: 10
                        });
                    }

                    const chunks = [normGuestName];
                    if (guestNameParts.length > 0) chunks.push(guestNameParts.join(''));

                    for (const chunk of chunks) {
                        const dist = levenshteinDistance(chunk, urlUsername);
                        const similarity = 1 - (dist / Math.max(chunk.length, urlUsername.length));

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

            allCandidates.sort((a, b) => b.score - a.score);

            const assignments: { [guestIndex: number]: MatchCandidate } = {};
            const assignedUrls = new Set<string>();
            const assignedGuests = new Set<number>();

            for (const cand of allCandidates) {
                if (assignedGuests.has(cand.guestIndex)) continue;
                if (assignedUrls.has(cand.url)) continue;

                assignments[cand.guestIndex] = cand;
                assignedGuests.add(cand.guestIndex);
                assignedUrls.add(cand.url);
            }

            // Deduction
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


            // APPLY UPDATES
            const hasMatches = Object.keys(assignments).length > 0;

            if (hasMatches) {
                // Apply assigned URLs to guests
                processGuests.forEach((guest, index) => {
                    const match = assignments[index];
                    if (match) {
                        guest.linkedin = match.url;
                    }
                });

                // Since processGuests hold references to objects inside `guests`, `guests` is now updated.
                // We perform the write operation.

                await db.collection(COLLECTION_EPISODES).doc(doc.id).update({ guests: guests });
                console.log(`Updated ${doc.id}: ${guests.length} guests.`);
                updatedCount++;
            } else {
                skippedCount++;
            }

        }

        console.log(`Update complete.`);
        console.log(`Updated: ${updatedCount} episodes.`);
        console.log(`Skipped: ${skippedCount} episodes.`);

    } catch (error) {
        console.error("Error updating db:", error);
        process.exit(1);
    }
}

updateDatabase().catch(console.error);
