import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "./theme-toggle";

// Mock next-themes
const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: mockSetTheme,
  }),
}));

describe("ThemeToggle", () => {
  it("renders toggle button", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });

  it("has accessible label", () => {
    render(<ThemeToggle />);

    expect(screen.getByText("Alternar tema")).toBeInTheDocument();
  });

  it("calls setTheme when clicked", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});
