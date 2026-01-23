
import { Firestore } from "@google-cloud/firestore";
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

const SKIP_IDS = [
    "-6lCnDgyd_I", "1o3gWMhPYwI", "6C1RWxgmRJU", "9f8A0WTMek4", "HtcgSGINhJc",
    "LDsAg4iqHGQ", "Lk0L6G3wYNo", "RCyDEjedayw", "VFW-XGTz7Uw", "aGuPtZE3ndI",
    "eEiWW29rFQs", "fs7VZDi1t18", "hQ9fXjrECJ0", "hkPZEBFnqsQ", "nLLdJtOFcZI",
    "ojCYR5rKzOc", "pAvGmLgguF4", "pufz8DYfhrk", "xBvjBhvyc8s", "zt5GRyllUc4"
];

const KNOWN_COHOSTS = [
    "Valdir Scarin",
    "Raphael Lacerda"
];

const IGNORED_NAMES = [
    "Wellington Cruz",
    "Wellington Alves"
];

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

    const acronyms = new Set([
        "CEO", "CTO", "CIO", "COO", "CFO", "CMO", "CPO", "CSO", "CISO",
        "AI", "BI", "TI", "IT", "UX", "UI", "QA", "SRE", "API", "SDK", "ERP", "CRM", "IOT", "M&A",
        "CCEE", "PM3", "SXSW", "AWS", "GCP", "LLM", "RAG", "NFT", "DAO", "DEFI",
        "JSL", "MSD", "CLT", "PJ", "VMBEARS", "VM BEARS", "LGPD", "ESG"
    ]);

    const minorWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'por', 'na', 'no', 'nas', 'nos', 'at']);

    return str.split(' ').map((word, index) => {
        const upper = word.toUpperCase();
        const cleanWord = word.replace(/[^a-zA-Z0-9À-ÿ]/g, "");
        const cleanUpper = cleanWord.toUpperCase();

        if (acronyms.has(cleanUpper)) {
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

    const regex1 = new RegExp(`${escapedName}[,]\\s+([^,.]+?)\\s+(?:da|do|na|no|em|no|at)\\s+([^,.]+?)(?:[.,]|$|\\sue)`, 'i');
    const match1 = normText.match(regex1);

    if (match1) {
        if (match1[1].length < 50) role = match1[1].trim();
        if (match1[2].length < 50) company = match1[2].trim();
    }
    else {
        const regex2 = new RegExp(`${escapedName}\\s*\\(([^)]+)\\)`, 'i');
        const match2 = normText.match(regex2);
        if (match2) {
            const content = match2[1].trim();
            const splitDa = content.split(/\s+(?:da|do|na|no|em|at)\s+/i);
            if (splitDa.length === 2) {
                role = splitDa[0];
                company = splitDa[1];
            } else {
                role = content;
            }
        }
    }
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

async function updateSubsetEpisodes() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";

    console.log(`Updating subset of ${SKIP_IDS.length} episodes...`);
    let updatedCount = 0;
    let skippedCount = 0;

    for (const id of SKIP_IDS) {
        const docRef = db.collection(COLLECTION_EPISODES).doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            console.warn(`Doc ${id} not found.`);
            continue;
        }

        const data = docSnap.data() as EpisodeData;
        const description = data.description || "";
        const cleanDescription = description.replace(/[\n\r]+/g, ' ');

        let guests = (data.guests || []).map(g => ({ ...g }));

        // Check if MANUAL updates exist (guests with LinkedIn)
        // If so, we assume this episode is "done" by the user and we skip our automation.
        const hasManualLinkedin = guests.some(g => g.linkedin && g.linkedin.length > 5);

        if (hasManualLinkedin) {
            console.log(`[${id}] Skipping (Manual update detected)`);
            skippedCount++;
            continue;
        }

        // Apply Logic
        // 1. Detect Co-hosts
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

        if (semanticGuests.length > 0) {
            const newSemanticGuests = semanticGuests.filter(sg => {
                if (IGNORED_NAMES.some(ignored => normalizeString(ignored) === normalizeString(sg))) return false;
                return !isDuplicateGuest(sg, guests);
            });

            newSemanticGuests.forEach(name => {
                const inference = inferRoleAndCompany(name, description);
                guests.push({
                    name: toTitleCase(name),
                    role: toTitleCase(inference.role || ""),
                    company: toTitleCase(inference.company || "")
                });
            });
        }

        // Filter and TitleCase
        const processGuests = guests.filter(g => {
            const normName = normalizeString(g.name);
            return !IGNORED_NAMES.some(ignored => normalizeString(ignored) === normName);
        });

        processGuests.forEach(g => {
            g.name = toTitleCase(g.name);
            if (g.role) g.role = toTitleCase(g.role);
            if (g.company) g.company = toTitleCase(g.company);
        });

        const urls = extractLinkedInUrls(cleanDescription);
        const uniqueUrls = [...new Set(urls)];

        // Matching
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

        const hasMatches = Object.keys(assignments).length > 0;

        if (hasMatches) {
            // Apply matches
            processGuests.forEach((guest, index) => {
                const match = assignments[index];
                if (match) {
                    guest.linkedin = match.url;
                }
            });

            // Persist
            await db.collection(COLLECTION_EPISODES).doc(id).update({ guests: guests });
            console.log(`[${id}] Updated ${Object.keys(assignments).length} guests matched.`);
            updatedCount++;
        } else {
            console.log(`[${id}] No matches found.`);
            skippedCount++;
        }

    } // end for

    console.log(`\nUpdate Complete.`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped: ${skippedCount}`);
}

updateSubsetEpisodes().catch(console.error);
