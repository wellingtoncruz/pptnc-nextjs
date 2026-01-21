
import { Firestore } from "@google-cloud/firestore";
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// --- Interfaces ---
interface PendingEpisode {
    id: string;
    title: string;
    description: string;
    publishedAt: string;
}

interface SpotifyJsonEpisode {
    title: string;
    description: string;
    spotifyUrl: string;
    release_date: string;
}

// --- Helper Functions ---
function levenshteinDistance(a: string, b: string): number {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
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

function calculateTitleSimilarity(a: string, b: string): number {
    const normA = normalize(a);
    const normB = normalize(b);
    const maxLength = Math.max(normA.length, normB.length);
    if (maxLength === 0) return 1.0;
    const distance = levenshteinDistance(normA, normB);
    return (maxLength - distance) / maxLength;
}

function calculateDateScore(dateA: string, dateB: string): number {
    if (!dateA || !dateB) return 0;
    const d1 = new Date(dateA).getTime();
    const d2 = new Date(dateB).getTime();
    if (isNaN(d1) || isNaN(d2)) return 0;
    const diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
    if (diffDays <= 2) return 1.0;
    if (diffDays <= 7) return 0.8;
    if (diffDays <= 14) return 0.5;
    if (diffDays <= 30) return 0.2;
    return 0.0;
}

function calculateDescriptionSimilarity(descA: string, descB: string): number {
    const setA = new Set(tokenize(descA));
    const setB = new Set(tokenize(descB));
    if (setA.size === 0 || setB.size === 0) return 0;
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
}

function normalize(text: string): string {
    return (text || "").toLowerCase().trim().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
}

function tokenize(text: string): string[] {
    return normalize(text).replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").split(/\s+/).filter(w => w.length > 3);
}

// --- Main Logic ---
async function main() {
    const PENDING_FILE = 'episodes_pending_enrichment.json';
    const SPOTIFY_JSON_FILE = 'spotify_json_data.json';
    const COLLECTION_EPISODES = "videos";
    const SCORE_THRESHOLD = 0.0; // User requested to persist all matches

    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    try {
        console.log("Loading data...");
        const pendingEpisodes: PendingEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), PENDING_FILE), 'utf-8'));
        const spotifyData: SpotifyJsonEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), SPOTIFY_JSON_FILE), 'utf-8'));

        console.log("Fetching existing Spotify URLs to check for duplicates...");
        const existingSnapshot = await db.collection(COLLECTION_EPISODES)
            .where("spotifyUrl", "!=", null) // Only those that have one
            .get();

        const existingSpotifyUrls = new Map<string, string>(); // URL -> Document ID
        existingSnapshot.forEach(doc => {
            const url = doc.data().spotifyUrl;
            if (url) existingSpotifyUrls.set(url.trim(), doc.id);
        });
        console.log(`Found ${existingSpotifyUrls.size} existing unique Spotify URLs.`);

        const collection = db.collection(COLLECTION_EPISODES);
        let updatedCount = 0;
        let duplicateSkipCount = 0;
        let scoreSkipCount = 0;

        console.log(`Processing updates for ${pendingEpisodes.length} episodes (Threshold > ${SCORE_THRESHOLD})...`);

        for (const ep of pendingEpisodes) {
            let bestMatch: SpotifyJsonEpisode | null = null;
            let highestScore = 0;

            for (const spotifyEp of spotifyData) {
                const dateScore = calculateDateScore(ep.publishedAt, spotifyEp.release_date);
                const titleSim = calculateTitleSimilarity(ep.title, spotifyEp.title);
                const descSim = calculateDescriptionSimilarity(ep.description, spotifyEp.description);

                let totalScore = (titleSim * 0.5) + (dateScore * 0.3) + (descSim * 0.2);
                if (titleSim > 0.8 && dateScore > 0.8) totalScore += 0.1;

                if (totalScore > highestScore) {
                    highestScore = totalScore;
                    bestMatch = spotifyEp;
                }
            }

            if (bestMatch && highestScore > SCORE_THRESHOLD) {
                const targetUrl = bestMatch.spotifyUrl.trim();

                // --- DUPLICATE CHECK ---
                if (existingSpotifyUrls.has(targetUrl)) {
                    const existingId = existingSpotifyUrls.get(targetUrl);
                    if (existingId !== ep.id) {
                        console.log(`[SKIP] Duplicate URL found: ${targetUrl} (Exists in ${existingId}) -> Skipping ${ep.id}`);
                        duplicateSkipCount++;
                        continue;
                    }
                }

                console.log(`[UPDATE] Score ${highestScore.toFixed(2)} | "${ep.title.slice(0, 30)}..." -> "${bestMatch.title.slice(0, 30)}..."`);

                try {
                    await collection.doc(ep.id).update({
                        spotifyUrl: targetUrl
                    });

                    // Update checking map in case another episode tries to use it in this run
                    existingSpotifyUrls.set(targetUrl, ep.id);
                    updatedCount++;
                } catch (updateErr) {
                    console.error(`Failed to update ${ep.id}:`, updateErr);
                }

            } else {
                scoreSkipCount++;
            }
        }

        console.log("--------------------------------------------------");
        console.log("Advanced Update Complete.");
        console.log(`Successfully Updated: ${updatedCount}`);
        console.log(`Skipped (Duplicate URL): ${duplicateSkipCount}`);
        console.log(`Skipped (Low Score): ${scoreSkipCount}`);

    } catch (error) {
        console.error("Error executing updates:", error);
        process.exit(1);
    }
}

main().catch(console.error);
