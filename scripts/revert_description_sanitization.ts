
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function revertSanitization() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";

    try {
        console.log(`Fetching ALL full episodes for REVERT...`);
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where('isFullEpisode', '==', true)
            .get();

        if (snapshot.empty) {
            console.log("No full episodes found.");
            return;
        }

        console.log(`Processing ${snapshot.size} episodes...`);
        let updatedCount = 0;
        let batch = db.batch();
        let batchCount = 0;
        const BATCH_LIMIT = 400;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const description = data.description;
            const descriptionRaw = data.description_raw;

            if (descriptionRaw && description !== descriptionRaw) {
                const docRef = db.collection(COLLECTION_EPISODES).doc(doc.id);
                batch.update(docRef, { description: descriptionRaw });
                batchCount++;
                updatedCount++;
            }

            if (batchCount >= BATCH_LIMIT) {
                await batch.commit();
                console.log(`Committed batch of ${batchCount} reverts.`);
                batch = db.batch();
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
            console.log(`Committed final batch of ${batchCount} reverts.`);
        }

        console.log(`\nRevert Complete.`);
        console.log(`Restored ${updatedCount} episodes from 'description_raw'.`);

    } catch (error) {
        console.error("Error reverting:", error);
    }
}

revertSanitization().catch(console.error);
