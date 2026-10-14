import { describe, expect, it } from "vitest";
import { formatarNumero, mesAno, resumoMaisEpisodios, visualizacoes } from "./format";
import { textosPara } from "./textos";

describe("formatação PT-BR (32.4 AC 3)", () => {
  it.each([
    [860, "860"], [94, "94"], [1000, "1 mil"], [12400, "12,4 mil"], [18900, "18,9 mil"],
    [41260, "41,2 mil"], [999999, "999,9 mil"], [2650000, "2,65 mi"], [4300000, "4,3 mi"],
  ])("%d → %s", (n, s) => expect(formatarNumero(n)).toBe(s));

  it("mês/ano do primeiro episódio", () => {
    expect(mesAno("2022-01-19")).toBe("jan/2022");
    expect(mesAno("2026-12-01")).toBe("dez/2026");
  });

  it("resumo sem 'desde' (D14)", () => {
    expect(resumoMaisEpisodios(2, 18900)).toBe("E mais 2 episódios com 18,9 mil visualizações.");
    expect(resumoMaisEpisodios(1, 1)).toBe("E mais 1 episódio com 1 visualização.");
    expect(resumoMaisEpisodios(41, null)).toBe("E mais 41 episódios.");
    expect(resumoMaisEpisodios(3, 5000)).not.toContain("desde");
  });

  it("visualizações", () => expect(visualizacoes(860)).toBe("860 visualizações"));
});

describe("textos (D15, D21)", () => {
  const nominal = textosPara({ cota: false, patrocinador: null, primeiroNome: "Mariana" });
  const cota = textosPara({ cota: true, patrocinador: "Klever", primeiroNome: null });

  it("nenhum texto fala em 22/10", () => {
    for (const t of [nominal, cota]) expect(JSON.stringify(t)).not.toContain("22/10");
  });

  it("nominal chama pelo primeiro nome", () => {
    expect(nominal.recusouTitulo).toBe("Que pena, Mariana.");
    expect(nominal.rotulo).toBe("Convite pessoal · 5 anos");
  });

  it("cota é impessoal e cita o patrocinador", () => {
    expect(cota.rotulo).toBe("Convite Klever · 5 anos");
    expect(cota.titulo).toBe("Um convite para você");
    expect(cota.recusouTitulo).toBe("Que pena.");
    expect(cota.nota).toMatch(/^Em cinco anos, o PPT Não Compila/);
    expect(JSON.stringify(cota)).not.toMatch(/Mariana|undefined|null/);
  });
});
