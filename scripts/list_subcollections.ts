
import { Firestore } from "@google-cloud/firestore";
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function listSubcollections() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";
    const OUTPUT_FILE = 'subcollections_report.json';

    try {
        console.log(`Fetching episodes with isFullEpisode == true from '${COLLECTION_EPISODES}'...`);
        const snapshot = await db.collection(COLLECTION_EPISODES)
            .where('isFullEpisode', '==', true)
            .get();

        if (snapshot.empty) {
            console.log("No full episodes found.");
            return;
        }

        console.log(`Found ${snapshot.size} episodes. Checking for sub-collections...`);

        const results: { id: string, title: string, subcollections: string[] }[] = [];
        let processedCount = 0;

        for (const doc of snapshot.docs) {
            const collections = await doc.ref.listCollections();
            if (collections.length > 0) {
                const subIds = collections.map(col => col.id);
                results.push({
                    id: doc.id,
                    title: doc.data().title || "Unknown Title",
                    subcollections: subIds
                });
                console.log(`[FOUND] ${doc.id} has ${subIds.length} sub-collections: ${subIds.join(', ')}`);
            }

            processedCount++;
            if (processedCount % 20 === 0) process.stdout.write('.');
        }
        console.log("\nFinished scanning.");

        // Save report
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
        console.log(`Report saved to ${OUTPUT_FILE}`);
        console.log(`Episodes with sub-collections: ${results.length}`);

        // Generate Markdown Summary
        const mdReport = `# Sub-collection Analysis Report\n\n` +
            `Total Full Episodes Scanned: ${snapshot.size}\n` +
            `Episodes with Sub-collections: ${results.length}\n\n` +
            `| Doc ID | Title | Sub-collections |\n` +
            `| :--- | :--- | :--- |\n` +
            results.map(r => `| ${r.id} | ${r.title.slice(0, 50)} | ${r.subcollections.join(', ')} |`).join('\n');

        fs.writeFileSync('subcollections_report.md', mdReport);
        console.log(`Markdown report saved to subcollections_report.md`);

    } catch (error) {
        console.error("Error listing sub-collections:", error);
        process.exit(1);
    }
}

listSubcollections().catch(console.error);
