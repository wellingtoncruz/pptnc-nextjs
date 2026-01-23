
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface Guest {
    name: string;
    linkedin: string;
    episodeId: string; // Just for reference
    role?: string;
    company?: string;
}

async function preparePhotoList() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const OUTPUT_FILE = "guests_for_photos.json";

    try {
        console.log(`Fetching episodes...`);
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where('isFullEpisode', '==', true)
            .get();

        // Filter for episodes that actually have guests with LinkedIn
        const episodesWithGuests = snapshot.docs.map(doc => {
            const data = doc.data();
            const validGuests = (data.guests || []).filter((g: any) => g.linkedin && g.linkedin.includes('linkedin.com'));
            return { doc, validGuests };
        }).filter(item => item.validGuests.length > 0); // All episodes with at least 1 valid guest

        if (episodesWithGuests.length === 0) {
            console.log("No episodes with valid guests found.");
            return;
        }

        // Process ALL Episodes
        const selectedEpisodes = episodesWithGuests;

        const selectedGuests: Guest[] = [];

        selectedEpisodes.forEach(selection => {
            const doc = selection.doc;
            const data = doc.data();
            console.log(`\nSelected Episode: ${data.title} (${doc.id})`);

            data.guests.forEach((guest: any) => {
                // Determine if valid linkedIn
                if (guest.linkedin && guest.linkedin.includes('linkedin.com')) {
                    selectedGuests.push({
                        name: guest.name,
                        linkedin: guest.linkedin,
                        episodeId: doc.id,
                        role: guest.role,
                        company: guest.company
                    });
                }
            });
        });

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(selectedGuests, null, 2));
        console.log(`\nFound ${selectedGuests.length} guests for this episode:`);
        selectedGuests.forEach((g, i) => console.log(`${i + 1}. ${g.name} (${g.linkedin})`));

    } catch (error) {
        console.error("Error preparing list:", error);
    }
}

preparePhotoList().catch(console.error);
