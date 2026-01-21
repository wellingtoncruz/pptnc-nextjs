import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import ErrorPage from "./error";

describe("Error (500 page)", () => {
  const mockError = new globalThis.Error("Test error") as Error & { digest?: string };
  const mockReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error for tests
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the error page", () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    expect(screen.getByText("Algo deu errado")).toBeInTheDocument();
  });

  it("renders an explanatory message in Portuguese", () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    expect(
      screen.getByText(/desculpe, ocorreu um erro inesperado/i)
    ).toBeInTheDocument();
  });

  it("has a retry button that calls reset", () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    const retryButton = screen.getByRole("button", {
      name: /tentar novamente/i,
    });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it("has a link to the home page", () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    const homeLink = screen.getByRole("link", { name: /voltar ao início/i });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("logs the error to console", () => {
    const consoleSpy = vi.spyOn(console, "error");
    render(<ErrorPage error={mockError} reset={mockReset} />);
    expect(consoleSpy).toHaveBeenCalledWith("Application error:", mockError);
  });

  it("renders the alert icon", () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    // The AlertTriangle icon should be present (check for SVG)
    const container = screen.getByText("Algo deu errado").parentElement;
    expect(container?.querySelector("svg")).toBeInTheDocument();
  });
});
