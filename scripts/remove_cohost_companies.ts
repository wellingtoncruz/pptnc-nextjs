
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

async function removeCohostCompanies() {
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

        for (const doc of snapshot.docs) {
            const data = doc.data() as EpisodeData;
            let guests = data.guests || [];
            let modified = false;

            guests = guests.map(guest => {
                const role = (guest.role || "").toLowerCase();
                const company = guest.company;

                if (role.includes("co-host") || role.includes("cohost")) {
                    if (company && company.trim() !== "" && company.trim() !== "-") {
                        console.log(`[${doc.id}] Removing company '${company}' from ${guest.name} (${guest.role})`);
                        // Remove the company property
                        delete guest.company;
                        modified = true;
                    }
                }
                return guest;
            });

            if (modified) {
                await db.collection(COLLECTION_EPISODES).doc(doc.id).update({ guests: guests });
                console.log(`Updated ${doc.id}`);
                updatedCount++;
            }
        }

        console.log(`\nCleanup complete.`);
        console.log(`Updated ${updatedCount} episodes.`);

    } catch (error) {
        console.error("Error removing co-host companies:", error);
    }
}

removeCohostCompanies().catch(console.error);
