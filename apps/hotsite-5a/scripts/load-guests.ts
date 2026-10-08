/**
 * Carga de convidados do hotsite (Story 32.2). DRY-RUN por padrão; só escreve com --apply.
 *
 *   Nominais:  tsx scripts/load-guests.ts --input lista.json [--apply]
 *              lista.json = [{ "nome": "...", "primeiroNome"?: "...", "empresa"?: "...", "videoIds": ["..."] }]
 *   Cota VIP:  tsx scripts/load-guests.ts --cota "Klever" --quantidade 10 [--apply]
 *
 * Banco: FIRESTORE_DATABASE_ID (default pptnc-stage). Views: YOUTUBE_API_KEY ou --youtube-key-file.
 * Título/data vêm de podcasts/pptnc/videos; se o vídeo não estiver no banco, da YouTube API.
 * Regra da casa: avisar o Wellington antes de --apply; em PROD, backup antes (feedback_notify_before_db_changes).
 */
import { readFileSync } from "node:fs";
import { getFirestoreClient, GUESTS_COLLECTION } from "../src/lib/firestore";
import { parseGuestDoc, type GuestDoc } from "../src/lib/guests/schema";
import { limparEmpresa, planejarCargaNominal, planejarCota, type EntradaNominal, type VideoInfo } from "../src/lib/guests/carga";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const APPLY = process.argv.includes("--apply");

async function lerExistentes(): Promise<GuestDoc[]> {
  const db = await getFirestoreClient();
  const snap = await db.collection(GUESTS_COLLECTION).get();
  return snap.docs.map((d) => parseGuestDoc(d.data()));
}

async function lerVideos(ids: string[]): Promise<Map<string, VideoInfo>> {
  const db = await getFirestoreClient();
  const refs = ids.map((id) => db.collection("podcasts/pptnc/videos").doc(id));
  const out = new Map<string, VideoInfo>();
  for (let i = 0; i < refs.length; i += 300) {
    for (const s of await db.getAll(...refs.slice(i, i + 300))) {
      const d = s.data();
      if (!d) continue;
      const pub = d.publishedAt?.toDate?.() ?? new Date(d.publishedAt);
      out.set(s.id, { titulo: String(d.title), publicadoEm: pub.toISOString().slice(0, 10) });
    }
  }
  return out;
}

interface DadosYoutube {
  views: Map<string, number>;
  videos: Map<string, VideoInfo>; // fallback quando o vídeo não está no banco (ex.: DEV defasado)
}

async function lerYoutube(ids: string[]): Promise<DadosYoutube> {
  const keyFile = arg("youtube-key-file");
  const key = process.env.YOUTUBE_API_KEY || (keyFile ? readFileSync(keyFile, "utf8").trim() : "");
  if (!key) throw new Error("Defina YOUTUBE_API_KEY ou --youtube-key-file (a chave nunca é impressa)");
  const out: DadosYoutube = { views: new Map(), videos: new Map() };
  for (let i = 0; i < ids.length; i += 50) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.slice(i, i + 50).join(",")}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube API respondeu ${res.status}`);
    const body = (await res.json()) as {
      items?: { id: string; snippet?: { title?: string; publishedAt?: string }; statistics?: { viewCount?: string } }[];
    };
    for (const it of body.items ?? []) {
      out.views.set(it.id, Number(it.statistics?.viewCount ?? 0));
      if (it.snippet?.title && it.snippet.publishedAt) {
        out.videos.set(it.id, { titulo: it.snippet.title, publicadoEm: it.snippet.publishedAt.slice(0, 10) });
      }
    }
  }
  return out;
}

async function gravar(criar: GuestDoc[], atualizar: { codigo: string; campos: Partial<GuestDoc> }[]) {
  const db = await getFirestoreClient();
  const col = db.collection(GUESTS_COLLECTION);
  const ops = [
    ...criar.map((d) => (b: FirebaseFirestore.WriteBatch) => b.create(col.doc(d.codigo), d)),
    ...atualizar.map((u) => (b: FirebaseFirestore.WriteBatch) => b.update(col.doc(u.codigo), u.campos)),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

async function main() {
  const banco = process.env.FIRESTORE_DATABASE_ID || "pptnc-stage";
  console.log(`Banco: ${banco} · collection: ${GUESTS_COLLECTION} · modo: ${APPLY ? "APPLY" : "dry-run"}`);
  const existentes = await lerExistentes();
  const agora = new Date();

  const patrocinador = arg("cota");
  if (patrocinador) {
    const qtd = Number(arg("quantidade"));
    const docs = planejarCota(patrocinador, qtd, existentes, agora);
    const jaTem = existentes.filter((d) => d.cotaPatrocinador && d.patrocinador === patrocinador.trim()).length;
    console.log(`Cota ${patrocinador}: criar ${docs.length} (já existem ${jaTem}; passará a ter ${jaTem + docs.length})`);
    if (APPLY) {
      await gravar(docs, []);
      console.log("Gravado. Códigos para repassar ao patrocinador:");
    } else {
      console.log("Amostra de códigos (dry-run gera outros no --apply):");
    }
    docs.forEach((d) => console.log(`  ${d.codigo}`));
    return;
  }

  const input = arg("input");
  if (!input) throw new Error("Use --input lista.json ou --cota <Patrocinador> --quantidade N");
  const entrada = JSON.parse(readFileSync(input, "utf8")) as EntradaNominal[];
  const ids = [...new Set(entrada.flatMap((e) => e.videoIds))];
  const [videos, yt] = await Promise.all([lerVideos(ids), lerYoutube(ids)]);
  const views = yt.views;
  const semViews = ids.filter((id) => !views.has(id));
  if (semViews.length) console.log(`Sem views na API (ficam null): ${semViews.join(", ")}`);
  const doYoutube = ids.filter((id) => !videos.has(id) && yt.videos.has(id));
  for (const id of doYoutube) videos.set(id, yt.videos.get(id)!);
  if (doYoutube.length) console.log(`Fora do banco, título/data da YouTube API: ${doYoutube.join(", ")}`);

  const plano = planejarCargaNominal(entrada, existentes, videos, views, agora);
  console.log(`Criar ${plano.criar.length} · atualizar ${plano.atualizar.length} · sem mudança ${plano.semMudanca.length}`);
  for (const d of plano.criar.slice(0, 5)) {
    console.log(`  + ${d.codigo.padEnd(20)} ${d.nome} · ${d.empresa ?? "(sem empresa)"} · ${d.episodios.length} ep · 1º ${d.episodios[0]?.publicadoEm}`);
  }
  const comEmpresa = plano.atualizar.filter((a) => "empresa" in a.campos).length;
  if (comEmpresa) console.log(`Empresa atualizada em ${comEmpresa} convite(s) ainda sem resposta (D30)`);
  const semEmpresa = entrada.filter((e) => !limparEmpresa(e.empresa)).map((e) => e.nome);
  console.log(`Sem empresa na entrada: ${semEmpresa.length}${semEmpresa.length ? ` — ${semEmpresa.join(", ")}` : ""}`);
  if (APPLY) {
    await gravar(plano.criar, plano.atualizar);
    console.log("Gravado.");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
