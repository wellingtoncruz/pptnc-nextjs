
import { Firestore } from "@google-cloud/firestore";
import * as fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface Guest {
    name: string;
    linkedin?: string;
    // other fields might exist
    [key: string]: any;
}

interface EpisodeData {
    title?: string;
    description?: string;
    guests?: Guest[];
    [key: string]: any;
}

function extractLinkedInUrls(text: string): string[] {
    const regex = /https?:\/\/(www\.)?linkedin\.com\/in\/[\w\-À-ÿ]+/g;
    return text.match(regex) || [];
}

function normalizeString(str: string): string {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function analyzeGuestLinkedin() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const REPORT_FILE = "guest_linkedin_preview.md";
    const SAMPLE_SIZE = 15;

    try {
        console.log(`Fetching full episodes...`);
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where('isFullEpisode', '==', true)
            .get();

        if (snapshot.empty) {
            console.log("No full episodes found.");
            return;
        }

        const allDocs = snapshot.docs;
        console.log(`Total full episodes: ${allDocs.length}`);

        // Select Random Sample
        const shuffled = allDocs.sort(() => 0.5 - Math.random());
        const sample = shuffled.slice(0, SAMPLE_SIZE);

        console.log(`Selected ${SAMPLE_SIZE} random episodes for analysis.`);

        let report = `# Guest LinkedIn Enrichment Analysis (Sample ${SAMPLE_SIZE})\n\n`;

        for (const doc of sample) {
            const data = doc.data() as EpisodeData;
            const title = data.title || "No Title";
            const description = data.description || "";
            const guests = data.guests || [];

            report += `## Episode: ${title}\n`;
            report += `**ID**: ${doc.id}\n`;

            if (!description) {
                report += `> ⚠️ **Warning**: No description found.\n\n`;
                continue;
            }

            const urls = extractLinkedInUrls(description);

            if (urls.length === 0) {
                report += `> ℹ️ Info: No LinkedIn URLs found in description.\n\n`;
                // List guests anyway just to see
                if (guests.length > 0) {
                    report += `**Guests defined in DB:**\n`;
                    guests.forEach(g => report += `- ${g.name}\n`);
                }
                report += `\n`;
                continue;
            }

            report += `**Found LinkedIn URLs:**\n`;
            urls.forEach(u => report += `- ${u}\n`);

            if (guests.length === 0) {
                report += `> ⚠️ **Warning**: No 'guests' array in DB for this episode to attach links to.\n\n`;
                continue;
            }

            report += `\n**Proposed Enrichments:**\n`;
            report += `| Guest Name | Matched LinkedIn | Confidence |\n`;
            report += `| :--- | :--- | :--- |\n`;

            let matchCount = 0;

            for (const guest of guests) {
                if (!guest.name) continue;

                let matchedUrl = "";
                let confidence = "None";

                const normGuestName = normalizeString(guest.name);

                // Heuristic Matching
                for (const url of urls) {
                    const normUrl = normalizeString(url);

                    // Logic: Check if significant parts of guest name are in URL
                    // Identify guest first/last names
                    const nameParts = normalizeString(guest.name).split(/(?=[A-Z0-9])/); // Very basic split? No normalize removed spaces.
                    // Let's use the split on original name then normalize
                    const originalNameParts = guest.name.toLowerCase().split(' ').map(p => normalizeString(p)).filter(p => p.length > 2);

                    let matchesPart = false;
                    for (const part of originalNameParts) {
                        if (normUrl.includes(part)) {
                            matchesPart = true;
                            break;
                        }
                    }

                    if (matchesPart) {
                        matchedUrl = url;
                        confidence = "High (Name Part Match)";
                        break;
                    }
                }

                // Fallback: If 1 guest and 1 URL, assume match
                if (!matchedUrl && guests.length === 1 && urls.length === 1) {
                    matchedUrl = urls[0];
                    confidence = "Medium (Single/Single)";
                }

                if (matchedUrl) {
                    report += `| ${guest.name} | ${matchedUrl} | ${confidence} |\n`;
                    matchCount++;
                } else {
                    report += `| ${guest.name} | *Not Found* | - |\n`;
                }
            }
            report += `\n`;
        }

        fs.writeFileSync(REPORT_FILE, report);
        console.log(`Report generated at: ${REPORT_FILE}`);

    } catch (error) {
        console.error("Error analyzing linkedin:", error);
        process.exit(1);
    }
}

analyzeGuestLinkedin().catch(console.error);
