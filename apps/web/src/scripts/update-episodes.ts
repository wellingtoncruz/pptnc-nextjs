import { loadEnvConfig } from '@next/env';

// Load environment variables before any other processing that might need them
const projectDir = process.cwd();
loadEnvConfig(projectDir);

// Using relative import to ensure it works even if path aliases have issues in some environments
import { getFirestoreClient, COLLECTION_EPISODES } from '../lib/datastore/client';

async function updateEpisodes() {
    console.log('Using Project ID:', process.env.GOOGLE_PROJECT_ID);

    try {
        const db = await getFirestoreClient();

        console.log(`Querying episodes with duration > 3600 (1 hour)...`);

        const snapshot = await db
            .collection(COLLECTION_EPISODES)
            .where('duration', '>', 3600)
            .get();

        if (snapshot.empty) {
            console.log('No episodes found matching the criteria.');
            return;
        }

        console.log(`Found ${snapshot.size} episodes.`);

        // List entities
        console.log('\n--- Episodes to Update ---');
        snapshot.docs.forEach((doc) => {
            const data = doc.data();
            console.log(`ID: ${doc.id} | Title: ${data.title}`);
        });
        console.log('--------------------------\n');

        console.log('Starting granular update process (one by one)...');

        let updatedCount = 0;
        let errorCount = 0;

        for (const doc of snapshot.docs) {
            try {
                // Update with merge to preserve existing data
                await doc.ref.update({
                    isFullEpisode: true,
                });

                updatedCount++;
                console.log(`[${updatedCount}/${snapshot.size}] Updated ID: ${doc.id}`);

                // Small delay to be safe
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (err) {
                errorCount++;
                console.error(`FAILED to update episode ID: ${doc.id}`, err);
            }
        }

        console.log(`\nUpdate finished.`);
        console.log(`Success: ${updatedCount}`);
        console.log(`Errors: ${errorCount}`);


    } catch (error) {
        console.error('Error running update script:', error);
        process.exit(1);
    }
}

updateEpisodes();
