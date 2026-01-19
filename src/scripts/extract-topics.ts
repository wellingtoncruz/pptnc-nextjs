import { loadEnvConfig } from '@next/env';

// Load environment variables
const projectDir = process.cwd();
loadEnvConfig(projectDir);

// Using relative import
import { getFirestoreClient, COLLECTION_EPISODES, COLLECTION_TOPICS } from '../lib/datastore/client';

async function extractTopics() {
    console.log('Using Project ID:', process.env.GOOGLE_PROJECT_ID);

    try {
        const db = await getFirestoreClient();

        console.log(`Querying episodes with duration > 3600...`);

        // Query episodes using Firestore collection query
        const snapshot = await db
            .collection(COLLECTION_EPISODES)
            .where('duration', '>', 3600)
            .get();

        if (snapshot.empty) {
            console.log('No episodes found matching the criteria.');
            return;
        }

        console.log(`Found ${snapshot.size} episodes.`);
        console.log('Extracting unique topics...');

        // Extract unique topics
        const uniqueTopics = new Set<string>();

        snapshot.docs.forEach((doc) => {
            const data = doc.data();
            if (Array.isArray(data.topics)) {
                data.topics.forEach((topic: string) => {
                    if (topic && typeof topic === 'string' && topic.trim().length > 0) {
                        uniqueTopics.add(topic.trim());
                    }
                });
            }
        });

        const topicList = Array.from(uniqueTopics).sort();
        console.log(`Found ${topicList.length} unique topics:`);
        console.log(topicList);

        if (topicList.length === 0) {
            console.log('No topics to save.');
            return;
        }

        console.log('\nStarting topic persistence...');

        // Save topics using Firestore
        let savedCount = 0;

        // Use topic name as document ID for idempotency
        const topicsCollection = db.collection(COLLECTION_TOPICS);

        for (const topicName of topicList) {
            const docRef = topicsCollection.doc(topicName);

            try {
                await docRef.set({
                    name: topicName,
                    slug: topicName.toLowerCase().replace(/\s+/g, '-'),
                    count: 0 // Initialize count, potentially update later
                });
                savedCount++;
                process.stdout.write('.');
            } catch (err) {
                console.error(`\nFailed to save topic "${topicName}":`, err);
            }
        }

        console.log(`\n\nSuccessfully process finished.`);
        console.log(`Saved ${savedCount}/${topicList.length} topics.`);

    } catch (error) {
        console.error('Error running extract-topics script:', error);
        process.exit(1);
    }
}

extractTopics();
