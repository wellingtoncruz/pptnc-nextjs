
import { Firestore } from "@google-cloud/firestore";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function analyzeDistribution() {
    const db = new Firestore({ projectId: process.env.GOOGLE_PROJECT_ID, databaseId: "pptnc" });
    const snapshot = await db.collection("videos").get();

    let groupLong = 0; // > 3600
    let shortDurations: number[] = [];

    snapshot.forEach((doc: any) => {
        const data = doc.data();
        const d = data.duration || 0;
        if (d > 3600) {
            groupLong++;
        } else {
            shortDurations.push(d);
        }
    });

    console.log(`--- General Stats ---`);
    console.log(`Total Videos: ${snapshot.size}`);
    console.log(`> 3600s (Full Episodes): ${groupLong}`);
    console.log(`<= 3600s (Short/Medium): ${shortDurations.length}`);

    if (shortDurations.length === 0) return;

    shortDurations.sort((a, b) => a - b);
    const min = shortDurations[0];
    const max = shortDurations[shortDurations.length - 1];
    const sum = shortDurations.reduce((a, b) => a + b, 0);
    const avg = sum / shortDurations.length;
    const median = shortDurations[Math.floor(shortDurations.length / 2)];

    console.log(`\n--- Stats for <= 3600s ---`);
    console.log(`Min: ${min}s`);
    console.log(`Max: ${max}s`);
    console.log(`Avg: ${avg.toFixed(2)}s`);
    console.log(`Median: ${median}s`);

    // Simple Histogram
    console.log(`\n--- Distribution Buckets ---`);
    const buckets = [0, 60, 120, 300, 600, 900, 1800, 2700, 3600];
    for (let i = 0; i < buckets.length - 1; i++) {
        const low = buckets[i];
        const high = buckets[i + 1];
        const count = shortDurations.filter(d => d >= low && d < high).length;
        console.log(`${low}s - ${high}s: ${count} videos`);
    }
}

analyzeDistribution().catch(console.error);
