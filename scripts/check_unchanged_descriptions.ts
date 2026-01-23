
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Same logic as applied
function cleanDescription(text: string): string {
    if (!text) return "";
    let lines = text.split('\n');
    let cleanedLines: string[] = [];
    const timestampRegex = /^\d{1,2}:\d{2}(?::\d{2})?\s+/;
    const hashtagRegex = /^(?:#[\w\d]+\s*)+$/;
    const footerHeaderRegex = /^(Participantes|Convidados|Siga também nas plataformas|Acompanhe nas redes|Instagram e Twitter|LinkedIn|Produção|Spotify|Youtube|Outras plataformas)(?::|$)/i;
    const promoRegex = /^Conheça também o/i;
    const linkRegex = /^https?:\/\/(linktr\.ee|spoti\.fi|youtu\.be|www\.linkedin\.com\/company)/i;
    let isFooterMode = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (footerHeaderRegex.test(line)) { isFooterMode = true; continue; }
        if (isFooterMode) continue;
        if (timestampRegex.test(line)) continue;
        if (hashtagRegex.test(line)) continue;
        if (promoRegex.test(line)) continue;
        if (linkRegex.test(line)) continue;
        if (line.length === 0) continue;
        cleanedLines.push(line);
    }
    return cleanedLines.join('\n\n');
}

async function checkUnchanged() {
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

        console.log(`Checking ${snapshot.size} episodes...`);
        let skippedCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const current = data.description;
            const raw = data.description_raw;

            if (current === raw) {
                skippedCount++;
                console.log(`\n[${doc.id}] NO CHANGES NEEDED: ${data.title}`);
                // console.log(`Content: ${current.substring(0, 100)}...`);
            }
        }
        console.log(`\nTotal Skipped (Already Clean): ${skippedCount}`);

    } catch (error) {
        console.error("Error:", error);
    }
}

checkUnchanged().catch(console.error);
