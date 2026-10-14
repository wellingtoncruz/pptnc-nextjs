import { describe, expect, it } from "vitest";
import { confirmar, definirAcompanhante, excluir, marcarConvidado, permitirAcompanhante, recusar, respondeu, validarNome } from "./rules";
import { cota, nominal, T0 } from "./test-helpers";
import type { GuestDoc } from "./schema";

const T1 = new Date("2026-10-08T12:00:00Z");
const E = { empresa: "Exemplo SA", email: "mariana@exemplo.com.br" };
const aplica = (doc: GuestDoc, m: ReturnType<typeof confirmar>) =>
  m.ok && m.mudou ? { ...doc, ...m.campos } : doc;

describe("transições (32.3 AC 5)", () => {
  it("pendente → confirmado → recusou → confirmado gera 3 entradas em ordem", () => {
    let d = nominal();
    d = aplica(d, confirmar(d, T0, E));
    d = aplica(d, recusar(d, T1));
    d = aplica(d, confirmar(d, new Date("2026-10-09T12:00:00Z"), E));
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
    expect(confirmar(nominal({ status: "confirmado", empresa: E.empresa, email: E.email }), T0, E)).toEqual({ ok: true, mudou: false });
    expect(recusar(nominal({ status: "recusou" }), T0)).toEqual({ ok: true, mudou: false });
  });

  it("recusar não apaga o acompanhante e voltar a confirmar o mantém (D16)", () => {
    let d = nominal({ status: "confirmado", acompanhantePermitido: true, acompanhanteNome: "Rafael" });
    d = aplica(d, recusar(d, T0));
    expect(d.acompanhanteNome).toBe("Rafael");
    d = aplica(d, confirmar(d, T1, E));
    expect(d.acompanhanteNome).toBe("Rafael");
  });

  it("nominal ignora nome enviado ao confirmar", () => {
    const d = nominal();
    const m = confirmar(d, T0, { ...E, nome: "Outro Nome" });
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
    expect(confirmar(cota(), T0, E)).toEqual({ ok: false, erro: "NOME_OBRIGATORIO" });
    expect(confirmar(cota(), T0, { ...E, nome: "  " })).toEqual({ ok: false, erro: "NOME_OBRIGATORIO" });
  });

  it("confirmar com nome grava nome e status, com o nome no histórico", () => {
    const m = confirmar(cota(), T0, { ...E, nome: "Joana Prado" });
    expect(m.ok && m.mudou && m.campos).toMatchObject({ nome: "Joana Prado", status: "confirmado" });
    expect(m.ok && m.mudou && m.campos.historico?.[0]).toMatchObject({ nome: "Joana Prado", status: "confirmado" });
  });

  it("recusar sem nome passa", () => {
    expect(recusar(cota(), T0).ok).toBe(true);
  });

  it("cota → recusar → confirmar não pede o nome de novo", () => {
    let d = cota();
    d = aplica(d, confirmar(d, T0, { ...E, nome: "Joana Prado" }));
    d = aplica(d, recusar(d, T1));
    const m = confirmar(d, T1, E);
    expect(m.ok).toBe(true);
    expect(d.nome).toBe("Joana Prado");
  });
});

describe("contato na confirmação (D22–D24)", () => {
  it("email obrigatório e validado; celular opcional e validado", () => {
    expect(confirmar(nominal(), T0, { empresa: E.empresa })).toEqual({ ok: false, erro: "EMAIL_OBRIGATORIO" });
    expect(confirmar(nominal(), T0, { empresa: E.empresa, email: "  " })).toEqual({ ok: false, erro: "EMAIL_OBRIGATORIO" });
    expect(confirmar(nominal(), T0, { empresa: E.empresa, email: "mariana@" })).toEqual({ ok: false, erro: "EMAIL_INVALIDO" });
    expect(confirmar(nominal(), T0, { ...E, celular: "123" })).toEqual({ ok: false, erro: "CELULAR_INVALIDO" });
  });

  it("cota valida na ordem nome → empresa → email → celular", () => {
    expect(confirmar(cota(), T0, { celular: "123" })).toEqual({ ok: false, erro: "NOME_OBRIGATORIO" });
    expect(confirmar(cota(), T0, { nome: "Joana", celular: "123" })).toEqual({ ok: false, erro: "EMPRESA_OBRIGATORIA" });
    expect(confirmar(cota(), T0, { nome: "Joana", empresa: "Klever", celular: "123" })).toEqual({ ok: false, erro: "EMAIL_OBRIGATORIO" });
    expect(confirmar(cota(), T0, { nome: "Joana", empresa: "Klever", email: "joana@klever.io", celular: "123" })).toEqual({ ok: false, erro: "CELULAR_INVALIDO" });
  });

  it("grava email normalizado e celular só com dígitos, também no histórico", () => {
    const m = confirmar(nominal(), T0, { empresa: E.empresa, email: " Mariana@Exemplo.com.br ", celular: "(11) 98765-4321" });
    expect(m.ok && m.mudou && m.campos).toMatchObject({ email: "mariana@exemplo.com.br", celular: "11987654321", respondidoEm: T0 });
    expect(m.ok && m.mudou && m.campos.historico?.[0]).toMatchObject({ email: "mariana@exemplo.com.br", celular: "11987654321" });
  });

  it("sem celular grava null", () => {
    const m = confirmar(nominal(), T0, E);
    expect(m.ok && m.mudou && m.campos.celular).toBeNull();
  });

  it("já confirmado com contato diferente atualiza e gera entrada, sem mexer em respondidoEm", () => {
    const d = nominal({ status: "confirmado", empresa: E.empresa, email: E.email, celular: null, respondidoEm: T0, historico: [] });
    const m = confirmar(d, T1, { empresa: E.empresa, email: "novo@exemplo.com.br", celular: "11987654321" });
    expect(m.ok && m.mudou && m.campos).toMatchObject({ email: "novo@exemplo.com.br", celular: "11987654321" });
    expect(m.ok && m.mudou && m.campos.respondidoEm).toBeUndefined();
    expect(m.ok && m.mudou && m.campos.historico).toHaveLength(1);
  });

  it("recusar não lê nem altera o contato (D23)", () => {
    const d = nominal({ status: "confirmado", email: E.email, celular: "11987654321" });
    const m = recusar(d, T0);
    expect(m.ok && m.mudou && "email" in m.campos).toBe(false);
    const depois = aplica(d, m);
    expect(depois).toMatchObject({ email: E.email, celular: "11987654321" });
  });
});

