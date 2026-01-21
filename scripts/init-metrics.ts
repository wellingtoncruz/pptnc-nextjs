/**
 * Script to initialize the metrics document in Firestore
 * Run with: npx tsx scripts/init-metrics.ts
 */

import { Firestore } from "@google-cloud/firestore";

async function initMetrics() {
  console.log("Connecting to Firestore...");

  const db = new Firestore({
    projectId: process.env.GOOGLE_PROJECT_ID || "pptnc-stage",
    databaseId: "pptnc",
  });

  // Count only full episodes (isFullEpisode = true)
  console.log("Counting full episodes...");
  const episodesSnapshot = await db
    .collection("videos")
    .where("isFullEpisode", "==", true)
    .count()
    .get();
  const episodeCount = episodesSnapshot.data().count;
  console.log(`Found ${episodeCount} full episodes`);

  // Create metrics document
  const metricsData = {
    episodes: episodeCount,
    cortes: 0,
    reels: 0,
    youtubeSubscribers: 0,
    spotifyFollowers: 0,
    monthlyListeners: 0,
    totalPlays: 0,
    socialReach: 0,
    updatedAt: new Date(),
  };

  console.log("Creating metrics document...");
  await db.collection("metrics").doc("podcast").set(metricsData);

  console.log("✅ Metrics document created successfully!");
  console.log("Data:", JSON.stringify(metricsData, null, 2));
}

initMetrics().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
