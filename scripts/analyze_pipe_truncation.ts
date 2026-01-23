
import { Firestore } from "@google-cloud/firestore";
import * as fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function analyzePipeTruncation() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const REPORT_FILE = "pipe_truncation_preview.md";

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

        const results: { id: string, oldTitle: string, newTitle: string, changed: boolean }[] = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const title = data.title || "";
            let newTitle = title;
            let changed = false;

            if (title.includes("|")) {
                // Truncate at the first pipe and trim
                newTitle = title.split('|')[0].trim();
                if (newTitle !== title) {
                    changed = true;
                }
            }

            if (changed) {
                results.push({
                    id: doc.id,
                    oldTitle: title,
                    newTitle: newTitle,
                    changed: changed
                });
            }
        });

        console.log(`Found ${results.length} titles to truncate.`);

        // Generate Markdown Report
        let report = `# Pipe Truncation Analysis\n\n`;
        report += `Total Episodes Scanned: ${snapshot.size}\n`;
        report += `Titles Requiring Truncation: ${results.length}\n\n`;

        if (results.length > 0) {
            report += `| Doc ID | Current Title | Proposed Title |\n`;
            report += `| :--- | :--- | :--- |\n`;
            results.forEach(c => {
                const escapedOldTitle = c.oldTitle.replace(/\|/g, '\\|');
                // New title shouldn't have pipes if we did it right, but good to be safe if splitting logic changes
                const escapedNewTitle = c.newTitle.replace(/\|/g, '\\|');
                report += `| ${c.id} | ${escapedOldTitle} | **${escapedNewTitle}** |\n`;
            });
        } else {
            report += `\nNo titles found containing '|'.\n`;
        }

        fs.writeFileSync(REPORT_FILE, report);
        console.log(`Preview report generated at: ${REPORT_FILE}`);

    } catch (error) {
        console.error("Error analyzing titles:", error);
        process.exit(1);
    }
}

analyzePipeTruncation().catch(console.error);
