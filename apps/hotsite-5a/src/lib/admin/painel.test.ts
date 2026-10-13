import { describe, expect, it } from "vitest";
import { filtrarPorNome, lerFiltro, montarPainel, normalizarBusca } from "./painel";
import { totais } from "../export/csv";
import { cota, nominal } from "../guests/test-helpers";

const R = new Date("2026-10-08T15:30:00Z");
const M = new Date("2026-10-08T17:02:00Z");
const BASE = "https://5anos.pptnaocompila.com.br/";
const docs = [
  nominal({ codigo: "ZECA100", nome: "Zeca Ávila", empresa: "Acme", status: "confirmado", acompanhantePermitido: true, acompanhanteNome: "Bia", email: "zeca@x.io", celular: "11987654321", respondidoEm: R, convidadoEm: M }),
  nominal({ codigo: "ANA100", nome: "Ana Lu", status: "recusou", acompanhantePermitido: true, acompanhanteNome: "Guardado", email: "ana@guardado.io", celular: "21999998888", respondidoEm: R, convidadoEm: M }),
  nominal({ codigo: "ELIS100", nome: "Élis Souza", acompanhantePermitido: true }),
  cota({ status: "confirmado", nome: "Joana Prado", email: "joana@klever.io" }),
  cota({ codigo: "KLEVERVIP555" }),
];
const linha = (codigo: string, f: "todos" | "confirmados" = "todos") => montarPainel(docs, 0, f, BASE).linhas.find((l) => l.codigo === codigo)!;
const textos = (codigo: string) => linha(codigo).detalhes.map((d) => d.texto);

describe("painel do anfitrião (32.9/32.10)", () => {
  it("contadores: criados = confirmados + não confirmados + recusados; convidados é a marcação; não mudam com o filtro", () => {
    const t = totais(docs);
    for (const f of ["todos", "confirmados"] as const) {
      const c = montarPainel(docs, 7, f, BASE).contadores;
      expect(c).toEqual({ criados: 5, convidados: 2, confirmados: t.confirmados, naoConfirmados: t.pendentes, recusados: t.recusas, excluidos: 0, pessoas: t.esperados, espera: 7 });
      expect(c.criados).toBe(c.confirmados + c.naoConfirmados + c.recusados);
    }
  });

  it("filtro: todos = uma linha por documento; confirmados só os confirmados", () => {
    expect(montarPainel(docs, 0, "todos", BASE).linhas).toHaveLength(5);
    expect(montarPainel(docs, 0, "confirmados", BASE).linhas.map((l) => l.codigo)).toEqual(["KLEVERVIP417", "ZECA100"]);
  });

  it("ordem do CSV (A4): alfabética PT-BR, cota sem nome no fim", () => {
    expect(montarPainel(docs, 0, "todos", BASE).linhas.map((l) => l.nome)).toEqual(["Ana Lu", "Élis Souza", "Joana Prado", "Zeca Ávila", "(não preenchido)"]);
  });

  it("linha 2 só com o que existe; contato só de confirmado (D23)", () => {
    expect(textos("ZECA100")).toEqual(["Acme", "ZECA100", "Nominal", "+1 Bia", "zeca@x.io", "(11) 98765-4321", "Respondeu 08/10 12:30"]);
    expect(textos("ANA100")).toEqual(["ANA100", "Nominal", "Acompanhante liberado", "Respondeu 08/10 12:30"]);
    expect(textos("ELIS100")).toEqual(["ELIS100", "Nominal", "Acompanhante liberado"]);
    expect(textos("KLEVERVIP417")).toEqual(["KLEVERVIP417", "Cota · Klever", "joana@klever.io"]);
    expect(linha("ZECA100").detalhes[1].mono).toBe(true);
  });

  it("status 'Não confirmado', marcação com data curta e link do convite", () => {
    expect(linha("ELIS100")).toMatchObject({ statusTexto: "Não confirmado", convidado: false, convidadoEm: "", url: "https://5anos.pptnaocompila.com.br/c/ELIS100" });
    expect(linha("ZECA100")).toMatchObject({ statusTexto: "Confirmado", convidado: true, convidadoEm: "08/10 14:02" });
  });

  it("filtro da URL", () => {
    expect(lerFiltro("confirmados")).toBe("confirmados");
    expect(lerFiltro(undefined)).toBe("todos");
    expect(lerFiltro(["confirmados"])).toBe("todos");
    expect(lerFiltro("xyz")).toBe("todos");
  });
});

describe("busca por nome (32.10)", () => {
  const ls = montarPainel(docs, 0, "todos", BASE).linhas;
  it("sem caixa nem acento, por trecho", () => {
    expect(filtrarPorNome(ls, "elis").map((l) => l.codigo)).toEqual(["ELIS100"]);
    expect(filtrarPorNome(ls, "  ÁVI ").map((l) => l.codigo)).toEqual(["ZECA100"]);
    expect(filtrarPorNome(ls, "")).toHaveLength(5);
    expect(filtrarPorNome(ls, "ninguém")).toHaveLength(0);
    expect(normalizarBusca("Rômulo  Barbosa")).toBe("romulo barbosa");
  });
});

describe("exclusão lógica no painel (32.12)", () => {
  const X = new Date("2026-10-13T18:40:00Z");
  const comExcluido = [
    ...docs,
    nominal({ codigo: "BRUNO978", nome: "Bruno Campos", empresa: "Klever", status: "excluido", excluidoEm: X, convidadoEm: M,
      acompanhantePermitido: true, acompanhanteNome: "Guardado", email: "bruno@guardado.io", respondidoEm: R }),
  ];
  const painel = (f: "todos" | "confirmados" = "todos") => montarPainel(comExcluido, 0, f, BASE);

  it("criados = confirmados + não confirmados + recusados + excluídos; excluído sai de convidados e de pessoas", () => {
    const c = painel().contadores;
    expect(c.excluidos).toBe(1);
    expect(c.criados).toBe(c.confirmados + c.naoConfirmados + c.recusados + c.excluidos);
    expect(c.convidados).toBe(2);
    expect(c.pessoas).toBe(montarPainel(docs, 0, "todos", BASE).contadores.pessoas);
  });

  it("linha do excluído: fica na lista, só com identificação e data; sem marcação, +1 nem contato", () => {
    const l = painel().linhas.find((x) => x.codigo === "BRUNO978")!;
    expect(l.status).toBe("excluido");
    expect(l.statusTexto).toBe("Excluído");
    expect(l.detalhes.map((d) => d.texto)).toEqual(["Klever", "BRUNO978", "Nominal", "Excluído 13/10 15:40"]);
    expect(l.convidado).toBe(false);
    expect(l.acompanhanteLiberado).toBe(false);
    expect(l.acompanhanteNome).toBeNull();
  });

  it("filtro de confirmados não traz o excluído", () => {
    expect(painel("confirmados").linhas.some((l) => l.codigo === "BRUNO978")).toBe(false);
  });
});
