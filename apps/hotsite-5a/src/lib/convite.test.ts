import { describe, expect, it } from "vitest";
import { getConvite, toView } from "./convite";
import { executarAcao } from "./acoes";
import { cota, memoryStore, nominal, T0 } from "./guests/test-helpers";

describe("getConvite (32.3 AC 1-2)", () => {
  const store = memoryStore([nominal(), cota()]);

  it("sem código → restrito sem erro", async () => {
    expect(await getConvite("", store.get)).toEqual({ estado: "restrito", codigoDigitado: "", erro: null });
  });

  it("malformado e inexistente dão a mesma resposta", async () => {
    const a = await getConvite("mari-ana!", store.get);
    const b = await getConvite("NAOEXISTE123", store.get);
    expect(a.estado).toBe("restrito");
    expect(b.estado).toBe("restrito");
    expect(a.estado === "restrito" && a.erro).toBe("CODIGO_INVALIDO");
    expect(b.estado === "restrito" && b.erro).toBe("CODIGO_INVALIDO");
  });

  it("normaliza o código da URL", async () => {
    const v = await getConvite(" mariana742 ", store.get);
    expect(v.estado).toBe("convite");
  });

  it("mostra o PRIMEIRO episódio e soma os demais (D7, D14)", () => {
    const v = toView(nominal());
    expect(v.episodio?.titulo).toBe("Primeiro");
    expect(v.maisEpisodios).toEqual({ quantidade: 2, views: 18900 });
  });

  it("episódio único → sem resumo", () => {
    const v = toView(nominal({ episodios: [nominal().episodios[0]] }));
    expect(v.maisEpisodios).toBeNull();
  });

  it("views null fora da soma; todos null → null", () => {
    const eps = nominal().episodios.map((e, i) => (i === 2 ? { ...e, views: null } : e));
    expect(toView(nominal({ episodios: eps })).maisEpisodios).toEqual({ quantidade: 2, views: 12400 });
    const nulos = nominal().episodios.map((e) => ({ ...e, views: null }));
    expect(toView(nominal({ episodios: nulos })).maisEpisodios?.views).toBeNull();
  });

  it("cota: sem episódio, sem primeiro nome, com patrocinador", () => {
    const v = toView(cota());
    expect(v).toMatchObject({ cota: true, patrocinador: "Klever", episodio: null, maisEpisodios: null, primeiroNome: null });
  });

  it("view pública não expõe histórico", () => {
    expect(toView(nominal())).not.toHaveProperty("historico");
  });
});

describe("executarAcao", () => {
  it("histórico nunca perde entrada: confirmar → recusar → confirmar", async () => {
    const store = memoryStore([nominal()]);
    await executarAcao(store, "MARIANA742", { tipo: "confirmar" }, T0);
    await executarAcao(store, "MARIANA742", { tipo: "recusar" }, T0);
    const r = await executarAcao(store, "MARIANA742", { tipo: "confirmar" }, T0);
    expect(r.ok && r.convite.estado).toBe("confirmado");
    expect(store.data.get("MARIANA742")?.historico).toHaveLength(3);
  });

  it("código inexistente → CODIGO_INVALIDO", async () => {
    const r = await executarAcao(memoryStore([]), "X123", { tipo: "recusar" }, T0);
    expect(r).toEqual({ ok: false, erro: "CODIGO_INVALIDO" });
  });

  it("falha do banco → FALHA_TEMPORARIA, sem lançar", async () => {
    const quebrado = { get: async () => null, mutate: async () => { throw new Error("UNAVAILABLE"); } };
    const r = await executarAcao(quebrado, "MARIANA742", { tipo: "confirmar" }, T0);
    expect(r).toEqual({ ok: false, erro: "FALHA_TEMPORARIA" });
  });

  it("erro de regra não muda o documento", async () => {
    const store = memoryStore([nominal()]);
    const r = await executarAcao(store, "MARIANA742", { tipo: "acompanhante", nome: "X" }, T0);
    expect(r).toEqual({ ok: false, erro: "ACOMPANHANTE_NAO_PERMITIDO" });
    expect(store.data.get("MARIANA742")?.historico).toHaveLength(0);
  });
});
