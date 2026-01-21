import { Firestore } from "@google-cloud/firestore";
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const COLLECTION_EPISODES = "videos";

async function getFirestoreClient() {
    return new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });
}

interface FirestoreEpisode {
    id: string;
    title: string;
    publishedAt: string;
    spotifyUrl: string | null;
}

interface SpotifyJsonEpisode {
    title: string;
    spotifyUrl: string;
}

const FIRESTORE_FILE = 'episodes_to_enrich.json';
const SPOTIFY_JSON_FILE = 'spotify_json_data.json';

function normalizeTitle(title: string): string {
    return title.toLowerCase().trim()
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, ' ');
}

async function main() {
    console.log("Initializing Firestore Client...");

    try {
        const db = await getFirestoreClient();

        // Read data
        const firestoreData: FirestoreEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), FIRESTORE_FILE), 'utf-8'));
        const spotifyData: SpotifyJsonEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), SPOTIFY_JSON_FILE), 'utf-8'));

        // Create lookup map
        const spotifyMap = new Map<string, SpotifyJsonEpisode>();
        spotifyData.forEach(ep => {
            spotifyMap.set(normalizeTitle(ep.title), ep);
        });

        console.log(`Starting update for ${firestoreData.length} target episodes...`);

        let updatedCount = 0;
        let failedCount = 0;

        // Access collection
        const collection = db.collection(COLLECTION_EPISODES);

        // Process in batches (optional but good practice, though simple linear loop works for 200 items in Node script)
        // We will do one by one to ensure logging precision
        for (const fsEp of firestoreData) {
            const normalizedFsTitle = normalizeTitle(fsEp.title);
            let match = spotifyMap.get(normalizedFsTitle);

            if (!match) {
                match = spotifyData.find(s => normalizeTitle(s.title) === normalizedFsTitle);
            }

            if (!match) {
                // Fuzzy contains check (same as report logic)
                match = spotifyData.find(s => {
                    const normS = normalizeTitle(s.title);
                    return normS.includes(normalizedFsTitle) || normalizedFsTitle.includes(normS);
                });
            }

            if (match) {
                if (fsEp.spotifyUrl === match.spotifyUrl) {
                    console.log(`Skipping [${fsEp.id}] - Already up to date.`);
                    continue;
                }

                console.log(`Updating [${fsEp.id}] "${fsEp.title.slice(0, 30)}..." -> ${match.spotifyUrl}`);

                try {
                    await collection.doc(fsEp.id).update({
                        spotifyUrl: match.spotifyUrl
                    });
                    updatedCount++;
                } catch (updateErr) {
                    console.error(`Failed to update ${fsEp.id}:`, updateErr);
                    failedCount++;
                }
            }
        }

        console.log("--------------------------------------------------");
        console.log(`Update Complete.`);
        console.log(`Successfully Updated: ${updatedCount}`);
        console.log(`Failed Updates: ${failedCount}`);

    } catch (error) {
        console.error("Error running update:", error);
        process.exit(1);
    }
}

main().catch(console.error);