describe("empresa na confirmação (D30)", () => {
  it("obrigatória e validada", () => {
    expect(confirmar(nominal(), T0, { email: E.email })).toEqual({ ok: false, erro: "EMPRESA_OBRIGATORIA" });
    expect(confirmar(nominal(), T0, { ...E, empresa: "  " })).toEqual({ ok: false, erro: "EMPRESA_OBRIGATORIA" });
    expect(confirmar(nominal(), T0, { ...E, empresa: "x".repeat(81) })).toEqual({ ok: false, erro: "EMPRESA_INVALIDA" });
  });

  it("confirmar a empresa carregada grava a mesma; corrigir troca e entra no histórico", () => {
    const d = nominal({ empresa: "Mercado Livre" });
    const m = confirmar(d, T0, { ...E, empresa: " Mercado  Livre " });
    expect(m.ok && m.mudou && m.campos.empresa).toBe("Mercado Livre");
    const conf = aplica(d, m);
    expect(confirmar(conf, T1, { ...E, empresa: "Mercado Livre" })).toEqual({ ok: true, mudou: false });
    const troca = confirmar(conf, T1, { ...E, empresa: "Nubank" });
    expect(troca.ok && troca.mudou && troca.campos).toMatchObject({ empresa: "Nubank" });
    expect(troca.ok && troca.mudou && troca.campos.historico?.at(-1)).toMatchObject({ empresa: "Nubank" });
    expect(troca.ok && troca.mudou && troca.campos.respondidoEm).toBeUndefined();
  });

  it("recusar não toca a empresa", () => {
    const m = recusar(nominal({ empresa: "Klever" }), T0);
    expect(m.ok && m.mudou && "empresa" in m.campos).toBe(false);
  });
});

describe("marcação convidado (32.10)", () => {
  it("marca, desmarca e é idempotente; nunca toca resposta, contato nem histórico", () => {
    // Pendente: quem já respondeu não desmarca (32.13), coberto abaixo.
    const d = nominal({ email: "m@x.io" });
    const m = marcarConvidado(d, T1, true);
    expect(m.ok && m.mudou && m.campos).toEqual({ convidadoEm: T1, atualizadoEm: T1 });
    const marcado = aplica(d, m);
    expect(marcarConvidado(marcado, T1, true)).toEqual({ ok: true, mudou: false });
    const des = marcarConvidado(marcado, T1, false);
    expect(des.ok && des.mudou && des.campos).toEqual({ convidadoEm: null, atualizadoEm: T1 });
    expect(marcarConvidado(d, T1, false)).toEqual({ ok: true, mudou: false });
  });

  it("responder não mexe na marcação", () => {
    const d = nominal({ convidadoEm: T0, empresa: "X" });
    const m = confirmar(d, T1, { empresa: "X", email: "m@x.io" });
    expect(m.ok && m.mudou && "convidadoEm" in m.campos).toBe(false);
  });
});

