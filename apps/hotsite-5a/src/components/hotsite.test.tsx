import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Hotsite } from "./hotsite";
import { restrito, toView } from "@/lib/convite";
import { cota, nominal } from "@/lib/guests/test-helpers";

const acoes = vi.hoisted(() => ({
  confirmarPresenca: vi.fn(),
  recusarPresenca: vi.fn(),
  salvarAcompanhante: vi.fn(),
  entrarNaListaDeEspera: vi.fn(),
}));
vi.mock("@/app/actions", () => acoes);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeEach(() => {
  Object.values(acoes).forEach((f) => f.mockReset());
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

const textoDaPagina = () => document.body.textContent ?? "";

describe("Hotsite — 4 estados (32.4 AC 14)", () => {
  it("convite nominal: nome, primeiro episódio e resumo D14, sem 22/10", () => {
    render(<Hotsite inicial={toView(nominal())} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mariana Albuquerque");
    expect(textoDaPagina()).toContain("Seu primeiro episódio · mar/2022");
    expect(textoDaPagina()).toContain("E mais 2 episódios com 18,9 mil visualizações.");
    expect(textoDaPagina()).not.toMatch(/visualizações, desde/);
    expect(textoDaPagina()).not.toContain("22/10");
    expect(textoDaPagina()).not.toContain("Vou sozinho");
  });

  it("cota: impessoal, cita o patrocinador, sem episódio, pede nome", () => {
    render(<Hotsite inicial={toView(cota())} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Um convite para você");
    expect(textoDaPagina()).toContain("Convite Klever · 5 anos");
    expect(textoDaPagina()).not.toContain("Seu episódio");
    expect(screen.getByLabelText("Seu nome")).toBeInTheDocument();
    expect(textoDaPagina()).toContain("Em cinco anos, o PPT Não Compila virou o que é");
  });

  it("confirmado: ingresso sem código (D1)", () => {
    render(<Hotsite inicial={toView(nominal({ status: "confirmado" }))} />);
    expect(textoDaPagina()).toContain("Seu nome está na lista");
    expect(screen.getByRole("img", { name: /Ingresso simbólico de Mariana/ })).not.toHaveTextContent("MARIANA742");
  });

  it("recusou: textos D15", () => {
    render(<Hotsite inicial={toView(nominal({ status: "recusou" }))} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Que pena, Mariana.");
    expect(textoDaPagina()).toContain("Se a agenda mudar, é só voltar aqui e confirmar.");
    expect(textoDaPagina()).toContain("Ainda dá tempo");
    expect(textoDaPagina()).not.toContain("22/10");
  });

  it("restrito com erro", () => {
    render(<Hotsite inicial={restrito("XPTO123", "CODIGO_INVALIDO")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Código não encontrado");
  });
});

const heroConfirmar = () => screen.getAllByRole("button", { name: /Confirmar presença/ })[1];
const preencher = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

describe("confirmação com o servidor real (32.4 AC 7)", () => {
  it("sucesso troca para confirmado", async () => {
    acoes.confirmarPresenca.mockResolvedValue({ ok: true, convite: toView(nominal({ status: "confirmado" })) });
    render(<Hotsite inicial={toView(nominal({ empresa: "Exemplo SA" }))} />);
    preencher("Seu email", "mariana@exemplo.com.br");
    fireEvent.click(heroConfirmar());
    await waitFor(() => expect(textoDaPagina()).toContain("confirmada!"));
    expect(acoes.confirmarPresenca).toHaveBeenCalledWith("MARIANA742", { nome: undefined, empresa: "Exemplo SA", email: "mariana@exemplo.com.br", celular: "" });
  });

  it("falha de rede: continua no convite e mostra erro inline", async () => {
    acoes.confirmarPresenca.mockRejectedValue(new Error("offline"));
    render(<Hotsite inicial={toView(nominal({ empresa: "Exemplo SA" }))} />);
    preencher("Seu email", "mariana@exemplo.com.br");
    fireEvent.click(heroConfirmar());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não conseguimos registrar"));
    expect(textoDaPagina()).not.toContain("confirmada!");
  });

  it("cota envia nome, empresa, email e celular, na ordem dos campos", async () => {
    acoes.confirmarPresenca.mockResolvedValue({ ok: true, convite: toView(cota({ status: "confirmado", nome: "Joana Prado" })) });
    render(<Hotsite inicial={toView(cota())} />);
    const rotulos = Array.from(document.querySelectorAll("label")).map((l) => l.textContent);
    expect(rotulos).toEqual(["Seu nome", "Empresa atual", "Seu email", "Seu celular (opcional)"]);
    expect(screen.getByLabelText("Empresa atual")).toHaveValue("");
    preencher("Seu nome", "Joana Prado");
    preencher("Empresa atual", "Klever");
    preencher("Seu email", "joana@klever.io");
    preencher("Seu celular (opcional)", "(11) 98765-4321");
    fireEvent.click(heroConfirmar());
    await waitFor(() =>
      expect(acoes.confirmarPresenca).toHaveBeenCalledWith("KLEVERVIP417", { nome: "Joana Prado", empresa: "Klever", email: "joana@klever.io", celular: "(11) 98765-4321" })
    );
  });
});

describe("contato na confirmação (32.6)", () => {
  it("botão desabilitado sem email ou sem empresa; cota também exige o nome", () => {
    const { unmount } = render(<Hotsite inicial={toView(nominal({ empresa: "Exemplo SA" }))} />);
    expect(screen.getByLabelText("Empresa atual")).toHaveValue("Exemplo SA");
    expect(heroConfirmar()).toBeDisabled();
    preencher("Seu email", "mariana@exemplo.com.br");
    expect(heroConfirmar()).toBeEnabled();
    preencher("Empresa atual", "");
    expect(heroConfirmar()).toBeDisabled();
    unmount();
    render(<Hotsite inicial={toView(cota())} />);
    preencher("Seu email", "joana@klever.io");
    preencher("Empresa atual", "Klever");
    expect(heroConfirmar()).toBeDisabled();
    preencher("Seu nome", "Joana");
    expect(heroConfirmar()).toBeEnabled();
  });

  it("erro de email aparece sob o campo e some ao editar", async () => {
    acoes.confirmarPresenca.mockResolvedValue({ ok: false, erro: "EMAIL_INVALIDO" });
    render(<Hotsite inicial={toView(nominal({ empresa: "Exemplo SA" }))} />);
    preencher("Seu email", "mariana@");
    fireEvent.click(heroConfirmar());
    await waitFor(() => expect(screen.getByLabelText("Seu email")).toHaveAttribute("aria-invalid", "true"));
    expect(document.getElementById("seu-email-erro")).toHaveTextContent("Confira o email digitado.");
    preencher("Seu email", "mariana@exemplo.com.br");
    expect(document.getElementById("seu-email-erro")).toBeNull();
  });

  it("barra fixa sem email não confirma: leva ao campo", () => {
    render(<Hotsite inicial={toView(nominal())} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Confirmar presença/ })[0]);
    expect(acoes.confirmarPresenca).not.toHaveBeenCalled();
  });

  it("Mudei de ideia com email gravado reconfirma direto com o contato gravado", async () => {
    acoes.confirmarPresenca.mockResolvedValue({ ok: true, convite: toView(nominal({ status: "confirmado", email: "m@x.io" })) });
    render(<Hotsite inicial={toView(nominal({ status: "recusou", empresa: "Exemplo SA", email: "m@x.io", celular: "11987654321" }))} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Mudei de ideia/ })[0]);
    await waitFor(() =>
      expect(acoes.confirmarPresenca).toHaveBeenCalledWith("MARIANA742", { nome: undefined, empresa: "Exemplo SA", email: "m@x.io", celular: "(11) 98765-4321" })
    );
  });

  it("Mudei de ideia sem email volta ao topo do convite com os campos", async () => {
    render(<Hotsite inicial={toView(nominal({ status: "recusou" }))} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Mudei de ideia/ })[0]);
    expect(acoes.confirmarPresenca).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Seu email")).toBeInTheDocument());
  });

  it("erro de empresa aparece sob o campo e some ao editar (E3)", async () => {
    acoes.confirmarPresenca.mockResolvedValue({ ok: false, erro: "EMPRESA_INVALIDA" });
    render(<Hotsite inicial={toView(nominal({ empresa: "Exemplo SA" }))} />);
    preencher("Seu email", "mariana@exemplo.com.br");
    fireEvent.click(heroConfirmar());
    await waitFor(() => expect(screen.getByLabelText("Empresa atual")).toHaveAttribute("aria-invalid", "true"));
    expect(document.getElementById("sua-empresa-erro")).toHaveTextContent("Confira a empresa: use até 80 caracteres.");
    preencher("Empresa atual", "Exemplo");
    expect(document.getElementById("sua-empresa-erro")).toBeNull();
  });

  it("recusou não mostra campos de contato (D23)", () => {
    render(<Hotsite inicial={toView(nominal({ status: "recusou", email: "m@x.io" }))} />);
    expect(screen.queryByLabelText("Seu email")).toBeNull();
  });
});

describe("lista de espera (32.7)", () => {
  const entrar = () => screen.getByRole("button", { name: /Entrar na lista de espera/ });
  const preencherTudo = () => {
    preencher("Nome", "Paula Reis");
    preencher("Empresa", "Acme");
    preencher("Email", "paula@acme.io");
    preencher("Celular", "(11) 98765-4321");
  };

  it("aparece no / e junto do erro de código", () => {
    const { unmount } = render(<Hotsite inicial={restrito()} />);
    expect(screen.getByRole("heading", { name: "Ainda não tem convite?" })).toBeInTheDocument();
    unmount();
    render(<Hotsite inicial={restrito("XPTO123", "CODIGO_INVALIDO")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Código não encontrado");
    expect(screen.getByRole("heading", { name: "Ainda não tem convite?" })).toBeInTheDocument();
  });

  it("botão desabilitado até os 4 campos estarem preenchidos", () => {
    render(<Hotsite inicial={restrito()} />);
    expect(entrar()).toBeDisabled();
    preencher("Nome", "Paula Reis");
    preencher("Empresa", "Acme");
    preencher("Email", "paula@acme.io");
    expect(entrar()).toBeDisabled();
    preencher("Celular", "(11) 98765-4321");
    expect(entrar()).toBeEnabled();
  });

  it("sucesso troca o formulário pela mensagem, sem balões", async () => {
    acoes.entrarNaListaDeEspera.mockResolvedValue({ ok: true, primeiroNome: "Paula" });
    render(<Hotsite inicial={restrito()} />);
    preencherTudo();
    fireEvent.click(entrar());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Pronto, Paula. Seu nome está na lista de espera."));
    expect(acoes.entrarNaListaDeEspera).toHaveBeenCalledWith({ nome: "Paula Reis", empresa: "Acme", email: "paula@acme.io", celular: "(11) 98765-4321", site: "" });
    expect(screen.queryByLabelText("Empresa")).toBeNull();
    expect(screen.getByLabelText("Código do convite")).toBeInTheDocument();
  });

  it("erro de campo aparece inline e some ao editar", async () => {
    acoes.entrarNaListaDeEspera.mockResolvedValue({ ok: false, erros: { celular: "CELULAR_INVALIDO" } });
    render(<Hotsite inicial={restrito()} />);
    preencherTudo();
    fireEvent.click(entrar());
    await waitFor(() => expect(document.getElementById("espera-celular-erro")).toHaveTextContent("Confira o celular, com DDD."));
    preencher("Celular", "(11) 98765-4322");
    expect(document.getElementById("espera-celular-erro")).toBeNull();
  });

  it("honeypot fica fora da navegação e da leitura de tela", () => {
    render(<Hotsite inicial={restrito()} />);
    const hp = document.getElementById("espera-site")!;
    expect(hp).toHaveAttribute("tabindex", "-1");
    expect(hp.closest("[aria-hidden='true']")).not.toBeNull();
  });
});
