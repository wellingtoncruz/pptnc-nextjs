import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { ContentTabs } from "./content-tabs";
import { toast } from "sonner";

import type { Chapter } from "@/types";

// Mock toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockedToast = vi.mocked(toast);

const mockDescription = "Esta é a descrição do episódio sobre tecnologia.";

const mockChapters: Chapter[] = [
  { startTime: 0, topic: "Introdução" },
  { startTime: 300, topic: "Desenvolvimento Principal" },
  { startTime: 900, topic: "Conclusão" },
];

const mockSrtContent = `1
00:00:00,000 --> 00:00:05,500
Olá, bem-vindos ao PPT Não Compila!

2
00:00:05,500 --> 00:00:12,000
Hoje vamos falar sobre microsserviços.`;

describe("ContentTabs", () => {
  it("renders both tabs when description and transcript are provided", () => {
    render(
      <ContentTabs description={mockDescription} transcriptSrt={mockSrtContent} />
    );

    expect(screen.getByRole("tab", { name: /descrição/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /transcrição/i })).toBeInTheDocument();
  });

  it("renders only description tab when transcript is missing", () => {
    render(<ContentTabs description={mockDescription} />);

    expect(screen.getByRole("tab", { name: /descrição/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /transcrição/i })).not.toBeInTheDocument();
  });

  it("renders only transcript tab when description is missing", () => {
    render(<ContentTabs transcriptSrt={mockSrtContent} />);

    expect(screen.queryByRole("tab", { name: /descrição/i })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /transcrição/i })).toBeInTheDocument();
  });

  it("renders nothing when both description and transcript are missing", () => {
    const { container } = render(<ContentTabs />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows description tab as default when both are available", () => {
    render(
      <ContentTabs description={mockDescription} transcriptSrt={mockSrtContent} />
    );

    const descriptionTab = screen.getByRole("tab", { name: /descrição/i });
    expect(descriptionTab).toHaveAttribute("data-state", "active");
  });

  it("shows transcript tab as default when only transcript is available", () => {
    render(<ContentTabs transcriptSrt={mockSrtContent} />);

    const transcriptTab = screen.getByRole("tab", { name: /transcrição/i });
    expect(transcriptTab).toHaveAttribute("data-state", "active");
  });

  it("tabs are clickable and have correct attributes", () => {
    render(
      <ContentTabs description={mockDescription} transcriptSrt={mockSrtContent} />
    );

    const descriptionTab = screen.getByRole("tab", { name: /descrição/i });
    const transcriptTab = screen.getByRole("tab", { name: /transcrição/i });

    // Both tabs should be present and interactive
    expect(descriptionTab).not.toBeDisabled();
    expect(transcriptTab).not.toBeDisabled();

    // Tabs should have proper ARIA attributes
    expect(descriptionTab).toHaveAttribute("aria-selected");
    expect(transcriptTab).toHaveAttribute("aria-selected");
  });

  it("renders description content", () => {
    render(<ContentTabs description={mockDescription} />);

    expect(screen.getByText(mockDescription)).toBeInTheDocument();
  });

  it("renders transcript content", () => {
    render(<ContentTabs transcriptSrt={mockSrtContent} />);

    expect(screen.getByText(/Olá, bem-vindos ao PPT Não Compila!/)).toBeInTheDocument();
  });

  it("renders both contents in DOM for SEO (not lazy loaded)", () => {
    const { container } = render(
      <ContentTabs description={mockDescription} transcriptSrt={mockSrtContent} />
    );

    // Both contents should be in the DOM regardless of active tab
    expect(container.textContent).toContain(mockDescription);
    expect(container.textContent).toContain("Olá, bem-vindos ao PPT Não Compila!");
  });

  it("applies custom className", () => {
    const { container } = render(
      <ContentTabs description={mockDescription} className="mt-8" />
    );

    const section = container.querySelector("section");
    expect(section).toHaveClass("mt-8");
  });

  it("has proper accessibility attributes", () => {
    render(
      <ContentTabs description={mockDescription} transcriptSrt={mockSrtContent} />
    );

    const section = screen.getByRole("region", { name: /conteúdo do episódio/i });
    expect(section).toBeInTheDocument();
  });

  it("renders scroll container for transcript with overflow classes", () => {
    const { container } = render(<ContentTabs transcriptSrt={mockSrtContent} />);

    // Check for the scroll container div with overflow classes
    const scrollContainer = container.querySelector(".md\\:overflow-y-auto");
    expect(scrollContainer).toBeInTheDocument();
  });

  it("renders timestamp links in transcript", () => {
    render(<ContentTabs transcriptSrt={mockSrtContent} />);

    // Find timestamp buttons
    const timestampButtons = screen.getAllByRole("button", {
      name: /ir para .* no vídeo/i,
    });

    expect(timestampButtons.length).toBeGreaterThan(0);
  });

  it("renders timestamp with correct format", () => {
    render(<ContentTabs transcriptSrt={mockSrtContent} />);

    // First segment starts at 0:00
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("renders timestamps for each paragraph", () => {
    const longerSrtContent = `1
00:00:00,000 --> 00:00:05,500
First sentence ends here.

2
00:00:10,000 --> 00:00:15,000
Second paragraph after gap.

3
00:00:20,000 --> 00:00:25,000
Third paragraph.`;

    render(<ContentTabs transcriptSrt={longerSrtContent} />);

    const timestampButtons = screen.getAllByRole("button", {
      name: /ir para .* no vídeo/i,
    });

    // Each paragraph should have a timestamp
    expect(timestampButtons.length).toBe(3);
  });

  // Chapters tab tests
  describe("chapters tab", () => {
    it("renders chapters tab when chapters are provided", () => {
      render(<ContentTabs description={mockDescription} chapters={mockChapters} />);

      expect(screen.getByRole("tab", { name: /capítulos/i })).toBeInTheDocument();
    });

    it("does not render chapters tab when chapters array is empty", () => {
      render(<ContentTabs description={mockDescription} chapters={[]} />);

      expect(screen.queryByRole("tab", { name: /capítulos/i })).not.toBeInTheDocument();
    });

    it("does not render chapters tab when chapters is undefined", () => {
      render(<ContentTabs description={mockDescription} />);

      expect(screen.queryByRole("tab", { name: /capítulos/i })).not.toBeInTheDocument();
    });

    it("renders chapters tab between description and transcript tabs", () => {
      render(
        <ContentTabs
          description={mockDescription}
          transcriptSrt={mockSrtContent}
          chapters={mockChapters}
        />
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs[0]).toHaveTextContent(/descrição/i);
      expect(tabs[1]).toHaveTextContent(/capítulos/i);
      expect(tabs[2]).toHaveTextContent(/transcrição/i);
    });

    it("renders all chapter topics", () => {
      render(<ContentTabs chapters={mockChapters} />);

      expect(screen.getByText("Introdução")).toBeInTheDocument();
      expect(screen.getByText("Desenvolvimento Principal")).toBeInTheDocument();
      expect(screen.getByText("Conclusão")).toBeInTheDocument();
    });

    it("renders chapter timestamps as clickable links", () => {
      render(<ContentTabs chapters={mockChapters} />);

      // Find timestamp buttons for chapters
      const timestampButtons = screen.getAllByRole("button", {
        name: /ir para .* no vídeo/i,
      });

      expect(timestampButtons.length).toBe(3);
    });

    it("renders correct timestamp formats for chapters", () => {
      render(<ContentTabs chapters={mockChapters} />);

      // 0 seconds = 0:00
      expect(screen.getByText("0:00")).toBeInTheDocument();
      // 300 seconds = 5:00
      expect(screen.getByText("5:00")).toBeInTheDocument();
      // 900 seconds = 15:00
      expect(screen.getByText("15:00")).toBeInTheDocument();
    });

    it("shows chapters tab as default when only chapters available", () => {
      render(<ContentTabs chapters={mockChapters} />);

      const chaptersTab = screen.getByRole("tab", { name: /capítulos/i });
      expect(chaptersTab).toHaveAttribute("data-state", "active");
    });

    it("renders chapter content in DOM for SEO (forceMount)", () => {
      const { container } = render(
        <ContentTabs description={mockDescription} chapters={mockChapters} />
      );

      // Chapter content should be in DOM even when description tab is active
      expect(container.textContent).toContain("Introdução");
      expect(container.textContent).toContain("Desenvolvimento Principal");
    });

    it("renders nothing when all content is missing", () => {
      const { container } = render(<ContentTabs chapters={[]} />);

      expect(container).toBeEmptyDOMElement();
    });

    // Share chapter tests - ChapterShareButton renders a dropdown menu
    describe("share button", () => {
      it("renders share button for each chapter when episodeUrl is provided", () => {
        render(
          <ContentTabs
            chapters={mockChapters}
            episodeUrl="https://pptnc.com.br/episodios/test"
          />
        );

        const shareButtons = screen.getAllByRole("button", {
          name: /compartilhar capítulo/i,
        });

        expect(shareButtons).toHaveLength(3);
      });

      it("does not render share button when episodeUrl is not provided", () => {
        render(<ContentTabs chapters={mockChapters} />);

        const shareButtons = screen.queryAllByRole("button", {
          name: /compartilhar capítulo/i,
        });

        expect(shareButtons).toHaveLength(0);
      });

      it("share button has correct accessibility label for each chapter", () => {
        render(
          <ContentTabs
            chapters={mockChapters}
            episodeUrl="https://pptnc.com.br/episodios/test"
          />
        );

        expect(
          screen.getByRole("button", { name: /compartilhar capítulo: introdução/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /compartilhar capítulo: desenvolvimento principal/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /compartilhar capítulo: conclusão/i })
        ).toBeInTheDocument();
      });

      it("share button is clickable and expands dropdown", () => {
        render(
          <ContentTabs
            chapters={mockChapters}
            episodeUrl="https://pptnc.com.br/episodios/test"
          />
        );

        const shareButton = screen.getByRole("button", {
          name: /compartilhar capítulo: introdução/i,
        });

        // Button should be clickable (not disabled)
        expect(shareButton).not.toBeDisabled();
        // Button should have aria-haspopup for dropdown
        expect(shareButton).toHaveAttribute("aria-haspopup");
      });
    });

    // initialTab tests
    describe("initialTab", () => {
      it("activates capitulos tab when initialTab is set", () => {
        render(
          <ContentTabs
            description={mockDescription}
            chapters={mockChapters}
            transcriptSrt={mockSrtContent}
            initialTab="capitulos"
          />
        );

        const chaptersTab = screen.getByRole("tab", { name: /capítulos/i });
        expect(chaptersTab).toHaveAttribute("data-state", "active");
      });

      it("activates transcricao tab when initialTab is set", () => {
        render(
          <ContentTabs
            description={mockDescription}
            chapters={mockChapters}
            transcriptSrt={mockSrtContent}
            initialTab="transcricao"
          />
        );

        const transcriptTab = screen.getByRole("tab", { name: /transcrição/i });
        expect(transcriptTab).toHaveAttribute("data-state", "active");
      });

      it("falls back to first available tab if initialTab content is missing", () => {
        render(
          <ContentTabs
            chapters={mockChapters}
            initialTab="descricao" // description is not provided
          />
        );

        const chaptersTab = screen.getByRole("tab", { name: /capítulos/i });
        expect(chaptersTab).toHaveAttribute("data-state", "active");
      });
    });

    // highlightedTimestamp tests
    describe("highlightedTimestamp", () => {
      it("highlights chapter with matching timestamp", () => {
        const { container } = render(
          <ContentTabs
            chapters={mockChapters}
            highlightedTimestamp={300}
          />
        );

        // Find the chapter item with data-chapter-time="300"
        const highlightedChapter = container.querySelector('[data-chapter-time="300"]');
        expect(highlightedChapter).toHaveClass("ring-2");
        expect(highlightedChapter).toHaveClass("ring-orange-300");
      });

      it("does not highlight chapters when highlightedTimestamp does not match", () => {
        const { container } = render(
          <ContentTabs
            chapters={mockChapters}
            highlightedTimestamp={999}
          />
        );

        // No chapter should have the highlight ring
        const highlightedChapters = container.querySelectorAll(".ring-orange-300");
        expect(highlightedChapters).toHaveLength(0);
      });

      it("floors decimal timestamps for comparison", () => {
        const { container } = render(
          <ContentTabs
            chapters={mockChapters}
            highlightedTimestamp={300.8}
          />
        );

        const highlightedChapter = container.querySelector('[data-chapter-time="300"]');
        expect(highlightedChapter).toHaveClass("ring-orange-300");
      });

      it("adds data-chapter-time attribute for each chapter", () => {
        const { container } = render(<ContentTabs chapters={mockChapters} />);

        expect(container.querySelector('[data-chapter-time="0"]')).toBeInTheDocument();
        expect(container.querySelector('[data-chapter-time="300"]')).toBeInTheDocument();
        expect(container.querySelector('[data-chapter-time="900"]')).toBeInTheDocument();
      });
    });
  });
});
