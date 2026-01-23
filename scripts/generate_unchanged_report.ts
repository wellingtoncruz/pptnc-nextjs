
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function generateUnchangedReport() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const REPORT_FILE = "unchanged_descriptions_report.md";

    try {
        console.log(`Fetching ALL full episodes...`);
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where('isFullEpisode', '==', true)
            .get();

        let reportContent = `# Relatório de Episódios Não Modificados (13)\n\n`;
        reportContent += `Este relatório lista os episódios onde a descrição original ("description_raw") era idêntica à descrição processada, indicando que nenhuma sanitização foi necessária.\n\n`;

        let unchangedCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const current = data.description || "";
            const raw = data.description_raw || "";

            if (current === raw) {
                unchangedCount++;
                reportContent += `## ${unchangedCount}. ${data.title} (${doc.id})\n\n`;
                reportContent += "```text\n";
                reportContent += current;
                reportContent += "\n```\n\n";
                reportContent += "---\n\n";
            }
        }

        fs.writeFileSync(REPORT_FILE, reportContent);
        console.log(`Report generated: ${REPORT_FILE}`);
        console.log(`Total Unchanged: ${unchangedCount}`);

    } catch (error) {
        console.error("Error generating report:", error);
    }
}

generateUnchangedReport().catch(console.error);
