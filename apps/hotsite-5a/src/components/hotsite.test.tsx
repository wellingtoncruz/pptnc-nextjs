import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Hotsite } from "./hotsite";
import { restrito, toView } from "@/lib/convite";
import { cota, nominal } from "@/lib/guests/test-helpers";

const acoes = vi.hoisted(() => ({
  confirmarPresenca: vi.fn(),
  recusarPresenca: vi.fn(),
  salvarAcompanhante: vi.fn(),
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

describe("confirmação com o servidor real (32.4 AC 7)", () => {
  it("sucesso troca para confirmado", async () => {
    acoes.confirmarPresenca.mockResolvedValue({ ok: true, convite: toView(nominal({ status: "confirmado" })) });
    render(<Hotsite inicial={toView(nominal())} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Confirmar presença/ })[1]);
    await waitFor(() => expect(textoDaPagina()).toContain("confirmada!"));
    expect(acoes.confirmarPresenca).toHaveBeenCalledWith("MARIANA742", undefined);
  });

  it("falha de rede: continua no convite e mostra erro inline", async () => {
    acoes.confirmarPresenca.mockRejectedValue(new Error("offline"));
    render(<Hotsite inicial={toView(nominal())} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Confirmar presença/ })[1]);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não conseguimos registrar"));
    expect(textoDaPagina()).not.toContain("confirmada!");
  });

  it("cota envia o nome digitado", async () => {
    acoes.confirmarPresenca.mockResolvedValue({ ok: true, convite: toView(cota({ status: "confirmado", nome: "Joana Prado" })) });
    render(<Hotsite inicial={toView(cota())} />);
    fireEvent.change(screen.getByLabelText("Seu nome"), { target: { value: "Joana Prado" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Confirmar presença/ })[1]);
    await waitFor(() => expect(acoes.confirmarPresenca).toHaveBeenCalledWith("KLEVERVIP417", "Joana Prado"));
  });
});
