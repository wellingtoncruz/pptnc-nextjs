
import { Firestore } from "@google-cloud/firestore";
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function analyzeTitleSanitization() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const TARGET_SUFFIX = " | PPT Não Compila Podcast";
    const REPORT_FILE = "title_sanitization_preview.md";

    try {
        console.log(`Fetching full episodes from '${COLLECTION_EPISODES}'...`);
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where('isFullEpisode', '==', true)
            .get();

        if (snapshot.empty) {
            console.log("No full episodes found.");
            return;
        }

        console.log(`Scanning ${snapshot.size} episodes for titles ending with "${TARGET_SUFFIX}"...`);

        const results: { id: string, oldTitle: string, newTitle: string, changed: boolean }[] = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const title = data.title || "";
            let newTitle = title;
            let changed = false;

            if (title.endsWith(TARGET_SUFFIX)) {
                // Truncate the suffix
                newTitle = title.slice(0, -TARGET_SUFFIX.length).trim();
                changed = true;
            }

            results.push({
                id: doc.id,
                oldTitle: title,
                newTitle: newTitle,
                changed: changed
            });
        });

        console.log(`Analyzed ${results.length} titles.`);

        // Generate Markdown Report
        let report = `# Title Sanitization Analysis (Full Report)\n\n`;
        report += `Total Episodes Scanned: ${snapshot.size}\n`;
        report += `Titles Requiring Change: ${results.filter(r => r.changed).length}\n`;
        report += `Titles Unchanged: ${results.filter(r => !r.changed).length}\n\n`;

        report += `| Status | Doc ID | Current Title | Proposed Title |\n`;
        report += `| :--- | :--- | :--- | :--- |\n`;


        results.forEach(c => {
            const status = c.changed ? "🔴 CHANGE" : "🟢 OK";
            const escapedOldTitle = c.oldTitle.replace(/\|/g, '\\|');
            const escapedNewTitle = c.newTitle.replace(/\|/g, '\\|');
            const proposed = c.changed ? `**${escapedNewTitle}**` : escapedNewTitle;
            report += `| ${status} | ${c.id} | ${escapedOldTitle} | ${proposed} |\n`;
        });

        fs.writeFileSync(REPORT_FILE, report);
        console.log(`Preview report generated at: ${REPORT_FILE}`);

    } catch (error) {
        console.error("Error analyzing titles:", error);
        process.exit(1);
    }
}

analyzeTitleSanitization().catch(console.error);
