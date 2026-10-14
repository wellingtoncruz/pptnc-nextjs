import { describe, expect, it } from "vitest";
import { formatarCelular, validarCelular, validarEmail } from "./contato";

describe("validarEmail", () => {
  it("normaliza trim e minúsculas", () => {
    expect(validarEmail("  Joana.Prado@Klever.IO ")).toBe("joana.prado@klever.io");
  });
  it.each(["", "   ", "joana", "joana@", "@klever.io", "joana@klever", "jo ana@klever.io", "joana@@klever.io", "joana@klever..io"])(
    "rejeita %j",
    (v) => expect(validarEmail(v)).toBeNull()
  );
  it("rejeita acima de 254 caracteres e não-string", () => {
    expect(validarEmail(`${"a".repeat(250)}@x.io`)).toBeNull();
    expect(validarEmail(null)).toBeNull();
    expect(validarEmail(undefined)).toBeNull();
  });
});

describe("validarCelular", () => {
  it("vazio é opcional", () => {
    expect(validarCelular("")).toEqual({ ok: true, valor: null });
    expect(validarCelular("  ")).toEqual({ ok: true, valor: null });
    expect(validarCelular(undefined)).toEqual({ ok: true, valor: null });
  });
  it.each([
    ["(11) 98765-4321", "11987654321"],
    ["11 98765 4321", "11987654321"],
    ["+55 11 98765-4321", "11987654321"],
    ["5511987654321", "11987654321"],
    ["(21) 3333-4444", "2133334444"],
  ])("aceita %j → %s", (v, esperado) => expect(validarCelular(v)).toEqual({ ok: true, valor: esperado }));
  it.each(["98765-4321", "123", "(01) 98765-4321", "119876543210000", "abc"])("rejeita %j", (v) =>
    expect(validarCelular(v)).toEqual({ ok: false })
  );
});

describe("formatarCelular", () => {
  it("11 e 10 dígitos", () => {
    expect(formatarCelular("11987654321")).toBe("(11) 98765-4321");
    expect(formatarCelular("2133334444")).toBe("(21) 3333-4444");
    expect(formatarCelular(null)).toBe("");
  });
});
