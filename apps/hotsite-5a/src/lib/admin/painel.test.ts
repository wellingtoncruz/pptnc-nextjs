import { describe, expect, it } from "vitest";
import { lerFiltro, montarPainel } from "./painel";
import { totais } from "../export/csv";
import { cota, nominal } from "../guests/test-helpers";

const R = new Date("2026-10-08T15:30:00Z");
const docs = [
  nominal({ codigo: "ZECA100", nome: "Zeca Ávila", empresa: "Acme", status: "confirmado", acompanhantePermitido: true, acompanhanteNome: "Bia", email: "zeca@x.io", celular: "11987654321", respondidoEm: R }),
  nominal({ codigo: "ANA100", nome: "Ana Lu", status: "recusou", acompanhantePermitido: true, acompanhanteNome: "Guardado", email: "ana@guardado.io", celular: "21999998888" }),
  nominal({ codigo: "ELIS100", nome: "Élis Souza", acompanhantePermitido: true }),
  cota({ status: "confirmado", nome: "Joana Prado", email: "joana@klever.io" }),
  cota({ codigo: "KLEVERVIP555" }),
];

describe("painel do anfitrião (32.9)", () => {
  it("contadores batem com os totais do CSV e não mudam com o filtro", () => {
    const t = totais(docs);
    for (const f of ["todos", "confirmados"] as const) {
      expect(montarPainel(docs, 7, f).contadores).toEqual({
        total: 5, confirmados: t.confirmados, pendentes: t.pendentes, recusados: t.recusas, pessoas: t.esperados, espera: 7,
      });
    }
    expect(t).toMatchObject({ confirmados: 2, pendentes: 2, recusas: 1, esperados: 3 });
  });

  it("filtro: todos = uma linha por documento; confirmados só os confirmados", () => {
    expect(montarPainel(docs, 0, "todos").linhas).toHaveLength(5);
    expect(montarPainel(docs, 0, "confirmados").linhas.map((l) => l.codigo)).toEqual(["KLEVERVIP417", "ZECA100"]);
  });

  it("ordem do CSV (A4): alfabética PT-BR, cota sem nome no fim", () => {
    expect(montarPainel(docs, 0, "todos").linhas.map((l) => l.nome)).toEqual(["Ana Lu", "Élis Souza", "Joana Prado", "Zeca Ávila", "(não preenchido)"]);
  });

  it("acompanhante: não liberado, liberado, nome só de confirmado", () => {
    const l = Object.fromEntries(montarPainel([...docs, nominal({ codigo: "SEM1", nome: "Sem Acomp" })], 0, "todos").linhas.map((x) => [x.codigo, x.acompanhante]));
    expect(l).toMatchObject({ SEM1: "—", ELIS100: "Liberado", ANA100: "Liberado", ZECA100: "Bia" });
  });

  it("contato só de confirmado (D23), celular formatado; empresa, tipo e data", () => {
    const l = Object.fromEntries(montarPainel(docs, 0, "todos").linhas.map((x) => [x.codigo, x]));
    expect(l.ZECA100).toMatchObject({ empresa: "Acme", tipo: "Nominal", email: "zeca@x.io", celular: "(11) 98765-4321", respondidoEm: "08/10/2026 12:30", statusTexto: "Confirmado" });
    expect(l.ANA100).toMatchObject({ email: "", celular: "", statusTexto: "Recusou" });
    expect(l.KLEVERVIP417.tipo).toBe("Cota · Klever");
  });

  it("filtro da URL", () => {
    expect(lerFiltro("confirmados")).toBe("confirmados");
    expect(lerFiltro(undefined)).toBe("todos");
    expect(lerFiltro(["confirmados"])).toBe("todos");
    expect(lerFiltro("xyz")).toBe("todos");
  });
});
