import { describe, expect, it, vi } from "vitest";
import { inscrever, validarEspera, type EsperaDoc, type EsperaStore } from "./espera";
import { gerarCsvEspera } from "../export/csv";

const T0 = new Date("2026-10-08T15:00:00Z");
const OK = { nome: "  Paula   Reis ", empresa: "Acme", email: "Paula@Acme.io", celular: "(11) 98765-4321" };

function memoria(): EsperaStore & { docs: EsperaDoc[] } {
  const docs: EsperaDoc[] = [];
  return { docs, async add(d) { docs.push(d); } };
}

describe("validarEspera (32.7)", () => {
  it("normaliza e aceita", () => {
    expect(validarEspera(OK)).toEqual({ ok: true, doc: { nome: "Paula Reis", empresa: "Acme", email: "paula@acme.io", celular: "11987654321" } });
  });
  it("todos os campos são obrigatórios, inclusive o celular (D28)", () => {
    expect(validarEspera({})).toEqual({
      ok: false,
      erros: { nome: "CAMPO_OBRIGATORIO", empresa: "CAMPO_OBRIGATORIO", email: "CAMPO_OBRIGATORIO", celular: "CAMPO_OBRIGATORIO" },
    });
    expect(validarEspera({ ...OK, celular: "  " })).toEqual({ ok: false, erros: { celular: "CAMPO_OBRIGATORIO" } });
  });
  it("email, celular, nome e empresa inválidos", () => {
    expect(validarEspera({ ...OK, email: "paula@" })).toEqual({ ok: false, erros: { email: "EMAIL_INVALIDO" } });
    expect(validarEspera({ ...OK, celular: "123" })).toEqual({ ok: false, erros: { celular: "CELULAR_INVALIDO" } });
    expect(validarEspera({ ...OK, nome: "a".repeat(81) })).toEqual({ ok: false, erros: { nome: "NOME_INVALIDO" } });
    expect(validarEspera({ ...OK, empresa: "x\u0007" })).toEqual({ ok: false, erros: { empresa: "EMPRESA_INVALIDA" } });
  });
});

describe("inscrever (32.7)", () => {
  it("sucesso grava com criadoEm e devolve o primeiro nome", async () => {
    const s = memoria();
    expect(await inscrever(s, OK, T0)).toEqual({ ok: true, primeiroNome: "Paula" });
    expect(s.docs).toEqual([{ nome: "Paula Reis", empresa: "Acme", email: "paula@acme.io", celular: "11987654321", criadoEm: T0 }]);
  });
  it("dois envios iguais geram dois documentos (D24)", async () => {
    const s = memoria();
    await inscrever(s, OK, T0);
    await inscrever(s, OK, T0);
    expect(s.docs).toHaveLength(2);
  });
  it("honeypot preenchido responde sucesso e não grava", async () => {
    const s = memoria();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await inscrever(s, { ...OK, site: "http://spam" }, T0)).ok).toBe(true);
    expect(s.docs).toHaveLength(0);
  });
  it("inválido não grava", async () => {
    const s = memoria();
    expect((await inscrever(s, { ...OK, email: "" }, T0)).ok).toBe(false);
    expect(s.docs).toHaveLength(0);
  });
  it("falha do banco → FALHA_TEMPORARIA, sem lançar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const quebrado: EsperaStore = { add: async () => { throw new Error("UNAVAILABLE"); } };
    expect(await inscrever(quebrado, OK, T0)).toEqual({ ok: false, erro: "FALHA_TEMPORARIA" });
  });
});

describe("gerarCsvEspera (32.7)", () => {
  const docs: EsperaDoc[] = [
    { nome: "Zé", empresa: "B; C", email: "ze@b.io", celular: "2133334444", criadoEm: new Date("2026-10-09T13:00:00Z") },
    { nome: "Paula Reis", empresa: "Acme", email: "paula@acme.io", celular: "11987654321", criadoEm: new Date("2026-10-08T15:00:00Z") },
    { nome: "Paula Reis", empresa: "Acme", email: "paula@acme.io", celular: "11987654321", criadoEm: new Date("2026-10-08T15:05:00Z") },
  ];
  const csv = gerarCsvEspera(docs, [{ codigo: "abc", motivo: "celular: inválido" }]);
  const linhas = csv.slice(1).split("\r\n");

  it("BOM, ';', ordem de chegada, sem deduplicar, celular formatado", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(linhas[0]).toBe("Nome;Empresa;Email;Celular;Enviado em");
    expect(linhas[1]).toBe("Paula Reis;Acme;paula@acme.io;(11) 98765-4321;08/10/2026 12:00");
    expect(linhas[2]).toBe("Paula Reis;Acme;paula@acme.io;(11) 98765-4321;08/10/2026 12:05");
    expect(linhas[3]).toBe('Zé;"B; C";ze@b.io;(21) 3333-4444;09/10/2026 10:00');
  });
  it("total de envios e problemas", () => {
    expect(csv).toContain("Total de envios;3");
    expect(csv).toContain("abc;celular: inválido");
  });
});
