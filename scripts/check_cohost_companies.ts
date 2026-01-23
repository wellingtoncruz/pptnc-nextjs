
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface Guest {
    name: string;
    role?: string;
    company?: string;
    [key: string]: any;
}

interface EpisodeData {
    title?: string;
    guests?: Guest[];
    [key: string]: any;
}

async function checkCohostCompanies() {
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
        let foundCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data() as EpisodeData;
            const guests = data.guests || [];

            guests.forEach(guest => {
                const role = (guest.role || "").toLowerCase();
                const company = guest.company;

                // Check for "co-host" variations
                if (role.includes("co-host") || role.includes("cohost")) {
                    // Check if company is set and meaningful (not empty or "-")
                    if (company && company.trim() !== "" && company.trim() !== "-") {
                        console.log(`[${doc.id}] ${guest.name}`);
                        console.log(`    Role: ${guest.role}`);
                        console.log(`    Company: ${company}`);
                        foundCount++;
                    }
                }
            });
        }

        console.log(`\nCheck complete.`);
        console.log(`Found ${foundCount} co-hosts with company set.`);

    } catch (error) {
        console.error("Error checking db:", error);
    }
}

checkCohostCompanies().catch(console.error);
