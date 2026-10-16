import { describe, expect, it } from "vitest";
import { filtrarPorNome, lerFiltro, montarPainel, normalizarBusca, type Filtro } from "./painel";
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
const linha = (codigo: string, f: Filtro = "todos") => montarPainel(docs, 0, f, BASE).linhas.find((l) => l.codigo === codigo)!;
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
    // 32.14: Zeca tem data de confirmação; a cota confirmada sem data vai para o fim.
    expect(montarPainel(docs, 0, "confirmados", BASE).linhas.map((l) => l.codigo)).toEqual(["ZECA100", "KLEVERVIP417"]);
  });

  it("32.14: 'Apenas confirmados' vai da confirmação mais antiga à mais recente; os outros filtros seguem alfabéticos", () => {
    const d = (iso: string) => new Date(iso);
    const conf = [
      nominal({ codigo: "BIA1", nome: "Bia", status: "confirmado", respondidoEm: d("2026-10-12T10:00:00Z") }),
      nominal({ codigo: "ANA1", nome: "Ana", status: "confirmado", respondidoEm: d("2026-10-14T10:00:00Z") }),
      nominal({ codigo: "CAIO1", nome: "Caio", status: "confirmado", respondidoEm: d("2026-10-09T10:00:00Z") }),
      nominal({ codigo: "DUDA1", nome: "Duda", status: "confirmado", respondidoEm: d("2026-10-12T10:00:00Z") }),
      nominal({ codigo: "EVA1", nome: "Eva", status: "pendente" }),
    ];
    expect(montarPainel(conf, 0, "confirmados", BASE).linhas.map((l) => l.nome)).toEqual(["Caio", "Bia", "Duda", "Ana"]);
    expect(montarPainel(conf, 0, "todos", BASE).linhas.map((l) => l.nome)).toEqual(["Ana", "Bia", "Caio", "Duda", "Eva"]);
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
  const painel = (f: Filtro = "todos") => montarPainel(comExcluido, 0, f, BASE);

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

describe("filtros de marcação (32.13)", () => {
  const X = new Date("2026-10-13T18:40:00Z");
  const base = [
    nominal({ codigo: "CONF1", nome: "Carla", status: "confirmado", convidadoEm: M, respondidoEm: R }),
    nominal({ codigo: "RECU1", nome: "Rui", status: "recusou", convidadoEm: M, respondidoEm: R }),
    nominal({ codigo: "PMAR1", nome: "Paula", convidadoEm: M }),
    nominal({ codigo: "PSEM1", nome: "Pedro" }),
    cota({ codigo: "KLEVERVIP900" }),
    nominal({ codigo: "EXCL1", nome: "Ester", status: "excluido", excluidoEm: X }),
    nominal({ codigo: "EXCL2", nome: "Edu", status: "excluido", excluidoEm: X, convidadoEm: M }),
  ];
  const codigos = (f: Filtro) => montarPainel(base, 0, f, BASE).linhas.map((l) => l.codigo).sort();

  it("convidados não confirmados = marcado E pendente", () => {
    expect(codigos("convidados-nao-confirmados")).toEqual(["PMAR1"]);
  });

  it("não convidados = sem marcação, sem o excluído (D46)", () => {
    expect(codigos("nao-convidados")).toEqual(["KLEVERVIP900", "PSEM1"]);
  });

  it("contadores não mudam com os filtros novos", () => {
    const todos = montarPainel(base, 0, "todos", BASE).contadores;
    expect(montarPainel(base, 0, "nao-convidados", BASE).contadores).toEqual(todos);
    expect(montarPainel(base, 0, "convidados-nao-confirmados", BASE).contadores).toEqual(todos);
  });

  it("filtros novos vêm da URL", () => {
    expect(lerFiltro("convidados-nao-confirmados")).toBe("convidados-nao-confirmados");
    expect(lerFiltro("nao-convidados")).toBe("nao-convidados");
    expect(lerFiltro("outro")).toBe("todos");
  });

  it("marca travada só em quem respondeu e está marcado", () => {
    const comLegado = [...base, nominal({ codigo: "LEG1", nome: "Lia", status: "confirmado", respondidoEm: R })];
    const l = (c: string) => montarPainel(comLegado, 0, "todos", BASE).linhas.find((x) => x.codigo === c)!;
    expect(["CONF1", "RECU1", "PMAR1", "PSEM1", "EXCL2", "LEG1"].map((c) => l(c).marcaTravada)).toEqual([true, true, false, false, false, false]);
  });
});
