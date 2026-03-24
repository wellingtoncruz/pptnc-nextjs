/**
 * Migration script: Convert publishedAt from string to Firestore Timestamp
 *
 * Problem: Some episodes have publishedAt as ISO string ("2025-12-17T12:00:43Z")
 * while newer ones use Firestore Timestamp. Firestore orderBy separates types,
 * causing recent Timestamp episodes to sort after all string episodes.
 *
 * Solution: Convert all string publishedAt to Firestore Timestamp for consistent ordering.
 *
 * Usage: node scripts/migrate-publishedAt-to-timestamp.js [--dry-run]
 */

const { Firestore, Timestamp } = require("@google-cloud/firestore");

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 400; // Firestore max batch size is 500

async function migrate() {
  const db = new Firestore({
    projectId: "pptnc-stage",
    databaseId: "pptnc-stage",
  });

  const collectionPath = "podcasts/pptnc/videos";
  console.log(`Migrating publishedAt string -> Timestamp in ${collectionPath}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  const snapshot = await db
    .collection(collectionPath)
    .select("publishedAt", "title")
    .get();

  let stringCount = 0;
  let timestampCount = 0;
  let nullCount = 0;
  const toMigrate = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const pub = data.publishedAt;

    if (pub === null || pub === undefined) {
      nullCount++;
      continue;
    }

    if (typeof pub === "string") {
      stringCount++;
      const date = new Date(pub);
      if (isNaN(date.getTime())) {
        console.warn(`  SKIP ${doc.id}: invalid date string "${pub}"`);
        continue;
      }
      toMigrate.push({
        id: doc.id,
        title: data.title?.substring(0, 50),
        oldValue: pub,
        newValue: Timestamp.fromDate(date),
      });
    } else if (typeof pub === "object" && "_seconds" in pub) {
      timestampCount++;
    }
  }

  console.log(`Total documents: ${snapshot.docs.length}`);
  console.log(`Already Timestamp: ${timestampCount}`);
  console.log(`String (to migrate): ${stringCount}`);
  console.log(`Null/undefined: ${nullCount}`);
  console.log(`Documents to update: ${toMigrate.length}\n`);

  if (toMigrate.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  // Show first 5 examples
  console.log("Examples:");
  toMigrate.slice(0, 5).forEach((m) => {
    console.log(`  ${m.id} | "${m.oldValue}" -> Timestamp(${m.newValue.toDate().toISOString()})`);
  });
  console.log();

  if (DRY_RUN) {
    console.log("DRY RUN complete. Run without --dry-run to apply changes.");
    return;
  }

  // Batch update
  let updated = 0;
  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toMigrate.slice(i, i + BATCH_SIZE);

    for (const item of chunk) {
      const ref = db.collection(collectionPath).doc(item.id);
      batch.update(ref, { publishedAt: item.newValue });
    }

    await batch.commit();
    updated += chunk.length;
    console.log(`  Batch committed: ${updated}/${toMigrate.length}`);
  }

  console.log(`\nMigration complete. Updated ${updated} documents.`);
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
