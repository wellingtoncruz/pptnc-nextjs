import { describe, expect, it } from "vitest";
import { CODIGO_RE, CODIGO_VIP_RE, gerarCodigo, gerarCodigoVip, normalizarCodigo, soLetras } from "./codigo";

describe("gerarCodigo (D8)", () => {
  it("usa o primeiro nome sem acento + 3 dígitos", () => {
    const c = gerarCodigo("Rômulo Barbosa", new Set(), () => 0.5);
    expect(c).toBe("ROMULO550");
  });

  it.each(["Luís Rúdi Afonso Silva", "Fábio Mesquita", "Ägata Çelik", "Ana Lu", "Dr. João"])(
    "%s gera código A-Z0-9 com até 20 caracteres",
    (nome) => {
      const c = gerarCodigo(nome, new Set());
      expect(c).toMatch(CODIGO_RE);
      expect(c.length).toBeLessThanOrEqual(20);
    }
  );

  it("corta primeiro nome com mais de 17 letras", () => {
    const c = gerarCodigo("Maximilianocristovao Souza", new Set());
    expect(c).toMatch(/^MAXIMILIANOCRISTO\d{3}$/);
    expect(c).toHaveLength(20);
  });

  it("nunca repete código, mesmo com 900 nomes iguais", () => {
    const usados = new Set<string>();
    for (let i = 0; i < 900; i++) gerarCodigo("Mariana", usados);
    expect(usados.size).toBe(900);
    expect(() => gerarCodigo("Mariana", usados)).toThrow(/Sem códigos livres/);
  });

  it("respeita códigos já existentes na collection", () => {
    const usados = new Set(["ANA550"]);
    const seq = [0.5, 0.5, 0.1];
    const c = gerarCodigo("Ana", usados, () => seq.shift() ?? 0.2);
    expect(c).toBe("ANA190");
  });

  it("nome sem letras cai em CONVIDADO", () => {
    expect(gerarCodigo("123", new Set(), () => 0)).toBe("CONVIDADO100");
  });
});

describe("gerarCodigoVip (D20)", () => {
  it("gera PATROCINADORVIP + 3 dígitos", () => {
    const c = gerarCodigoVip("Klever", new Set(), () => 0.35);
    expect(c).toBe("KLEVERVIP415");
    expect(c).toMatch(CODIGO_VIP_RE);
  });

  it("limita o patrocinador a 14 letras e fica em 20", () => {
    const c = gerarCodigoVip("Null Platform Internacional", new Set());
    expect(c).toMatch(/^NULLPLATFORMINVIP\d{3}$/);
    expect(c).toHaveLength(20);
  });

  it("nunca colide com nominal (nominal termina em letra+3 dígitos sem VIP)", () => {
    const vip = gerarCodigoVip("Klever", new Set());
    const nom = gerarCodigo("Klever Souza", new Set());
    expect(vip.startsWith("KLEVERVIP")).toBe(true);
    expect(nom).toMatch(/^KLEVER\d{3}$/);
  });
});

describe("normalizarCodigo", () => {
  it("tira espaços e põe em maiúsculas", () => {
    expect(normalizarCodigo("  mari ana742 ")).toBe("MARIANA742");
    expect(normalizarCodigo(undefined)).toBe("");
  });
  it("soLetras remove diacríticos", () => {
    expect(soLetras("Conceição")).toBe("CONCEICAO");
  });
});
