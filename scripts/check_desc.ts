
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkEp() {
    const db = new Firestore({ projectId: process.env.GOOGLE_PROJECT_ID, databaseId: "pptnc" });
    const doc = await db.collection("videos").doc("xBvjBhvyc8s").get();
    const data = doc.data();
    if (data) console.log(JSON.stringify(data.description, null, 2));
}
checkEp();
