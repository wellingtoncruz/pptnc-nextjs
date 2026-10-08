import { describe, expect, it } from "vitest";
import { celula, dataBrt, gerarCsv, problemasDeContato, totais } from "./csv";
import { cota, nominal } from "../guests/test-helpers";

const docs = [
  nominal({ codigo: "ZECA100", nome: "Zeca Ávila", status: "confirmado", acompanhantePermitido: true, acompanhanteNome: "Bia", email: "zeca@x.io", celular: "11987654321" }),
  nominal({ codigo: "ANA100", nome: "Ana Lu", status: "recusou", acompanhanteNome: "Guardado", email: "ana@guardado.io", celular: "21999998888" }),
  nominal({ codigo: "ELIS100", nome: "Élis Souza", status: "pendente" }),
  cota({ status: "confirmado", nome: "Joana; \"Jo\" Prado", email: "joana@klever.io" }),
  cota({ codigo: "KLEVERVIP555" }),
];

describe("gerarCsv (32.5)", () => {
  const csv = gerarCsv(docs, [{ codigo: "QUEBRADO1", motivo: "nome ausente" }]);
  const linhas = csv.slice(1).split("\r\n");

  it("começa com BOM e usa ';'", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(linhas[0].split(";")).toHaveLength(11);
  });

  it("uma linha por documento, em ordem alfabética PT-BR, cota sem nome no fim", () => {
    const esperado = ["Ana Lu;", "Élis Souza;", '"Joana; ""Jo"" Prado";', "Zeca Ávila;", "(não preenchido);"];
    linhas.slice(1, 6).forEach((l, i) => expect(l.startsWith(esperado[i])).toBe(true));
  });

  it("acompanhante só para confirmado (D16)", () => {
    const ana = linhas.find((l) => l.startsWith("Ana Lu"))!;
    expect(ana).not.toContain("Guardado");
    expect(linhas.find((l) => l.startsWith("Zeca"))).toContain(";Bia;");
  });

  it("email e celular só para confirmado (D23), celular formatado", () => {
    expect(linhas[0]).toContain(";Email;Celular;");
    expect(linhas.find((l) => l.startsWith("Zeca"))).toContain(";zeca@x.io;(11) 98765-4321;");
    const ana = linhas.find((l) => l.startsWith("Ana Lu"))!;
    expect(ana).not.toContain("ana@guardado.io");
    expect(ana).not.toContain("99999");
  });

  it("confirmado sem email vira problema", () => {
    expect(problemasDeContato([...docs, nominal({ codigo: "SEMEMAIL1", status: "confirmado" })])).toEqual([
      { codigo: "SEMEMAIL1", motivo: "confirmado sem email" },
    ]);
  });

  it("totais batem com a contagem", () => {
    expect(totais(docs)).toEqual({ confirmados: 2, acompanhantes: 1, esperados: 3, recusas: 1, pendentes: 2 });
    expect(csv).toContain("Pessoas esperadas;3");
  });

  it("totais por patrocinador e seção de problemas", () => {
    expect(csv).toContain("Klever;2;1;0;1");
    expect(csv).toContain("QUEBRADO1;nome ausente");
  });
});

describe("helpers", () => {
  it("escapa aspas, ';' e quebra de linha", () => {
    expect(celula('a"b')).toBe('"a""b"');
    expect(celula("a;b")).toBe('"a;b"');
    expect(celula("a\nb")).toBe('"a\nb"');
    expect(celula(null)).toBe("");
  });
  it("data em horário de Brasília", () => {
    expect(dataBrt(new Date("2026-10-29T22:05:00Z"))).toBe("29/10/2026 19:05");
    expect(dataBrt(null)).toBe("");
  });
});
