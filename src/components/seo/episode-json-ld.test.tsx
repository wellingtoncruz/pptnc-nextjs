import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { EpisodeJsonLd } from "./episode-json-ld";

import type { Episode } from "@/types";

const createMockEpisode = (overrides?: Partial<Episode>): Episode => ({
  id: "abc123",
  slug: "test-episode",
  title: "Test Episode Title",
  description: "This is a test description for the episode.",
  publishedAt: new Date("2026-01-15T10:00:00Z"),
  duration: 3700, // 1h 1min 40s
  youtubeId: "abc123",
  thumbnailUrl: "https://example.com/thumb.jpg",
  thumbnails: {
    default: { url: "https://example.com/default.jpg", width: 120, height: 90 },
    medium: { url: "https://example.com/medium.jpg", width: 320, height: 180 },
    high: { url: "https://example.com/high.jpg", width: 480, height: 360 },
  },
  topics: ["tech", "ai"],
  guests: [],
  channelId: "channel123",
  channelTitle: "PPT Nao Compila",
  playlistId: "playlist123",
  position: 1,
  statistics: {
    commentCount: "100",
    favoriteCount: "50",
    viewCount: "10000",
    likeCount: "500",
  },
  contentDetails: {
    caption: "false",
    dimension: "2d",
    duration: "PT1H1M40S",
    definition: "hd",
    contentRating: {},
    projection: "rectangular",
    licensedContent: false,
  },
  ...overrides,
});

describe("EpisodeJsonLd", () => {
  const baseUrl = "https://pptnc.com.br";

  it("renders JSON-LD script tag", () => {
    const episode = createMockEpisode();
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toBeInTheDocument();
  });

  it("includes PodcastEpisode type", () => {
    const episode = createMockEpisode();
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("PodcastEpisode");
  });

  it("includes episode name and description", () => {
    const episode = createMockEpisode();
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd.name).toBe("Test Episode Title");
    expect(jsonLd.description).toBe("This is a test description for the episode.");
  });

  it("includes datePublished in ISO 8601 format", () => {
    const episode = createMockEpisode();
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd.datePublished).toBe("2026-01-15T10:00:00.000Z");
  });

  it("includes duration in ISO 8601 format from contentDetails", () => {
    const episode = createMockEpisode();
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd.duration).toBe("PT1H1M40S");
  });

  it("includes correct episode URL", () => {
    const episode = createMockEpisode({ slug: "my-episode" });
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd.url).toBe("https://pptnc.com.br/episodios/my-episode");
  });

  it("includes partOfSeries with PodcastSeries type", () => {
    const episode = createMockEpisode();
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd.partOfSeries).toBeDefined();
    expect(jsonLd.partOfSeries["@type"]).toBe("PodcastSeries");
    expect(jsonLd.partOfSeries.name).toBe("PPT Não Compila");
    expect(jsonLd.partOfSeries.url).toBe(baseUrl);
  });

  it("includes VideoObject in associatedMedia", () => {
    const episode = createMockEpisode({ youtubeId: "xyz789" });
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd.associatedMedia).toBeDefined();
    expect(jsonLd.associatedMedia["@type"]).toBe("VideoObject");
    expect(jsonLd.associatedMedia.name).toBe("Test Episode Title");
    expect(jsonLd.associatedMedia.embedUrl).toBe("https://www.youtube.com/embed/xyz789");
    expect(jsonLd.associatedMedia.contentUrl).toBe("https://www.youtube.com/watch?v=xyz789");
  });

  it("uses YouTube default thumbnail when thumbnailUrl is empty", () => {
    const episode = createMockEpisode({ thumbnailUrl: "", youtubeId: "abc123" });
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd.image).toBe("https://img.youtube.com/vi/abc123/hqdefault.jpg");
    expect(jsonLd.associatedMedia.thumbnailUrl).toBe("https://img.youtube.com/vi/abc123/hqdefault.jpg");
  });

  it("handles episode without description", () => {
    const episode = createMockEpisode({ description: "" });
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd.description).toBeUndefined();
    expect(jsonLd.associatedMedia.description).toBeUndefined();
  });

  it("converts duration from seconds when contentDetails is missing", () => {
    const episode = createMockEpisode({
      duration: 5400, // 1h 30min
      contentDetails: undefined as unknown as Episode["contentDetails"],
    });
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd.duration).toBe("PT1H30M");
  });

  it("handles publishedAt as string date", () => {
    const episode = createMockEpisode({
      publishedAt: "2026-01-20T14:30:00Z" as unknown as Date,
    });
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd.datePublished).toBe("2026-01-20T14:30:00.000Z");
  });

  it("handles empty youtubeId gracefully", () => {
    const episode = createMockEpisode({ youtubeId: "" });
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    // Should still generate URLs (even if invalid) without crashing
    expect(jsonLd.associatedMedia.embedUrl).toBe("https://www.youtube.com/embed/");
    expect(jsonLd.associatedMedia.contentUrl).toBe("https://www.youtube.com/watch?v=");
  });

  it("includes episodeNumber from position", () => {
    const episode = createMockEpisode({ position: 42 });
    const { container } = render(
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const jsonLd = JSON.parse(script?.textContent || "{}");

    expect(jsonLd.episodeNumber).toBe(42);
  });
});
