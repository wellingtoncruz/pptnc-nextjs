
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function verifyStratification() {
    const databaseId = "pptnc-stage";
    console.log(`Verifying Database ID: ${databaseId}`);

    const db = new Firestore({ projectId: process.env.GOOGLE_PROJECT_ID, databaseId: databaseId });
    const snapshot = await db.collection("videos").limit(10).get(); // Check first 10

    console.log(`Checking sample of ${snapshot.size} videos...`);

    let errors = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        const duration = data.duration || 0;
        const kind = data.episodeKind;
        const isFull = data.isFullEpisode;

        let expectedKind = "unknown";
        let expectedIsFull = false;

        if (duration < 60) {
            expectedKind = "short";
            expectedIsFull = false;
        } else if (duration < 3600) {
            expectedKind = "cut";
            expectedIsFull = false;
        } else {
            expectedKind = "full";
            expectedIsFull = true;
        }

        if (kind !== expectedKind || isFull !== expectedIsFull) {
            console.error(`ERROR: Video ${doc.id} (Duration: ${duration}) -> Has kind='${kind}', isFull=${isFull}. Expected kind='${expectedKind}', isFull=${expectedIsFull}`);
            errors++;
        } else {
            console.log(`OK: Video ${doc.id} (Duration: ${duration}) -> ${kind} (isFull=${isFull})`);
        }
    });

    if (errors === 0) {
        console.log("Verification PASSED: All samples correct.");
    } else {
        console.error(`Verification FAILED: Found ${errors} errors.`);
    }
}

verifyStratification().catch(console.error);
