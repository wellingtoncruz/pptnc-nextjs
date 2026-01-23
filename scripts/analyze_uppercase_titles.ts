
import { Firestore } from "@google-cloud/firestore";
import * as fs from 'fs';
import dotenv from 'dotenv';
import { count } from "console";

// Load environment variables
dotenv.config({ path: '.env.local' });

async function analyzeUppercaseTitles() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const REPORT_FILE = "uppercase_titles_report.md";

    try {
        console.log(`Fetching full episodes...`);
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where('isFullEpisode', '==', true)
            .get();

        if (snapshot.empty) {
            console.log("No full episodes found.");
            return;
        }

        console.log(`Scanning ${snapshot.size} episodes for uppercase titles...`);

        const results: { id: string, title: string, newTitle: string }[] = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const title = data.title || "";

            // Remove non-letter characters to check if the letters are all uppercase
            // We want to avoid flagging titles like "10 DICAS" as distinct if they only have numbers/spaces + uppercase
            // But if it has mixed case letters, it's not fully uppercase.
            const letters = title.replace(/[^a-zA-ZÀ-ÿ]/g, "");

            if (letters.length > 0 && letters === letters.toUpperCase()) {
                // Generate Title Case proposal
                const words = title.toLowerCase().split(' ');
                const newTitle = words.map((word: string) => {
                    if (word.length === 0) return word;
                    return word.charAt(0).toUpperCase() + word.slice(1);
                }).join(' ');

                results.push({
                    id: doc.id,
                    title: title,
                    newTitle: newTitle
                });
            }
        });

        console.log(`Found ${results.length} uppercase titles.`);

        // Generate Markdown Report
        let report = `# Uppercase Titles Analysis\n\n`;
        report += `Total Episodes Scanned: ${snapshot.size}\n`;
        report += `Uppercase Titles Found: ${results.length}\n\n`;

        if (results.length > 0) {
            report += `| Doc ID | Current Title | Proposed Title |\n`;
            report += `| :--- | :--- | :--- |\n`;
            results.forEach(c => {
                // Escape pipe just in case, though we sanitized them
                const escapedTitle = c.title.replace(/\|/g, '\\|');
                const escapedNewTitle = c.newTitle ? c.newTitle.replace(/\|/g, '\\|') : '';
                report += `| ${c.id} | ${escapedTitle} | **${escapedNewTitle}** |\n`;
            });
        } else {
            report += `\nNo fully uppercase titles found.\n`;
        }

        fs.writeFileSync(REPORT_FILE, report);
        console.log(`Report generated at: ${REPORT_FILE}`);

    } catch (error) {
        console.error("Error analyzing titles:", error);
        process.exit(1);
    }
}

analyzeUppercaseTitles().catch(console.error);
