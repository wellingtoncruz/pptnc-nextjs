import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { EpisodeCard } from "./episode-card";

import type { Episode } from "@/types";

const mockEpisode: Episode = {
  id: "ep-001",
  slug: "ep-001-test-episode",
  title: "Test Episode Title",
  description: "This is a test episode description for testing purposes.",
  publishedAt: new Date("2026-01-10T12:00:00Z"), // Use noon to avoid timezone issues
  duration: 5400, // 1h 30min
  youtubeId: "abc123",
  thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  thumbnails: {
    default: { url: "", width: 120, height: 90 },
    medium: { url: "", width: 320, height: 180 },
    high: { url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg", width: 480, height: 360 },
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
  guests: [],
  topics: ["testing", "react", "nextjs"],
};

describe("EpisodeCard", () => {
  describe("featured variant", () => {
    it("renders title and description", () => {
      render(<EpisodeCard episode={mockEpisode} variant="featured" />);

      expect(screen.getByText("Test Episode Title")).toBeInTheDocument();
      expect(screen.getByText(/test episode description/i)).toBeInTheDocument();
    });

    it("formats duration correctly", () => {
      render(<EpisodeCard episode={mockEpisode} variant="featured" />);

      expect(screen.getByText("1h 30min")).toBeInTheDocument();
    });

    it("displays formatted date", () => {
      render(<EpisodeCard episode={mockEpisode} variant="featured" />);

      // Should contain month and year (avoid day number due to timezone variations)
      expect(screen.getByText(/jan/i)).toBeInTheDocument();
    });

    it("links to episode page with correct slug", () => {
      render(<EpisodeCard episode={mockEpisode} variant="featured" />);

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/episodios/ep-001-test-episode");
    });

    it("renders thumbnail image", () => {
      render(<EpisodeCard episode={mockEpisode} variant="featured" />);

      const image = screen.getByRole("img", { name: "Test Episode Title" });
      expect(image).toBeInTheDocument();
    });

    it("displays topic badges", () => {
      render(<EpisodeCard episode={mockEpisode} variant="featured" />);

      expect(screen.getByText("testing")).toBeInTheDocument();
      expect(screen.getByText("react")).toBeInTheDocument();
      expect(screen.getByText("nextjs")).toBeInTheDocument();
    });

    it("limits topic badges to 3", () => {
      const episodeWithManyTopics = {
        ...mockEpisode,
        topics: ["topic1", "topic2", "topic3", "topic4", "topic5"],
      };
      render(<EpisodeCard episode={episodeWithManyTopics} variant="featured" />);

      expect(screen.getByText("topic1")).toBeInTheDocument();
      expect(screen.getByText("topic2")).toBeInTheDocument();
      expect(screen.getByText("topic3")).toBeInTheDocument();
      expect(screen.queryByText("topic4")).not.toBeInTheDocument();
      expect(screen.queryByText("topic5")).not.toBeInTheDocument();
    });
  });

  describe("compact variant", () => {
    it("renders title", () => {
      render(<EpisodeCard episode={mockEpisode} variant="compact" />);

      expect(screen.getByText("Test Episode Title")).toBeInTheDocument();
    });

    it("displays date and duration separately", () => {
      render(<EpisodeCard episode={mockEpisode} variant="compact" />);

      // Date is displayed in the card content
      expect(screen.getByText(/jan/i)).toBeInTheDocument();
      // Duration is displayed as badge overlay on thumbnail
      expect(screen.getByText("1h 30min")).toBeInTheDocument();
    });

    it("displays topics as badges", () => {
      render(<EpisodeCard episode={mockEpisode} variant="compact" />);

      // Shows first 2 topics + count badge for remaining
      expect(screen.getByText("testing")).toBeInTheDocument();
      expect(screen.getByText("react")).toBeInTheDocument();
      expect(screen.getByText("+1")).toBeInTheDocument();
    });

    it("displays guest names", () => {
      const episodeWithGuests = {
        ...mockEpisode,
        guests: [
          { name: "João Silva", role: "Product Manager", company: "Tech Co" },
          { name: "Maria Santos", role: "CTO", company: "Startup Inc" },
        ],
      };
      render(<EpisodeCard episode={episodeWithGuests} variant="compact" />);

      expect(screen.getByText("João Silva, Maria Santos")).toBeInTheDocument();
    });

    it("links to episode page", () => {
      render(<EpisodeCard episode={mockEpisode} variant="compact" />);

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/episodios/ep-001-test-episode");
    });

    it("does not show description in compact variant", () => {
      render(<EpisodeCard episode={mockEpisode} variant="compact" />);

      expect(screen.queryByText(/test episode description/i)).not.toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("handles missing thumbnail gracefully", () => {
      const episodeNoThumb = { ...mockEpisode, thumbnailUrl: "" };
      render(<EpisodeCard episode={episodeNoThumb} variant="featured" />);

      // Should show placeholder emoji instead of image
      expect(screen.getByText("🎙️")).toBeInTheDocument();
    });

    it("handles empty description", () => {
      const episodeNoDesc = { ...mockEpisode, description: "" };
      render(<EpisodeCard episode={episodeNoDesc} variant="featured" />);

      expect(screen.getByText("Test Episode Title")).toBeInTheDocument();
    });

    it("handles zero duration", () => {
      const episodeNoDuration = { ...mockEpisode, duration: 0 };
      render(<EpisodeCard episode={episodeNoDuration} variant="featured" />);

      // Should not display duration when 0
      expect(screen.queryByText("0min")).not.toBeInTheDocument();
    });

    it("handles empty topics array", () => {
      const episodeNoTopics = { ...mockEpisode, topics: [] };
      render(<EpisodeCard episode={episodeNoTopics} variant="featured" />);

      // Should still render without errors
      expect(screen.getByText("Test Episode Title")).toBeInTheDocument();
    });

    it("truncates long titles with line-clamp", () => {
      const longTitle = "A".repeat(200);
      const episodeLongTitle = { ...mockEpisode, title: longTitle };
      render(<EpisodeCard episode={episodeLongTitle} variant="featured" />);

      const titleElement = screen.getByText(longTitle);
      expect(titleElement).toHaveClass("line-clamp-2");
    });

    it("defaults to compact variant", () => {
      render(<EpisodeCard episode={mockEpisode} />);

      // Compact variant doesn't show description
      expect(screen.queryByText(/test episode description/i)).not.toBeInTheDocument();
    });
  });
});
