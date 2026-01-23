
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkEpisode() {
    const db = new Firestore({ projectId: process.env.GOOGLE_PROJECT_ID, databaseId: "pptnc" });
    const EPISODE_ID = "mnrdV8-3u1U"; // The one selected previously

    const doc = await db.collection("videos").doc(EPISODE_ID).get();
    if (!doc.exists) {
        console.log("Episode not found");
        return;
    }
    const data = doc.data();
    console.log(`Title: ${data?.title}`);
    console.log("Guests Array:", JSON.stringify(data?.guests, null, 2));
}

checkEpisode().catch(console.error);
