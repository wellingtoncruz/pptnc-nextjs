
import { Firestore } from "@google-cloud/firestore";
import * as fs from "fs";
import * as path from "path";
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const COLLECTION_EPISODES = "videos";

async function main() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    try {
        console.log(`Fetching from collection: ${COLLECTION_EPISODES}`);

        // Fetch all full episodes
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where("isFullEpisode", "==", true)
            .get();

        if (snapshot.empty) {
            console.log('No matching documents.');
            return;
        }

        interface PendingEpisode {
            id: string;
            title: string;
            description: string;
            publishedAt: any;
        }
        const pendingEpisodes: PendingEpisode[] = [];
        let skippedCount = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            // Check if spotifyUrl is missing or null or empty
            if (!data.spotifyUrl) {
                pendingEpisodes.push({
                    id: doc.id,
                    title: data.title,
                    description: data.description || "",
                    publishedAt: data.publishedAt?.toDate ? data.publishedAt.toDate().toISOString() : data.publishedAt,
                });
            } else {
                skippedCount++;
            }
        });

        console.log(`Total Full Episodes: ${snapshot.size}`);
        console.log(`Already Enriched: ${skippedCount}`);
        console.log(`Pending Enrichment: ${pendingEpisodes.length}`);

        const outputPath = path.join(process.cwd(), "episodes_pending_enrichment.json");
        fs.writeFileSync(outputPath, JSON.stringify(pendingEpisodes, null, 2));
        console.log(`Saved ${pendingEpisodes.length} pending episodes to ${outputPath}`);

    } catch (error) {
        console.error("Error fetching episodes:", error);
        process.exit(1);
    }
}

main().catch(console.error);
