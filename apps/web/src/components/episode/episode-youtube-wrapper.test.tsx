import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { EpisodeYouTubeWrapper } from "./episode-youtube-wrapper";

const mockEpisode = {
  id: "ep-1",
  slug: "test-episode",
  title: "Test Episode Title",
  description: "Test episode description",
  thumbnailUrl: "https://example.com/thumb.jpg",
  youtubeId: "abc123",
  spotifyUrl: "https://spotify.com/episode/123",
  publishedAt: "2024-01-15T10:00:00Z",
  duration: 3600,
  topics: ["Tech", "Programming"],
  guests: [],
  transcriptSrt: `1
00:00:00,000 --> 00:00:05,500
Hello, welcome to the show.

2
00:00:05,500 --> 00:00:12,000
Today we discuss programming.`,
};

describe("EpisodeYouTubeWrapper", () => {
  it("renders episode header with title", () => {
    render(
      <EpisodeYouTubeWrapper
        episode={mockEpisode}
        episodeUrl="https://example.com/episodios/test-episode"
      />
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Test Episode Title"
    );
  });

  it("renders content tabs with description and transcript", () => {
    render(
      <EpisodeYouTubeWrapper
        episode={mockEpisode}
        episodeUrl="https://example.com/episodios/test-episode"
      />
    );

    expect(screen.getByRole("tab", { name: /descrição/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /transcrição/i })).toBeInTheDocument();
  });

  it("renders timestamp links in transcript", () => {
    render(
      <EpisodeYouTubeWrapper
        episode={mockEpisode}
        episodeUrl="https://example.com/episodios/test-episode"
      />
    );

    // Transcript contains timestamps
    const timestampButtons = screen.getAllByRole("button", {
      name: /ir para .* no vídeo/i,
    });
    expect(timestampButtons.length).toBeGreaterThan(0);
  });

  it("renders social actions", () => {
    render(
      <EpisodeYouTubeWrapper
        episode={mockEpisode}
        episodeUrl="https://example.com/episodios/test-episode"
      />
    );

    // Social actions should be present
    expect(screen.getByLabelText(/seguir no youtube/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/copiar link do episódio/i)).toBeInTheDocument();
  });

  it("renders subscription CTA", () => {
    render(
      <EpisodeYouTubeWrapper
        episode={mockEpisode}
        episodeUrl="https://example.com/episodios/test-episode"
      />
    );

    // Subscription CTA should be present
    expect(screen.getByText(/próximos episódios/i)).toBeInTheDocument();
  });

  it("renders play button for YouTube video", () => {
    render(
      <EpisodeYouTubeWrapper
        episode={mockEpisode}
        episodeUrl="https://example.com/episodios/test-episode"
      />
    );

    expect(
      screen.getByRole("button", { name: /reproduzir/i })
    ).toBeInTheDocument();
  });

  it("renders article wrapper for content", () => {
    const { container } = render(
      <EpisodeYouTubeWrapper
        episode={mockEpisode}
        episodeUrl="https://example.com/episodios/test-episode"
      />
    );

    expect(container.querySelector("article")).toBeInTheDocument();
  });

  it("handles episode without transcript", () => {
    const episodeNoTranscript = {
      ...mockEpisode,
      transcriptSrt: undefined,
    };

    render(
      <EpisodeYouTubeWrapper
        episode={episodeNoTranscript}
        episodeUrl="https://example.com/episodios/test-episode"
      />
    );

    expect(screen.getByRole("tab", { name: /descrição/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /transcrição/i })
    ).not.toBeInTheDocument();
  });

  it("handles episode without description", () => {
    const episodeNoDescription = {
      ...mockEpisode,
      description: undefined,
    };

    render(
      <EpisodeYouTubeWrapper
        episode={episodeNoDescription}
        episodeUrl="https://example.com/episodios/test-episode"
      />
    );

    expect(
      screen.queryByRole("tab", { name: /descrição/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /transcrição/i })).toBeInTheDocument();
  });

  it("renders related episodes when provided", () => {
    const relatedEpisodes = [
      {
        ...mockEpisode,
        id: "related-1",
        slug: "related-episode-1",
        title: "Related Episode 1",
      },
      {
        ...mockEpisode,
        id: "related-2",
        slug: "related-episode-2",
        title: "Related Episode 2",
      },
    ];

    render(
      <EpisodeYouTubeWrapper
        episode={mockEpisode}
        episodeUrl="https://example.com/episodios/test-episode"
        relatedEpisodes={relatedEpisodes}
      />
    );

    expect(
      screen.getByRole("heading", { name: /episódios relacionados/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Related Episode 1")).toBeInTheDocument();
    expect(screen.getByText("Related Episode 2")).toBeInTheDocument();
  });

  it("does not render related episodes section when array is empty", () => {
    render(
      <EpisodeYouTubeWrapper
        episode={mockEpisode}
        episodeUrl="https://example.com/episodios/test-episode"
        relatedEpisodes={[]}
      />
    );

    expect(
      screen.queryByRole("heading", { name: /episódios relacionados/i })
    ).not.toBeInTheDocument();
  });

  it("does not render related episodes section when not provided", () => {
    render(
      <EpisodeYouTubeWrapper
        episode={mockEpisode}
        episodeUrl="https://example.com/episodios/test-episode"
      />
    );

    expect(
      screen.queryByRole("heading", { name: /episódios relacionados/i })
    ).not.toBeInTheDocument();
  });
});
