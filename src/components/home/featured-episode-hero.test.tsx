import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { FeaturedEpisodeHero } from "./featured-episode-hero";

import type { Episode } from "@/types";

// Mock YouTubeEmbed component
vi.mock("@/components/episode/youtube-embed", () => ({
  YouTubeEmbed: ({
    youtubeId,
  }: {
    youtubeId: string;
    title: string;
  }) => <div data-testid="youtube-embed" data-youtube-id={youtubeId} />,
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string;
    alt: string;
    [key: string]: unknown;
  }) => <img src={src} alt={alt} {...props} />,
}));

const mockEpisode: Episode = {
  id: "ep-001",
  slug: "ep-001-test-episode",
  title: "Test Episode Title",
  description: "This is a test episode description for testing purposes.",
  publishedAt: new Date("2026-01-10T12:00:00Z"),
  duration: 5400, // 1h 30min
  youtubeId: "abc123",
  thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  thumbnails: {
    default: { url: "", width: 120, height: 90 },
    medium: { url: "", width: 320, height: 180 },
    high: {
      url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
      width: 480,
      height: 360,
    },
  },
  channelId: "channel-123",
  channelTitle: "PPTNC",
  playlistId: "playlist-123",
  position: 1,
  statistics: {
    viewCount: "1500",
    likeCount: "100",
    commentCount: "25",
    favoriteCount: "0",
  },
  contentDetails: {
    duration: "PT1H30M",
    dimension: "2d",
    definition: "hd",
    caption: "true",
    licensedContent: false,
    projection: "rectangular",
    contentRating: {},
  },
  guests: [
    {
      name: "João Silva",
      role: "Product Manager",
      company: "Tech Co",
      photoUrl: "https://example.com/photo.jpg",
    },
    { name: "Maria Santos", role: "CTO", company: "Startup Inc" },
  ],
  topics: ["testing", "react", "nextjs", "typescript"],
  spotifyUrl: "https://open.spotify.com/episode/123",
};

describe("FeaturedEpisodeHero", () => {
  describe("rendering", () => {
    it("renders episode title", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      expect(screen.getByText("Test Episode Title")).toBeInTheDocument();
    });

    it("renders episode description", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      expect(screen.getByText(/test episode description/i)).toBeInTheDocument();
    });

    it("renders formatted date", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      expect(screen.getByText(/jan/i)).toBeInTheDocument();
    });

    it("renders duration when available", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      expect(screen.getByText("1h 30min")).toBeInTheDocument();
    });

    it("renders YouTubeEmbed component with correct props", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      const embed = screen.getByTestId("youtube-embed");
      expect(embed).toBeInTheDocument();
      expect(embed).toHaveAttribute("data-youtube-id", "abc123");
    });
  });

  describe("topics", () => {
    it("renders topic badges", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      expect(screen.getByText("testing")).toBeInTheDocument();
      expect(screen.getByText("react")).toBeInTheDocument();
      expect(screen.getByText("nextjs")).toBeInTheDocument();
      expect(screen.getByText("typescript")).toBeInTheDocument();
    });

    it("limits topics to 4", () => {
      const episodeWithManyTopics = {
        ...mockEpisode,
        topics: ["topic1", "topic2", "topic3", "topic4", "topic5", "topic6"],
      };
      render(<FeaturedEpisodeHero episode={episodeWithManyTopics} />);

      expect(screen.getByText("topic1")).toBeInTheDocument();
      expect(screen.getByText("topic2")).toBeInTheDocument();
      expect(screen.getByText("topic3")).toBeInTheDocument();
      expect(screen.getByText("topic4")).toBeInTheDocument();
      expect(screen.queryByText("topic5")).not.toBeInTheDocument();
    });

    it("handles empty topics array", () => {
      const episodeNoTopics = { ...mockEpisode, topics: [] };
      render(<FeaturedEpisodeHero episode={episodeNoTopics} />);

      expect(screen.getByText("Test Episode Title")).toBeInTheDocument();
    });
  });

  describe("guests", () => {
    it("renders guest section", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      expect(screen.getByText("João Silva")).toBeInTheDocument();
    });

    it("renders guest names", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      expect(screen.getByText("João Silva")).toBeInTheDocument();
      expect(screen.getByText("Maria Santos")).toBeInTheDocument();
    });

    it("renders guest roles", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      expect(screen.getByText("Product Manager")).toBeInTheDocument();
      expect(screen.getByText("CTO")).toBeInTheDocument();
    });

    it("renders guest avatars with initials fallback", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      // Maria Santos doesn't have a photo, so initials should be shown
      expect(screen.getByText("MS")).toBeInTheDocument();
    });

    it("does not render guest section when no guests", () => {
      const episodeNoGuests = { ...mockEpisode, guests: [] };
      render(<FeaturedEpisodeHero episode={episodeNoGuests} />);

      expect(screen.queryByText("João Silva")).not.toBeInTheDocument();
    });
  });

  describe("CTAs", () => {
    it("renders episode link CTA", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      const episodeLink = screen.getByRole("link", {
        name: /ver episódio completo/i,
      });
      expect(episodeLink).toBeInTheDocument();
      expect(episodeLink).toHaveAttribute(
        "href",
        "/episodios/ep-001-test-episode"
      );
    });

    it("renders Spotify CTA when spotifyUrl is available", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      const spotifyLink = screen.getByRole("link", {
        name: /ouvir no spotify/i,
      });
      expect(spotifyLink).toBeInTheDocument();
      expect(spotifyLink).toHaveAttribute(
        "href",
        "https://open.spotify.com/episode/123"
      );
      expect(spotifyLink).toHaveAttribute("target", "_blank");
    });

    it("does not render Spotify CTA when spotifyUrl is not available", () => {
      const episodeNoSpotify = { ...mockEpisode, spotifyUrl: undefined };
      render(<FeaturedEpisodeHero episode={episodeNoSpotify} />);

      expect(
        screen.queryByRole("link", { name: /ouvir no spotify/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("handles zero duration", () => {
      const episodeNoDuration = { ...mockEpisode, duration: 0 };
      render(<FeaturedEpisodeHero episode={episodeNoDuration} />);

      // Should not display duration separator and value
      expect(screen.queryByText("0min")).not.toBeInTheDocument();
    });

    it("handles missing description", () => {
      const episodeNoDesc = { ...mockEpisode, description: "" };
      render(<FeaturedEpisodeHero episode={episodeNoDesc} />);

      expect(screen.getByText("Test Episode Title")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <FeaturedEpisodeHero episode={mockEpisode} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("title links to episode page", () => {
      render(<FeaturedEpisodeHero episode={mockEpisode} />);

      // Find the title link (not the CTA button link)
      const titleLink = screen.getByRole("link", {
        name: /Test Episode Title/i,
      });
      expect(titleLink).toHaveAttribute(
        "href",
        "/episodios/ep-001-test-episode"
      );
    });
  });
});
