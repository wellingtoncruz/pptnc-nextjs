import { NextResponse } from "next/server";
import { getFirestoreClient, COLLECTION_EPISODES } from "@/lib/datastore/client";

/**
 * TEMPORARY diagnostic endpoint - compare two episodes.
 * DELETE THIS FILE after debugging is complete.
 *
 * Usage: /api/debug-episodes?ids=LepV7qdlFfQ,kEcRm4Rfr8M
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ids = url.searchParams.get("ids")?.split(",") ?? [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Pass ?ids=ID1,ID2" }, { status: 400 });
    }

    const db = await getFirestoreClient();
    const results: Record<string, unknown> = {};

    for (const id of ids) {
      const docRef = db.collection(COLLECTION_EPISODES).doc(id.trim());
      const doc = await docRef.get();

      if (!doc.exists) {
        results[id] = "NOT_FOUND";
        continue;
      }

      const data = doc.data()!;

      // Count chunks sub-collection
      const chunksSnap = await docRef.collection("chunks").get();

      results[id] = {
        docId: doc.id,
        title: data.title ?? "UNDEFINED",
        videoType: data.videoType ?? "UNDEFINED",
        slug: data.slug ?? "UNDEFINED",
        // Feature fields
        spotifyUrl: data.spotifyUrl ?? "UNDEFINED",
        topics: data.topics ?? "UNDEFINED",
        transcriptionTXT: data.transcriptionTXT
          ? `${String(data.transcriptionTXT).slice(0, 100)}… (${String(data.transcriptionTXT).length} chars)`
          : "UNDEFINED",
        transcriptionSRT: data.transcriptionSRT
          ? `${String(data.transcriptionSRT).slice(0, 100)}… (${String(data.transcriptionSRT).length} chars)`
          : "UNDEFINED",
        // Chunks sub-collection
        chunksCount: chunksSnap.size,
        // Thumbnail info
        thumbnailHigh: data.thumbnails?.high?.url ?? "UNDEFINED",
      };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
