/**
 * Export CSV dos convidados (Story 32.5) — lista do anfitrião e da porta. SOMENTE LEITURA.
 *   FIRESTORE_DATABASE_ID=pptnc-prod tsx scripts/export-guests.ts [--out arquivo.csv]
 */
import { writeFileSync } from "node:fs";
import { getFirestoreClient, GUESTS_COLLECTION } from "../src/lib/firestore";
import { GuestDocSchema, fromFirestore, type GuestDoc } from "../src/lib/guests/schema";
import { gerarCsv, totais, type Problema } from "../src/lib/export/csv";

async function main() {
  const i = process.argv.indexOf("--out");
  const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const out = i >= 0 ? process.argv[i + 1] : `convidados-5anos-${hoje}.csv`;
  console.log(`Banco: ${process.env.FIRESTORE_DATABASE_ID || "pptnc-stage"} · ${GUESTS_COLLECTION} (só leitura)`);

  const db = await getFirestoreClient();
  const col = db.collection(GUESTS_COLLECTION);
  const snap = await col.get();
  const docs: GuestDoc[] = [];
  const problemas: Problema[] = [];
  for (const s of snap.docs) {
    const r = GuestDocSchema.safeParse(fromFirestore(s.data()));
    if (r.success) docs.push(r.data);
    else problemas.push({ codigo: s.id, motivo: r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join(" | ") });
  }

  // Verificação AI 38: totais conferidos com count() direto no Firestore.
  const t = totais(docs);
  const contar = async (status: string) => (await col.where("status", "==", status).count().get()).data().count;
  const [c, r, p] = await Promise.all([contar("confirmado"), contar("recusou"), contar("pendente")]);
  const confere = c === t.confirmados && r === t.recusas && p === t.pendentes && docs.length + problemas.length === snap.size;

  writeFileSync(out, gerarCsv(docs, problemas));
  console.log(`${out}: ${docs.length} convidados${problemas.length ? ` + ${problemas.length} com problema` : ""}`);
  console.log(`Confirmados ${t.confirmados} · acompanhantes ${t.acompanhantes} · esperados ${t.esperados} · recusas ${t.recusas} · pendentes ${t.pendentes}`);
  console.log(confere ? "Conferência com count() direto: OK" : `⚠️ DIVERGÊNCIA com count(): confirmado ${c}, recusou ${r}, pendente ${p}`);
  if (!confere) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
