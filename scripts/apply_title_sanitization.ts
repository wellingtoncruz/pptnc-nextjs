
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function applyTitleSanitization() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const TARGET_SUFFIX = " | PPT Não Compila Podcast";

    try {
        console.log(`Fetching full episodes to check for updates...`);
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where('isFullEpisode', '==', true)
            .get();

        if (snapshot.empty) {
            console.log("No full episodes found.");
            return;
        }

        console.log(`Scanning ${snapshot.size} episodes...`);

        let updatedCount = 0;
        let errorCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const currentTitle = data.title || "";

            if (currentTitle.endsWith(TARGET_SUFFIX)) {
                // Truncate the suffix
                const newTitle = currentTitle.slice(0, -TARGET_SUFFIX.length).trim();

                try {
                    await doc.ref.update({ title: newTitle });
                    console.log(`[UPDATED] ${doc.id}: "${currentTitle.slice(0, 30)}..." -> "${newTitle.slice(0, 30)}..."`);
                    updatedCount++;
                } catch (err) {
                    console.error(`[ERROR] Failed to update ${doc.id}:`, err);
                    errorCount++;
                }
            }
        }

        console.log("-----------------------------------------");
        console.log("Title Sanitization Complete.");
        console.log(`Successfully Updated: ${updatedCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log(`Total Scanned: ${snapshot.size}`);

    } catch (error) {
        console.error("Error applying sanitization:", error);
        process.exit(1);
    }
}

applyTitleSanitization().catch(console.error);
