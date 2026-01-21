
import { Firestore } from "@google-cloud/firestore";
import * as fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function exportRandomChunk() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    // Pick a known ID with chunks from previous report
    const PARENT_ID = "11SReNbnNTw";
    const COLLECTION_EPISODES = "videos";
    const SUBCOLLECTION = "chunks";
    const OUTPUT_FILE = "random_chunk_schema.json";

    try {
        console.log(`Fetching 1 chunk from ${COLLECTION_EPISODES}/${PARENT_ID}/${SUBCOLLECTION}...`);

        const snapshot = await db.collection(COLLECTION_EPISODES)
            .doc(PARENT_ID)
            .collection(SUBCOLLECTION)
            .limit(1)
            .get();

        if (snapshot.empty) {
            console.log("No chunks found for this episode.");
            return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        // Convert timestamps to string for better JSON readability
        const processedData = JSON.parse(JSON.stringify(data, (key, value) => {
            if (value && typeof value === 'object' && value.seconds && value.nanoseconds) {
                return new Date(value.seconds * 1000).toISOString(); // Handle Firestore Timestamp
            }
            return value;
        }));

        console.log(`Fetched chunk ID: ${doc.id}`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(processedData, null, 2));
        console.log(`Schema saved to ${OUTPUT_FILE}`);

    } catch (error) {
        console.error("Error exporting chunk:", error);
        process.exit(1);
    }
}

exportRandomChunk().catch(console.error);
