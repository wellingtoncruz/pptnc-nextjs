
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function backfillDescriptionRaw() {
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
        let batch = db.batch();
        let batchCount = 0;
        const BATCH_LIMIT = 400; // Firestore limit is 500

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const description = data.description || "";

            // Update description_raw with description
            const docRef = db.collection(COLLECTION_EPISODES).doc(doc.id);
            batch.update(docRef, { description_raw: description });
            batchCount++;
            updatedCount++;

            if (batchCount >= BATCH_LIMIT) {
                await batch.commit();
                console.log(`Committed batch of ${batchCount} updates.`);
                batch = db.batch();
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
            console.log(`Committed final batch of ${batchCount} updates.`);
        }

        console.log(`\nBackfill Complete.`);
        console.log(`Updated ${updatedCount} episodes with 'description_raw'.`);

    } catch (error) {
        console.error("Error backfilling db:", error);
    }
}

backfillDescriptionRaw().catch(console.error);
