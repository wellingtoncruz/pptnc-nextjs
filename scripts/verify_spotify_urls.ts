
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
    console.log("Verifying Spotify URLs in Firestore...");

    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";

    try {
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where("isFullEpisode", "==", true)
            .get();

        if (snapshot.empty) {
            console.log('No matching documents found to verify.');
            return;
        }

        let populatedCount = 0;
        let totalChecked = 0;
        const examples: string[] = [];

        console.log(`Checking ${snapshot.size} episodes...`);

        snapshot.forEach(doc => {
            const data = doc.data();
            totalChecked++;
            if (data.spotifyUrl) {
                populatedCount++;
                if (examples.length < 5) {
                    examples.push(`[OK] ${data.title.substring(0, 50)}... -> ${data.spotifyUrl}`);
                }
            }
        });

        console.log("\nSample Populated Episodes:");
        examples.forEach(ex => console.log(ex));

        console.log(`\nVerification Summary:`);
        console.log(`Total checked: ${totalChecked}`);
        console.log(`Populated with Spotify URL: ${populatedCount}`);

    } catch (error) {
        console.error("Error verifying episodes:", error);
    }
}

main().catch(console.error);
