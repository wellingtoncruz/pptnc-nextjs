import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import NotFound from "./not-found";

describe("NotFound (404 page)", () => {
  it("renders the 404 error code", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders the page title in Portuguese", () => {
    render(<NotFound />);
    expect(screen.getByText("Página não encontrada")).toBeInTheDocument();
  });

  it("renders an explanatory message", () => {
    render(<NotFound />);
    expect(
      screen.getByText(/a página que você está procurando não existe/i)
    ).toBeInTheDocument();
  });

  it("has a link to the home page", () => {
    render(<NotFound />);
    const homeLink = screen.getByRole("link", { name: /voltar ao início/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("has a link to the episodes page", () => {
    render(<NotFound />);
    const episodesLink = screen.getByRole("link", { name: /ver episódios/i });
    expect(episodesLink).toBeInTheDocument();
    expect(episodesLink).toHaveAttribute("href", "/episodios");
  });

  it("uses the primary color for the error code", () => {
    render(<NotFound />);
    const errorCode = screen.getByText("404");
    expect(errorCode).toHaveClass("text-primary");
  });
});
