
import { Firestore } from "@google-cloud/firestore";
import * as fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function checkRemainingPipes() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const REPORT_FILE = "remaining_pipes_report.md";

    try {
        console.log(`Fetching full episodes...`);
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where('isFullEpisode', '==', true)
            .get();

        if (snapshot.empty) {
            console.log("No full episodes found.");
            return;
        }

        console.log(`Scanning ${snapshot.size} episodes for '|' character...`);

        const results: { id: string, title: string }[] = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const title = data.title || "";

            if (title.includes("|")) {
                results.push({
                    id: doc.id,
                    title: title
                });
            }
        });

        console.log(`Found ${results.length} titles containing '|'.`);

        // Generate Markdown Report
        let report = `# Remaining Pipes Analysis\n\n`;
        report += `Total Episodes Scanned: ${snapshot.size}\n`;
        report += `Titles containing '|': ${results.length}\n\n`;

        if (results.length > 0) {
            report += `| Doc ID | Current Title |\n`;
            report += `| :--- | :--- |\n`;
            results.forEach(c => {
                const escapedTitle = c.title.replace(/\|/g, '\\|');
                report += `| ${c.id} | ${escapedTitle} |\n`;
            });
        } else {
            report += `\nNo remaining titles found containing '|'.\n`;
        }

        fs.writeFileSync(REPORT_FILE, report);
        console.log(`Report generated at: ${REPORT_FILE}`);

    } catch (error) {
        console.error("Error analyzing titles:", error);
        process.exit(1);
    }
}

checkRemainingPipes().catch(console.error);
