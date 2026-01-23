
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

function cleanDescription(text: string): string {
    if (!text) return "";

    let lines = text.split('\n');
    let cleanedLines: string[] = [];

    // Regex Definitions
    const timestampRegex = /^\d{1,2}:\d{2}(?::\d{2})?\s+/;
    const hashtagRegex = /^(?:#[\w\d]+\s*)+$/;

    // Headers that likely start a "Footer" or "List" section to be removed
    // Includes: Participantes, Convidados, Socials, Production
    const footerHeaderRegex = /^(Participantes|Convidados|Siga também nas plataformas|Acompanhe nas redes|Instagram e Twitter|LinkedIn|Produção|Spotify|Youtube|Outras plataformas)(?::|$)/i;

    // Standalone promotional lines
    const promoRegex = /^Conheça também o/i;
    const linkRegex = /^https?:\/\/(linktr\.ee|spoti\.fi|youtu\.be|www\.linkedin\.com\/company)/i;

    let isFooterMode = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        // 1. Check for Footer Start
        if (footerHeaderRegex.test(line)) {
            // Heuristic: If we hit these headers, assume the rest is metadata/list
            isFooterMode = true;
            continue;
        }

        if (isFooterMode) {
            // In footer mode, we assume everything is to be stripped.
            continue;
        }

        // 2. Individual Line Cleaning (Pre-footer)
        if (timestampRegex.test(line)) continue;
        if (hashtagRegex.test(line)) continue;
        if (promoRegex.test(line)) continue;
        if (linkRegex.test(line)) continue;

        // Skip empty lines in the loop, we will rejoin with double newlines later
        if (line.length === 0) continue;

        cleanedLines.push(line);
    }

    // Join with double newlines for visible paragraphs
    return cleanedLines.join('\n\n');
}

async function applySanitization() {
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
        let batch = db.batch();
        let batchCount = 0;
        const BATCH_LIMIT = 400;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const original = data.description || "";
            const cleaned = cleanDescription(original);

            if (original !== cleaned) {
                const docRef = db.collection(COLLECTION_EPISODES).doc(doc.id);
                batch.update(docRef, { description: cleaned });
                batchCount++;
                updatedCount++;
            }

            if (batchCount >= BATCH_LIMIT) {
                await batch.commit();
                console.log(`Committed batch of ${batchCount} updates.`);
                batch = db.batch();
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
            console.log(`Committed final batch of ${batchCount} updates.`);
        }

        console.log(`\nSanitization Complete.`);
        console.log(`Updated ${updatedCount} episodes.`);

    } catch (error) {
        console.error("Error applying sanitization:", error);
    }
}

applySanitization().catch(console.error);
