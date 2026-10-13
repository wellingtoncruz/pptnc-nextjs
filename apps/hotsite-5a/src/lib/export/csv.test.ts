import { describe, expect, it } from "vitest";
import { celula, dataBrt, gerarCsv, problemasDeContato, totais } from "./csv";
import { cota, nominal } from "../guests/test-helpers";

const docs = [
  nominal({ codigo: "ZECA100", nome: "Zeca Ávila", status: "confirmado", acompanhantePermitido: true, acompanhanteNome: "Bia", email: "zeca@x.io", celular: "11987654321" }),
  nominal({ codigo: "ANA100", nome: "Ana Lu", empresa: "Acme", status: "recusou", acompanhanteNome: "Guardado", email: "ana@guardado.io", celular: "21999998888" }),
  nominal({ codigo: "ELIS100", nome: "Élis Souza", status: "pendente" }),
  cota({ status: "confirmado", nome: "Joana; \"Jo\" Prado", email: "joana@klever.io" }),
  cota({ codigo: "KLEVERVIP555" }),
];

describe("gerarCsv (32.5)", () => {
  const csv = gerarCsv(docs, [{ codigo: "QUEBRADO1", motivo: "nome ausente" }]);
  const linhas = csv.slice(1).split("\r\n");

  it("começa com BOM e usa ';'", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(linhas[0].split(";")).toHaveLength(12);
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

  it("empresa logo depois do nome, para todos os status (D30)", () => {
    expect(linhas[0].startsWith("Nome;Empresa;Código;")).toBe(true);
    expect(linhas.find((l) => l.startsWith("Ana Lu"))!.startsWith("Ana Lu;Acme;ANA100;Recusou;")).toBe(true);
    expect(linhas.find((l) => l.startsWith("Élis"))!.startsWith("Élis Souza;;ELIS100;")).toBe(true);
  });

  it("confirmado sem email vira problema", () => {
    expect(problemasDeContato([...docs, nominal({ codigo: "SEMEMAIL1", status: "confirmado" })])).toEqual([
      { codigo: "SEMEMAIL1", motivo: "confirmado sem email" },
    ]);
  });

  it("totais batem com a contagem", () => {
    expect(totais(docs)).toEqual({ confirmados: 2, acompanhantes: 1, esperados: 3, recusas: 1, pendentes: 2, excluidos: 0 });
    expect(csv).toContain("Pessoas esperadas;3");
  });

  it("totais por patrocinador e seção de problemas", () => {
    expect(csv).toContain("Klever;2;1;0;1;0");
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

describe("exclusão lógica no CSV (32.12)", () => {
  const comExcluido = [...docs,
    nominal({ codigo: "BRUNO978", nome: "Bruno Campos", status: "excluido", acompanhanteNome: "Guardado", email: "bruno@guardado.io" }),
    cota({ codigo: "KLEVERVIP999", status: "excluido" })];
  const csv = gerarCsv(comExcluido);

  it("a linha continua, com status Excluído e sem contato nem acompanhante", () => {
    const linha = csv.split("\r\n").find((l) => l.startsWith("Bruno Campos;"))!;
    expect(linha.split(";")[3]).toBe("Excluído");
    expect(linha).not.toContain("Guardado");
    expect(linha).not.toContain("bruno@guardado.io");
  });

  it("totais e cotas contam os excluídos à parte", () => {
    expect(totais(comExcluido)).toMatchObject({ confirmados: 2, esperados: 3, recusas: 1, pendentes: 2, excluidos: 2 });
    expect(csv).toContain("Excluídos;2");
    expect(csv).toContain("Klever;3;1;0;1;1");
  });
});
