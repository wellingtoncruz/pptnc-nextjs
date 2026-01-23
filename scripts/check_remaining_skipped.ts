
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const SKIP_IDS = [
    "-6lCnDgyd_I", "1o3gWMhPYwI", "6C1RWxgmRJU", "9f8A0WTMek4", "HtcgSGINhJc",
    "LDsAg4iqHGQ", "Lk0L6G3wYNo", "RCyDEjedayw", "VFW-XGTz7Uw", "aGuPtZE3ndI",
    "eEiWW29rFQs", "fs7VZDi1t18", "hQ9fXjrECJ0", "hkPZEBFnqsQ", "nLLdJtOFcZI",
    "ojCYR5rKzOc", "pAvGmLgguF4", "pufz8DYfhrk", "xBvjBhvyc8s", "zt5GRyllUc4"
];

async function checkRemaining() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    let count = 0;

    console.log("\n--- Remaining Skipped Episodes (No LinkedIn) ---\n");

    for (const id of SKIP_IDS) {
        const doc = await db.collection(COLLECTION_EPISODES).doc(id).get();
        if (!doc.exists) continue;
        const data = doc.data();
        const guests = data?.guests || [];

        const hasLinkedin = guests.some((g: any) => g.linkedin && g.linkedin.length > 5);

        if (!hasLinkedin) {
            console.log(`${id} | ${data?.title}`);
            count++;
        }
    }
    console.log(`\nTotal Remaining: ${count}`);
}

checkRemaining().catch(console.error);
