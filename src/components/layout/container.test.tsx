import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Container } from "./container";

describe("Container", () => {
  it("renders children correctly", () => {
    render(
      <Container>
        <p>Test content</p>
      </Container>
    );

    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("applies max-width class for consistent layout", () => {
    render(
      <Container>
        <p>Content</p>
      </Container>
    );

    const container = screen.getByText("Content").parentElement;
    expect(container).toHaveClass("max-w-7xl");
  });

  it("applies horizontal padding", () => {
    render(
      <Container>
        <p>Content</p>
      </Container>
    );

    const container = screen.getByText("Content").parentElement;
    expect(container).toHaveClass("px-4");
  });

  it("applies responsive padding", () => {
    render(
      <Container>
        <p>Content</p>
      </Container>
    );

    const container = screen.getByText("Content").parentElement;
    expect(container).toHaveClass("sm:px-6", "lg:px-8");
  });

  it("centers content horizontally", () => {
    render(
      <Container>
        <p>Content</p>
      </Container>
    );

    const container = screen.getByText("Content").parentElement;
    expect(container).toHaveClass("mx-auto");
  });

  it("takes full width", () => {
    render(
      <Container>
        <p>Content</p>
      </Container>
    );

    const container = screen.getByText("Content").parentElement;
    expect(container).toHaveClass("w-full");
  });

  it("accepts additional className prop", () => {
    render(
      <Container className="custom-class mt-4">
        <p>Content</p>
      </Container>
    );

    const container = screen.getByText("Content").parentElement;
    expect(container).toHaveClass("custom-class", "mt-4");
  });

  it("merges className with default classes", () => {
    render(
      <Container className="bg-red-500">
        <p>Content</p>
      </Container>
    );

    const container = screen.getByText("Content").parentElement;
    expect(container).toHaveClass("mx-auto", "max-w-7xl", "bg-red-500");
  });
});
