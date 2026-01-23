
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function debugGuestStructure() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";

    const snapshot = await db.collection(COLLECTION_EPISODES)
        .where('isFullEpisode', '==', true)
        .limit(5)
        .get();

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`\nEpisode: ${data.title}`);
        if (data.guests && data.guests.length > 0) {
            console.log("First Guest Structure:", JSON.stringify(data.guests[0], null, 2));
        } else {
            console.log("No guests array or empty.");
        }
    });
}

debugGuestStructure().catch(console.error);
