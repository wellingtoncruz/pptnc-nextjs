import * as fs from 'fs';
import * as path from 'path';
import { Firestore } from '@google-cloud/firestore';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Configuration
const FIRESTORE_FILE = 'episodes_to_enrich.json';
const SPOTIFY_JSON_FILE = 'spotify_json_data.json';
const COLLECTION_NAME = 'videos'; // Based on src/lib/datastore/client.ts

interface FirestoreEpisode {
    id: string; // This corresponds to resourceId.videoId based on analysis
    title: string;
    publishedAt: string;
    spotifyUrl: string | null;
}

interface SpotifyJsonEpisode {
    title: string;
    spotifyUrl: string;
    release_date: string;
}

function normalizeTitle(title: string): string {
    return title.toLowerCase().trim()
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, ' ');
}

async function main() {
    console.log('Initializing Firestore...');
    const firestore = new Firestore({
        projectId: process.env.GOOGLE_PROJECT_ID,
        databaseId: 'pptnc',
    });

    console.log('Reading data files...');
    const firestoreData: FirestoreEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), FIRESTORE_FILE), 'utf-8'));
    const spotifyData: SpotifyJsonEpisode[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), SPOTIFY_JSON_FILE), 'utf-8'));

    const spotifyMap = new Map<string, SpotifyJsonEpisode>();
    spotifyData.forEach(ep => {
        spotifyMap.set(normalizeTitle(ep.title), ep);
    });

    console.log(`Loaded ${firestoreData.length} records to enrich and ${spotifyData.length} Spotify records.`);

    let updatedCount = 0;
    let skippedCount = 0;
    let noMatchCount = 0;

    for (const fsEp of firestoreData) {
        // Skip if already has Spotify URL (unless we want to overwrite/verify? Assuming null in json means missing)
        if (fsEp.spotifyUrl) {
            skippedCount++;
            continue;
        }

        const normalizedFsTitle = normalizeTitle(fsEp.title);
        let match = spotifyMap.get(normalizedFsTitle);

        // Fallback checks
        if (!match) {
            match = spotifyData.find(s => normalizeTitle(s.title) === normalizedFsTitle);
        }

        if (!match) {
            // Fuzzy contains check (Partial Match logic)
            match = spotifyData.find(s => {
                const normS = normalizeTitle(s.title);
                return normS.includes(normalizedFsTitle) || normalizedFsTitle.includes(normS);
            });
        }

        if (match) {
            console.log(`Match found for "${fsEp.title}" -> "${match.title}"`);

            // Find the document in Firestore
            const videosCollection = firestore.collection(COLLECTION_NAME);
            const snapshot = await videosCollection.where('resourceId.videoId', '==', fsEp.id).limit(1).get();

            if (snapshot.empty) {
                console.warn(`⚠️ Document not found in Firestore for video ID: ${fsEp.id}`);
                continue;
            }

            const doc = snapshot.docs[0];
            const currentData = doc.data();

            // Check if update is needed (preserve existing if different?)
            // Just update it as per plan.

            try {
                await doc.ref.update({
                    spotifyUrl: match.spotifyUrl
                });
                console.log(`✅ Updated document ${doc.id} with Spotify URL: ${match.spotifyUrl}`);
                updatedCount++;
            } catch (error) {
                console.error(`❌ Failed to update document ${doc.id}:`, error);
            }

        } else {
            noMatchCount++;
        }
    }

    console.log('\n--- Summary ---');
    console.log(`Total processed: ${firestoreData.length}`);
    console.log(`Skipped (already populated): ${skippedCount}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`No Match Found: ${noMatchCount}`);
}

main().catch(console.error);
