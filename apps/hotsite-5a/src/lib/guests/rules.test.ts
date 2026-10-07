import { describe, expect, it } from "vitest";
import { confirmar, definirAcompanhante, recusar, validarNome } from "./rules";
import { cota, nominal, T0 } from "./test-helpers";
import type { GuestDoc } from "./schema";

const T1 = new Date("2026-10-08T12:00:00Z");
const aplica = (doc: GuestDoc, m: ReturnType<typeof confirmar>) =>
  m.ok && m.mudou ? { ...doc, ...m.campos } : doc;

describe("transições (32.3 AC 5)", () => {
  it("pendente → confirmado → recusou → confirmado gera 3 entradas em ordem", () => {
    let d = nominal();
    d = aplica(d, confirmar(d, T0));
    d = aplica(d, recusar(d, T1));
    d = aplica(d, confirmar(d, new Date("2026-10-09T12:00:00Z")));
    expect(d.status).toBe("confirmado");
    expect(d.historico.map((h) => h.status)).toEqual(["confirmado", "recusou", "confirmado"]);
    expect(d.respondidoEm).toEqual(new Date("2026-10-09T12:00:00Z"));
  });

  it("pendente → recusou direto", () => {
    const d = nominal();
    const m = recusar(d, T0);
    expect(m.ok && m.mudou && m.campos.status).toBe("recusou");
  });

  it("confirmar e recusar são idempotentes", () => {
    expect(confirmar(nominal({ status: "confirmado" }), T0)).toEqual({ ok: true, mudou: false });
    expect(recusar(nominal({ status: "recusou" }), T0)).toEqual({ ok: true, mudou: false });
  });

  it("recusar não apaga o acompanhante e voltar a confirmar o mantém (D16)", () => {
    let d = nominal({ status: "confirmado", acompanhantePermitido: true, acompanhanteNome: "Rafael" });
    d = aplica(d, recusar(d, T0));
    expect(d.acompanhanteNome).toBe("Rafael");
    d = aplica(d, confirmar(d, T1));
    expect(d.acompanhanteNome).toBe("Rafael");
  });

  it("nominal ignora nome enviado ao confirmar", () => {
    const d = nominal();
    const m = confirmar(d, T0, "Outro Nome");
    expect(m.ok && m.mudou && m.campos.nome).toBeUndefined();
  });
});

describe("acompanhante: 4 quadrantes (32.3 AC 4)", () => {
  it.each([
    [true, "confirmado", true],
    [true, "pendente", false],
    [false, "confirmado", false],
    [false, "pendente", false],
  ] as const)("permitido=%s status=%s → aceita=%s", (permitido, status, aceita) => {
    const d = nominal({ acompanhantePermitido: permitido, status });
    const m = definirAcompanhante(d, T0, "Rafael Albuquerque");
    expect(m.ok).toBe(aceita);
    if (!aceita) expect(m).toEqual({ ok: false, erro: "ACOMPANHANTE_NAO_PERMITIDO" });
  });

  it("recusou também não aceita", () => {
    expect(definirAcompanhante(nominal({ acompanhantePermitido: true, status: "recusou" }), T0, "X").ok).toBe(false);
  });

  it("alterar gera 1 entrada no histórico", () => {
    const d = nominal({ acompanhantePermitido: true, status: "confirmado" });
    const m = definirAcompanhante(d, T0, "  Rafael   Albuquerque ");
    expect(m.ok && m.mudou && m.campos.acompanhanteNome).toBe("Rafael Albuquerque");
    expect(m.ok && m.mudou && m.campos.historico).toHaveLength(1);
  });

  it("nome inválido não muda nada", () => {
    const d = nominal({ acompanhantePermitido: true, status: "confirmado" });
    expect(definirAcompanhante(d, T0, "   ")).toEqual({ ok: false, erro: "NOME_INVALIDO" });
    expect(definirAcompanhante(d, T0, "a".repeat(81))).toEqual({ ok: false, erro: "NOME_INVALIDO" });
  });
});

describe("cota de patrocinador (D19)", () => {
  it("confirmar sem nome → NOME_OBRIGATORIO", () => {
    expect(confirmar(cota(), T0)).toEqual({ ok: false, erro: "NOME_OBRIGATORIO" });
    expect(confirmar(cota(), T0, "  ")).toEqual({ ok: false, erro: "NOME_OBRIGATORIO" });
  });

  it("confirmar com nome grava nome e status, com o nome no histórico", () => {
    const m = confirmar(cota(), T0, "Joana Prado");
    expect(m.ok && m.mudou && m.campos).toMatchObject({ nome: "Joana Prado", status: "confirmado" });
    expect(m.ok && m.mudou && m.campos.historico?.[0]).toMatchObject({ nome: "Joana Prado", status: "confirmado" });
  });

  it("recusar sem nome passa", () => {
    expect(recusar(cota(), T0).ok).toBe(true);
  });

  it("cota → recusar → confirmar não pede o nome de novo", () => {
    let d = cota();
    d = aplica(d, confirmar(d, T0, "Joana Prado"));
    d = aplica(d, recusar(d, T1));
    const m = confirmar(d, T1);
    expect(m.ok).toBe(true);
    expect(d.nome).toBe("Joana Prado");
  });
});

describe("validarNome", () => {
  it("rejeita caractere de controle", () => {
    expect(validarNome("Ana\u0007")).toBeNull();
    expect(validarNome("Ana Lu")).toBe("Ana Lu");
  });
});
