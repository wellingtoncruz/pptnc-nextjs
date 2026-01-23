import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { EpisodeCardSkeleton } from "./episode-card-skeleton";

describe("EpisodeCardSkeleton", () => {
  describe("compact variant (default)", () => {
    it("renders a card element", () => {
      render(<EpisodeCardSkeleton />);
      // Card has data-slot="card" from shadcn
      expect(document.querySelector('[data-slot="card"]')).toBeInTheDocument();
    });

    it("renders skeleton elements with pulse animation", () => {
      render(<EpisodeCardSkeleton />);
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
      // Check for animate-pulse class
      expect(skeletons[0]).toHaveClass("animate-pulse");
    });

    it("renders thumbnail skeleton with aspect-video", () => {
      render(<EpisodeCardSkeleton />);
      const thumbnail = document.querySelector(".aspect-video");
      expect(thumbnail).toBeInTheDocument();
    });
  });

  describe("featured variant", () => {
    it("renders larger skeletons for featured card", () => {
      render(<EpisodeCardSkeleton variant="featured" />);
      // Featured has title skeleton h-8 (larger than compact h-5)
      const titleSkeleton = document.querySelector(".h-8");
      expect(titleSkeleton).toBeInTheDocument();
    });

    it("renders topic badge skeletons", () => {
      render(<EpisodeCardSkeleton variant="featured" />);
      // Featured has rounded-full badge skeletons
      const badges = document.querySelectorAll(".rounded-full");
      expect(badges.length).toBeGreaterThanOrEqual(3);
    });
  });
});
