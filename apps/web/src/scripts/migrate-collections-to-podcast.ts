import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { getFirestoreClient, PODCAST_ROOT } from '../lib/datastore/client';

/**
 * Migrates root-level collections to podcast-scoped paths.
 *
 * FROM (root):        TO (podcast-scoped):
 * topics          →   podcasts/pptnc/topics
 * metrics         →   podcasts/pptnc/metrics
 * empty_searches  →   podcasts/pptnc/empty_searches
 * search_logs     →   podcasts/pptnc/search_logs
 *
 * - Preserves document IDs and all fields
 * - Does NOT delete originals (manual cleanup after verification)
 * - Idempotent: safe to run multiple times (overwrites with same data)
 */

const COLLECTIONS_TO_MIGRATE = [
  'topics',
  'metrics',
  'empty_searches',
  'search_logs',
];

async function migrateCollections() {
  console.log('Using Project ID:', process.env.GOOGLE_PROJECT_ID);
  console.log(`Target root: ${PODCAST_ROOT}\n`);

  const db = await getFirestoreClient();

  for (const collectionName of COLLECTIONS_TO_MIGRATE) {
    const sourcePath = collectionName;
    const targetPath = `${PODCAST_ROOT}/${collectionName}`;

    console.log(`\n--- Migrating: ${sourcePath} → ${targetPath} ---`);

    try {
      const snapshot = await db.collection(sourcePath).get();

      if (snapshot.empty) {
        console.log(`  No documents found in "${sourcePath}", skipping.`);
        continue;
      }

      console.log(`  Found ${snapshot.size} documents.`);

      let migrated = 0;
      let errors = 0;

      for (const doc of snapshot.docs) {
        try {
          const data = doc.data();
          await db.collection(targetPath).doc(doc.id).set(data);
          migrated++;
          process.stdout.write('.');
        } catch (err) {
          errors++;
          console.error(`\n  Failed to migrate doc "${doc.id}":`, err);
        }
      }

      console.log(`\n  Done: ${migrated} migrated, ${errors} errors.`);
    } catch (err) {
      console.error(`  Error reading collection "${sourcePath}":`, err);
    }
  }

  console.log('\n\nMigration complete.');
  console.log('Original collections were NOT deleted. Verify data before manual cleanup.');
}

migrateCollections().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
