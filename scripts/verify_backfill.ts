
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function verifyBackfill() {
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

        console.log(`Verifying ${snapshot.size} episodes...`);
        let correctCount = 0;
        let missingCount = 0;
        let mismatchCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const description = data.description || "";
            const descriptionRaw = data.description_raw;

            if (descriptionRaw === undefined) {
                console.warn(`[${doc.id}] MISSING description_raw`);
                missingCount++;
            } else if (descriptionRaw !== description) {
                console.warn(`[${doc.id}] MISMATCH description_raw !== description`);
                console.warn(`  - Desc: ${description.substring(0, 30)}...`);
                console.warn(`  - Raw:  ${descriptionRaw.substring(0, 30)}...`);
                mismatchCount++;
            } else {
                correctCount++;
            }
        }

        console.log(`\nVerification Complete.`);
        console.log(`Correct: ${correctCount}`);
        console.log(`Missing: ${missingCount}`);
        console.log(`Mismatch: ${mismatchCount}`);

    } catch (error) {
        console.error("Error verifying db:", error);
    }
}

verifyBackfill().catch(console.error);
