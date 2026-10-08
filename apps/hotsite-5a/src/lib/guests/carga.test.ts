import { describe, expect, it } from "vitest";
import { limparEmpresa, planejarCargaNominal, planejarCota, type VideoInfo } from "./carga";
import { GuestDocSchema, type GuestDoc } from "./schema";
import { CODIGO_RE, CODIGO_VIP_RE } from "./codigo";
import { cota, T0 } from "./test-helpers";

const videos = new Map<string, VideoInfo>([
  ["v3", { titulo: "Avulso recente", publicadoEm: "2026-09-25" }],
  ["v1", { titulo: "Arquitetura Orientada a Eventos", publicadoEm: "2022-01-19" }],
  ["v2", { titulo: "Comunidade de Dados", publicadoEm: "2022-02-02" }],
]);
const views = new Map([["v1", 823], ["v2", 454]]);
const T1 = new Date("2026-10-10T00:00:00Z");

const entrada = [
  { nome: "Rômulo Barbosa", videoIds: ["v3", "v1", "v2"] },
  { nome: "Armando de Vilhena Moraes Nogueira", videoIds: ["v2"] },
];

describe("planejarCargaNominal", () => {
  it("cria documentos válidos, com o primeiro episódio em [0] (D7)", () => {
    const p = planejarCargaNominal(entrada, [], videos, views, T0);
    expect(p.criar).toHaveLength(2);
    for (const d of p.criar) {
      expect(GuestDocSchema.safeParse(d).success).toBe(true);
      expect(d.codigo).toMatch(CODIGO_RE);
      expect(d.cotaPatrocinador).toBe(false);
    }
    const romulo = p.criar[0];
    expect(romulo.episodios.map((e) => e.publicadoEm)).toEqual(["2022-01-19", "2022-02-02", "2026-09-25"]);
    expect(romulo.episodios[2].views).toBeNull(); // sem views no snapshot
    expect(romulo.primeiroNome).toBe("Rômulo");
  });

  it("recarga é idempotente e preserva respostas (32.2 AC 4)", () => {
    const primeira = planejarCargaNominal(entrada, [], videos, views, T0).criar;
    const respondidos: GuestDoc[] = primeira.map((d, i) =>
      i === 0
        ? { ...d, status: "confirmado", acompanhantePermitido: true, acompanhanteNome: "Ana", historico: [{ em: T0, status: "confirmado", acompanhanteNome: null }] }
        : d
    );
    const segunda = planejarCargaNominal(entrada, respondidos, videos, views, T1);
    expect(segunda.criar).toHaveLength(0);
    expect(segunda.atualizar).toHaveLength(0);
    expect(segunda.semMudanca.sort()).toEqual(primeira.map((d) => d.codigo).sort());

    const novasViews = new Map([["v1", 900], ["v2", 454]]);
    const terceira = planejarCargaNominal(entrada, respondidos, videos, novasViews, T1);
    // só o Rômulo tem o v1, cujas views mudaram; o Armando (só v2) fica sem mudança
    expect(terceira.atualizar.map((u) => u.codigo)).toEqual([primeira[0].codigo]);
    expect(terceira.semMudanca).toEqual([primeira[1].codigo]);
    for (const u of terceira.atualizar) {
      expect(Object.keys(u.campos).sort()).toEqual(["atualizadoEm", "episodios"]);
    }
  });

  it("nome duplicado na entrada aborta antes de escrever", () => {
    expect(() => planejarCargaNominal([entrada[0], entrada[0]], [], videos, views, T0)).toThrow(/duplicado/);
  });

  it("vídeo inexistente aborta", () => {
    expect(() => planejarCargaNominal([{ nome: "X", videoIds: ["nao"] }], [], videos, views, T0)).toThrow(/não encontrado/);
  });

  it("empresa (D30): grava ao criar, atualiza só sem resposta, preserva a do convidado", () => {
    const comEmpresa = [{ ...entrada[0], empresa: "Klever" }, { ...entrada[1], empresa: "ND" }];
    const [romulo, armando] = planejarCargaNominal(comEmpresa, [], videos, views, T0).criar;
    expect(romulo.empresa).toBe("Klever");
    expect(armando.empresa).toBeNull();

    const nova = [{ ...entrada[0], empresa: "Nubank" }, { ...entrada[1], empresa: "Itaú" }];
    const semResposta = planejarCargaNominal(nova, [romulo, armando], videos, views, T1);
    expect(semResposta.atualizar.map((u) => u.campos.empresa).sort()).toEqual(["Itaú", "Nubank"]);

    const respondeu = { ...romulo, status: "confirmado" as const, empresa: "Klever Labs", historico: [{ em: T0, status: "confirmado" as const, acompanhanteNome: null, empresa: "Klever Labs" }] };
    const depois = planejarCargaNominal(nova, [respondeu, armando], videos, views, T1);
    expect(depois.atualizar.map((u) => u.codigo)).toEqual([armando.codigo]);

    // entrada sem o campo não apaga a empresa já carregada
    const semCampo = planejarCargaNominal(entrada, [romulo, armando], videos, views, T1);
    expect(semCampo.atualizar).toHaveLength(0);
  });

  it("limparEmpresa: ND e vazio viram null", () => {
    expect(limparEmpresa("ND")).toBeNull();
    expect(limparEmpresa("  ")).toBeNull();
    expect(limparEmpresa(undefined)).toBeNull();
    expect(limparEmpresa(" Mercado  Livre ")).toBe("Mercado Livre");
  });

  it("nunca toca documentos de cota", () => {
    const p = planejarCargaNominal(entrada, [cota()], videos, views, T0);
    expect(p.atualizar).toHaveLength(0);
    expect(p.criar.map((d) => d.codigo)).not.toContain("KLEVERVIP417");
  });
});

describe("planejarCota (D18/D20)", () => {
  it("cria N códigos VIP válidos e únicos", () => {
    const docs = planejarCota("Klever", 10, [cota()], T0);
    expect(docs).toHaveLength(10);
    expect(new Set(docs.map((d) => d.codigo)).size).toBe(10);
    for (const d of docs) {
      expect(d.codigo).toMatch(CODIGO_VIP_RE);
      expect(d.codigo).not.toBe("KLEVERVIP417");
      expect(GuestDocSchema.safeParse(d).success).toBe(true);
      expect(d).toMatchObject({ cotaPatrocinador: true, patrocinador: "Klever", nome: null, status: "pendente" });
    }
  });

  it("quantidade inválida aborta", () => {
    expect(() => planejarCota("Klever", 0, [], T0)).toThrow();
  });
});
