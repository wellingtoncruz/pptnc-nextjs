import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/actions", () => ({ marcarConvidado: Object.assign(vi.fn(), { bind: () => vi.fn() }) }));

import { ListaConvites } from "./admin-lista";
import { montarPainel } from "@/lib/admin/painel";
import { nominal } from "@/lib/guests/test-helpers";

const linhas = montarPainel(
  [nominal({ codigo: "FABIO1", nome: "Fábio Mesquita", convidadoEm: new Date("2026-10-08T17:02:00Z") }), nominal({ codigo: "ANA1", nome: "Ana Lu" })],
  0, "todos", "https://5anos.pptnaocompila.com.br"
).linhas;

describe("ListaConvites (32.10)", () => {
  it("busca no navegador sem acento e contagem acompanha", () => {
    render(<ListaConvites linhas={linhas} />);
    expect(screen.getByText("2 convites exibidos")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar pelo nome"), { target: { value: "fabio" } });
    expect(screen.getByText("Fábio Mesquita")).toBeInTheDocument();
    expect(screen.queryByText("Ana Lu")).toBeNull();
    expect(screen.getByText("1 convite exibido")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Buscar pelo nome"), { target: { value: "zzz" } });
    expect(screen.getByText("Nenhum convidado encontrado.")).toBeInTheDocument();
  });

  it("linha marcada tem destaque e botão de desfazer; não marcada oferece marcar", () => {
    render(<ListaConvites linhas={linhas} />);
    expect(screen.getByRole("button", { name: "Desfazer convidado de Fábio Mesquita" }).closest("li")).toHaveAttribute("data-convidado", "true");
    expect(screen.getByRole("button", { name: "Marcar Ana Lu como convidado" }).closest("li")).toHaveAttribute("data-convidado", "false");
  });

  it("copiar link leva a URL do convite para a área de transferência", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ListaConvites linhas={linhas} />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar link de Ana Lu" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://5anos.pptnaocompila.com.br/c/ANA1"));
    expect(await screen.findByRole("button", { name: "Link de Ana Lu copiado" })).toBeInTheDocument();
  });
});
