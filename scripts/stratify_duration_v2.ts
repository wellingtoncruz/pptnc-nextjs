
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function stratifyDuration() {
    // Force specific database ID based on user instruction
    const databaseId = "pptnc-stage";
    console.log(`Using Database ID: ${databaseId}`);

    const db = new Firestore({ projectId: process.env.GOOGLE_PROJECT_ID, databaseId: databaseId });
    const snapshot = await db.collection("videos").get();

    console.log(`Found ${snapshot.size} videos to process.`);

    let updatedCount = 0;
    const batchSize = 400;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const duration = data.duration || 0;
        let episodeKind = "";
        let isFullEpisode = false;

        if (duration < 60) {
            episodeKind = "short";
            isFullEpisode = false;
        } else if (duration < 3600) {
            episodeKind = "cut";
            isFullEpisode = false;
        } else {
            episodeKind = "full";
            isFullEpisode = true;
        }

        // Check if update is needed to avoid unnecessary writes
        if (data.episodeKind !== episodeKind || data.isFullEpisode !== isFullEpisode) {
            const updateData = {
                episodeKind: episodeKind,
                isFullEpisode: isFullEpisode
            };

            batch.update(doc.ref, updateData);
            updatedCount++;
            batchCount++;

            if (batchCount >= batchSize) {
                await batch.commit();
                console.log(`Committed batch of ${batchCount} updates.`);
                batch = db.batch();
                batchCount = 0;
            }
        }
    }

    if (batchCount > 0) {
        await batch.commit();
        console.log(`Committed final batch of ${batchCount} updates.`);
    }

    console.log(`Stratification complete. Updated ${updatedCount} videos.`);
}

stratifyDuration().catch(console.error);
