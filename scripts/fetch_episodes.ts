import { getFirestoreClient, COLLECTION_EPISODES } from "../src/lib/datastore/client";
import * as fs from "fs";
import * as path from "path";
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function main() {
    console.log("Initializing Firestore Client...");

    try {
        const db = await getFirestoreClient();
        console.log(`Fetching from collection: ${COLLECTION_EPISODES}`);

        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where("isFullEpisode", "==", true)
            .get();

        if (snapshot.empty) {
            console.log('No matching documents.');
            return;
        }

        const episodes = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title,
                publishedAt: data.publishedAt?.toDate ? data.publishedAt.toDate().toISOString() : data.publishedAt,
                spotifyUrl: data.spotifyUrl || null
            };
        });

        console.log(`Found ${episodes.length} episodes.`);

        const outputPath = path.join(process.cwd(), "episodes_to_enrich.json");
        fs.writeFileSync(outputPath, JSON.stringify(episodes, null, 2));
        console.log(`Saved to ${outputPath}`);

    } catch (error) {
        console.error("Error fetching episodes:", error);
        process.exit(1);
    }
}

main().catch(console.error);
