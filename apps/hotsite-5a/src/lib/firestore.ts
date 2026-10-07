import type { Firestore } from "@google-cloud/firestore";

/**
 * Client Firestore singleton — mesmo padrão do apps/web.
 *
 * - projectId via GOOGLE_PROJECT_ID (default pptnc-stage)
 * - databaseId via FIRESTORE_DATABASE_ID (default pptnc-stage)
 * NUNCA fixar pptnc-prod aqui: produção é escolhida pelo deploy.
 */
let client: Firestore | null = null;

export async function getFirestoreClient(): Promise<Firestore> {
  if (!client) {
    const { Firestore } = await import("@google-cloud/firestore");
    client = new Firestore({
      projectId: process.env.GOOGLE_PROJECT_ID || "pptnc-stage",
      databaseId: process.env.FIRESTORE_DATABASE_ID || "pptnc-stage",
      ignoreUndefinedProperties: true,
    });
    console.log(
      `[STARTUP] hotsite-5a | DB: ${process.env.FIRESTORE_DATABASE_ID || "pptnc-stage"}`
    );
  }
  return client;
}

/** O hotsite é do PPTNC (D4): mora no tenant do PPTNC. */
export const PODCAST_ID = "pptnc";
export const GUESTS_COLLECTION = `podcasts/${PODCAST_ID}/hotsite5a`;
