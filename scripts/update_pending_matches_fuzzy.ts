
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
    publishedAt: any;
}

interface SpotifyJsonEpisode {
    title: string;
    spotifyUrl: string;
}

// --- Levenshtein Distance Implementation ---
function levenshteinDistance(a: string, b: string): number {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function calculateSimilarity(a: string, b: string, distance: number): number {
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1.0;
    return (maxLength - distance) / maxLength;
}

function normalizeTitle(title: string): string {
    return title.toLowerCase().trim()
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, ' ');
}

// --- Main Logic ---
async function main() {
    const PENDING_FILE = 'episodes_pending_enrichment.json';
    const SPOTIFY_JSON_FILE = 'spotify_json_data.json';
    const SIMILARITY_THRESHOLD = 0.65;
    const COLLECTION_EPISODES = "videos";

    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    try {
        console.log("Loading data...");
        const pendingEpisodes: PendingEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), PENDING_FILE), 'utf-8'));
        const spotifyData: SpotifyJsonEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), SPOTIFY_JSON_FILE), 'utf-8'));

        console.log(`Loaded ${pendingEpisodes.length} pending episodes.`);

        const collection = db.collection(COLLECTION_EPISODES);
        let updatedCount = 0;
        let skippedCount = 0;

        console.log(`Starting update process with similarity threshold > ${SIMILARITY_THRESHOLD * 100}%...`);

        for (const ep of pendingEpisodes) {
            const normalizedTarget = normalizeTitle(ep.title);
            let bestMatch: SpotifyJsonEpisode | null = null;
            let minDistance = Infinity;
            let maxSimilarity = 0;

            for (const spotifyEp of spotifyData) {
                const normalizedSource = normalizeTitle(spotifyEp.title);
                const distance = levenshteinDistance(normalizedTarget, normalizedSource);
                const similarity = calculateSimilarity(normalizedTarget, normalizedSource, distance);

                if (distance < minDistance) {
                    minDistance = distance;
                    maxSimilarity = similarity;
                    bestMatch = spotifyEp;
                }
            }

            if (bestMatch && maxSimilarity > SIMILARITY_THRESHOLD) {
                console.log(`[UPDATE] ${maxSimilarity.toFixed(2)} | "${ep.title.slice(0, 30)}..." -> "${bestMatch.title.slice(0, 30)}..."`);

                try {
                    await collection.doc(ep.id).update({
                        spotifyUrl: bestMatch.spotifyUrl
                    });
                    updatedCount++;
                } catch (updateErr) {
                    console.error(`Failed to update ${ep.id}:`, updateErr);
                }

            } else {
                skippedCount++;
            }
        }

        console.log("--------------------------------------------------");
        console.log("Update Complete.");
        console.log(`Successfully Updated: ${updatedCount}`);
        console.log(`Skipped (Low Confidence): ${skippedCount}`);

    } catch (error) {
        console.error("Error executing updates:", error);
        process.exit(1);
    }
}

main().catch(console.error);
