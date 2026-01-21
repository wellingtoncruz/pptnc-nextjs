
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function verifyUniqueSpotifyUrls() {
    console.log("Initializing Firestore Client...");
    const db = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: "pptnc",
    });

    const COLLECTION_EPISODES = "videos";

    try {
        console.log(`Fetching all documents from '${COLLECTION_EPISODES}'...`);
        const snapshot = await db.collection(COLLECTION_EPISODES).get();

        if (snapshot.empty) {
            console.log("No documents found in the collection.");
            return;
        }

        const urlMap = new Map<string, string[]>(); // URL -> List of Doc IDs
        let totalWithUrl = 0;
        let totalDocuments = 0;

        snapshot.forEach(doc => {
            totalDocuments++;
            const data = doc.data();
            const spotifyUrl = data.spotifyUrl;

            if (spotifyUrl) {
                totalWithUrl++;
                const cleanUrl = spotifyUrl.trim();

                if (urlMap.has(cleanUrl)) {
                    urlMap.get(cleanUrl)?.push(doc.id);
                } else {
                    urlMap.set(cleanUrl, [doc.id]);
                }
            }
        });

        console.log("--------------------------------------------------");
        console.log(`Total Documents Scanned: ${totalDocuments}`);
        console.log(`Documents with Spotify URL: ${totalWithUrl}`);
        console.log(`Unique Spotify URLs: ${urlMap.size}`);
        console.log("--------------------------------------------------");

        const duplicates = Array.from(urlMap.entries()).filter(([_, ids]) => ids.length > 1);

        if (duplicates.length > 0) {
            console.error(`❌ FOUND ${duplicates.length} DUPLICATE URLS!`);
            duplicates.forEach(([url, ids]) => {
                console.log(`URL: ${url}`);
                console.log(`  Found in IDs: ${ids.join(', ')}`);
            });
            process.exit(1);
        } else {
            console.log("✅ SUCCESS: No duplicate Spotify URLs found.");
        }

    } catch (error) {
        console.error("Error during verification:", error);
        process.exit(1);
    }
}

verifyUniqueSpotifyUrls().catch(console.error);
