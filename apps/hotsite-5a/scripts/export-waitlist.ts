/**
 * Export CSV da lista de espera (Story 32.7). SOMENTE LEITURA.
 *   FIRESTORE_DATABASE_ID=pptnc-prod tsx scripts/export-waitlist.ts [--out arquivo.csv]
 */
import { writeFileSync } from "node:fs";
import { ESPERA_COLLECTION, getFirestoreClient } from "../src/lib/firestore";
import { EsperaDocSchema, type EsperaDoc } from "../src/lib/espera/espera";
import { fromFirestore } from "../src/lib/guests/schema";
import { gerarCsvEspera, type Problema } from "../src/lib/export/csv";

async function main() {
  const i = process.argv.indexOf("--out");
  const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const out = i >= 0 ? process.argv[i + 1] : `lista-espera-5anos-${hoje}.csv`;
  console.log(`Banco: ${process.env.FIRESTORE_DATABASE_ID || "pptnc-stage"} · ${ESPERA_COLLECTION} (só leitura)`);

  const db = await getFirestoreClient();
  const col = db.collection(ESPERA_COLLECTION);
  const snap = await col.get();
  const docs: EsperaDoc[] = [];
  const problemas: Problema[] = [];
  for (const s of snap.docs) {
    const r = EsperaDocSchema.safeParse(fromFirestore(s.data()));
    if (r.success) docs.push(r.data);
    else problemas.push({ codigo: s.id, motivo: r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join(" | ") });
  }

  // Verificação AI 38: linhas conferidas com count() direto no Firestore.
  const total = (await col.count().get()).data().count;
  const confere = docs.length + problemas.length === total;

  writeFileSync(out, gerarCsvEspera(docs, problemas));
  console.log(`${out}: ${docs.length} envios${problemas.length ? ` + ${problemas.length} com problema` : ""}`);
  console.log(confere ? "Conferência com count() direto: OK" : `⚠️ DIVERGÊNCIA com count(): ${total}`);
  if (!confere) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
