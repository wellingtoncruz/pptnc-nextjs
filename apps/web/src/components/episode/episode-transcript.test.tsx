import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { EpisodeTranscript } from "./episode-transcript";

const mockSrtContent = `1
00:00:00,000 --> 00:00:05,500
Olá, bem-vindos ao PPT Não Compila!

2
00:00:05,500 --> 00:00:12,000
Hoje vamos falar sobre microsserviços e como eles podem ajudar sua empresa.

3
00:00:12,000 --> 00:00:20,000
É um assunto muito importante para desenvolvedores.`;

describe("EpisodeTranscript", () => {
  it("renders transcript section with heading", () => {
    render(<EpisodeTranscript transcriptSrt={mockSrtContent} />);

    expect(screen.getByRole("region", { name: /transcrição/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /transcrição/i })).toBeInTheDocument();
  });

  it("renders transcript content from SRT", () => {
    render(<EpisodeTranscript transcriptSrt={mockSrtContent} />);

    expect(screen.getByText(/Olá, bem-vindos ao PPT Não Compila!/)).toBeInTheDocument();
    expect(screen.getByText(/Hoje vamos falar sobre microsserviços/)).toBeInTheDocument();
    expect(screen.getByText(/É um assunto muito importante/)).toBeInTheDocument();
  });

  it("renders nothing when transcriptSrt is empty", () => {
    const { container } = render(<EpisodeTranscript transcriptSrt="" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when transcriptSrt is undefined", () => {
    const { container } = render(<EpisodeTranscript transcriptSrt={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("applies proper accessibility attributes", () => {
    render(<EpisodeTranscript transcriptSrt={mockSrtContent} />);

    const section = screen.getByRole("region", { name: /transcrição/i });
    expect(section).toHaveAttribute("aria-labelledby", "transcript-heading");

    const heading = screen.getByRole("heading", { name: /transcrição/i });
    expect(heading).toHaveAttribute("id", "transcript-heading");
  });

  it("renders scrollable container on desktop", () => {
    const { container } = render(<EpisodeTranscript transcriptSrt={mockSrtContent} />);

    // ScrollArea has data-slot attribute
    const scrollArea = container.querySelector('[data-slot="scroll-area"]');
    expect(scrollArea).toBeInTheDocument();
  });

  it("applies readable typography styles", () => {
    const { container } = render(<EpisodeTranscript transcriptSrt={mockSrtContent} />);

    // The transcript content container should have text-lg and leading-relaxed
    const textContainer = container.querySelector(".text-lg.leading-relaxed");
    expect(textContainer).toBeInTheDocument();
    expect(textContainer).toHaveClass("text-muted-foreground");
  });

  it("applies custom className when provided", () => {
    const { container } = render(
      <EpisodeTranscript transcriptSrt={mockSrtContent} className="mt-8" />
    );

    const section = container.querySelector("section");
    expect(section).toHaveClass("mt-8");
  });

  it("groups text into paragraphs", () => {
    const { container } = render(<EpisodeTranscript transcriptSrt={mockSrtContent} />);

    // Should render multiple paragraphs (p elements)
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBeGreaterThan(0);
  });
});