describe("permissão de acompanhante pelo painel (32.11)", () => {
  it("libera e bloqueia sem nome; idempotente; não toca status, resposta nem histórico", () => {
    const d = nominal({ status: "confirmado", respondidoEm: T0 });
    const lib = permitirAcompanhante(d, T1, true);
    expect(lib.ok && lib.mudou && lib.campos).toEqual({ acompanhantePermitido: true, atualizadoEm: T1 });
    const liberado = aplica(d, lib);
    expect(permitirAcompanhante(liberado, T1, true)).toEqual({ ok: true, mudou: false });
    const bl = permitirAcompanhante(liberado, T1, false);
    expect(bl.ok && bl.mudou && bl.campos).toEqual({ acompanhantePermitido: false, atualizadoEm: T1 });
    expect(permitirAcompanhante(d, T1, false)).toEqual({ ok: true, mudou: false });
  });

  it("bloquear quem já informou o +1 apaga o nome e registra no histórico", () => {
    const d = nominal({ status: "confirmado", respondidoEm: T0, acompanhantePermitido: true, acompanhanteNome: "Bia" });
    const m = permitirAcompanhante(d, T1, false);
    expect(m.ok && m.mudou && m.campos).toMatchObject({ acompanhantePermitido: false, acompanhanteNome: null });
    expect(m.ok && m.mudou && m.campos.historico?.at(-1)).toEqual({ em: T1, status: "confirmado", acompanhanteNome: null });
    expect(m.ok && m.mudou && "respondidoEm" in m.campos).toBe(false);
  });

  it("liberado, o convidado confirmado pode informar o +1", () => {
    const d = aplica(nominal({ status: "confirmado" }), permitirAcompanhante(nominal({ status: "confirmado" }), T0, true));
    expect(definirAcompanhante(d, T1, "Bia").ok).toBe(true);
  });
});

describe("validarNome", () => {
  it("rejeita caractere de controle", () => {
    expect(validarNome("Ana\u0007")).toBeNull();
    expect(validarNome("Ana Lu")).toBe("Ana Lu");
  });
});

describe("exclusão lógica (32.12)", () => {
  const confirmado = nominal({ status: "confirmado", email: "m@x.io", celular: "11987654321", empresa: "Exemplo SA",
    acompanhantePermitido: true, acompanhanteNome: "Bia", respondidoEm: T0, convidadoEm: T0 });

  it("qualquer status → excluido, com data e entrada no histórico; não apaga nada", () => {
    for (const d of [nominal(), confirmado, nominal({ status: "recusou", respondidoEm: T0 }), cota()]) {
      const m = excluir(d, T1);
      const depois = aplica(d, m);
      expect(depois.status).toBe("excluido");
      expect(depois.excluidoEm).toEqual(T1);
      expect(depois.historico.at(-1)).toMatchObject({ em: T1, status: "excluido" });
      expect(depois.historico).toHaveLength(d.historico.length + 1);
    }
    const depois = aplica(confirmado, excluir(confirmado, T1));
    expect(depois).toMatchObject({ email: "m@x.io", celular: "11987654321", empresa: "Exemplo SA", acompanhanteNome: "Bia", respondidoEm: T0, convidadoEm: T0 });
  });

  it("idempotente: excluir de novo não muda nada", () => {
    const depois = aplica(confirmado, excluir(confirmado, T1));
    expect(excluir(depois, new Date("2026-10-09T12:00:00Z"))).toEqual({ ok: true, mudou: false });
  });

  it("excluído não aceita marcação nem mudança de +1 pelo painel", () => {
    const depois = aplica(confirmado, excluir(confirmado, T1));
    expect(marcarConvidado(depois, T1, false)).toEqual({ ok: true, mudou: false });
    expect(permitirAcompanhante(depois, T1, false)).toEqual({ ok: true, mudou: false });
  });
});

describe("responder marca como convidado (32.13)", () => {
  it("confirmar sem a marcação marca com a hora da confirmação", () => {
    const m = confirmar(nominal(), T0, E);
    expect(m.ok && m.mudou && m.campos.convidadoEm).toEqual(T0);
  });

  it("recusar sem a marcação marca com a hora da recusa", () => {
    const m = recusar(nominal(), T0);
    expect(m.ok && m.mudou && m.campos.convidadoEm).toEqual(T0);
  });

  it("já marcado: confirmar e recusar mantêm a data original", () => {
    const d = nominal({ convidadoEm: T1 });
    const c = confirmar(d, T0, E);
    const r = recusar(d, T0);
    expect(c.ok && c.mudou && "convidadoEm" in c.campos).toBe(false);
    expect(r.ok && r.mudou && "convidadoEm" in r.campos).toBe(false);
  });

  it("quem respondeu não desmarca; quem não respondeu desmarca", () => {
    expect(marcarConvidado(nominal({ status: "confirmado", convidadoEm: T1 }), T0, false)).toEqual({ ok: true, mudou: false });
    expect(marcarConvidado(nominal({ status: "recusou", convidadoEm: T1 }), T0, false)).toEqual({ ok: true, mudou: false });
    const m = marcarConvidado(nominal({ convidadoEm: T1 }), T0, false);
    expect(m.ok && m.mudou && m.campos.convidadoEm).toBeNull();
  });

  it("respondeu = confirmado ou recusou", () => {
    expect(["pendente", "confirmado", "recusou", "excluido"].map((status) => respondeu({ status } as never))).toEqual([false, true, true, false]);
  });
});
