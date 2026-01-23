
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const TARGET_IDS = [
    "HtcgSGINhJc",
    "Lk0L6G3wYNo",
    "fs7VZDi1t18",
    "hkPZEBFnqsQ",
    "nLLdJtOFcZI",
    "xBvjBhvyc8s"
];

async function clearGuests() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";

    console.log(`Clearing guests for ${TARGET_IDS.length} episodes...`);

    for (const id of TARGET_IDS) {
        const docRef = db.collection(COLLECTION_EPISODES).doc(id);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            await docRef.update({ guests: [] });
            console.log(`[${id}] Guests cleared.`);
        } else {
            console.warn(`[${id}] Document not found.`);
        }
    }
    console.log("\nCleanup Complete.");
}

clearGuests().catch(console.error);
