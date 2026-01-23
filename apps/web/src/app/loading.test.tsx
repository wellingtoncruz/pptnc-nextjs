import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import HomeLoading from "./loading";

describe("HomeLoading", () => {
  it("renders loading skeletons", () => {
    render(<HomeLoading />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("has aria-busy attribute for accessibility", () => {
    render(<HomeLoading />);
    const busyElements = document.querySelectorAll('[aria-busy="true"]');
    expect(busyElements.length).toBeGreaterThan(0);
  });

  it("has aria-label for loading sections", () => {
    render(<HomeLoading />);
    expect(
      screen.getByLabelText(/carregando episódio em destaque/i)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/carregando episódios recentes/i)
    ).toBeInTheDocument();
  });

  it("renders featured episode skeleton", () => {
    render(<HomeLoading />);
    // Featured skeleton has aspect-video for thumbnail
    const aspectVideo = document.querySelector(".aspect-video");
    expect(aspectVideo).toBeInTheDocument();
  });

  it("renders grid of episode card skeletons", () => {
    render(<HomeLoading />);
    // Should render 8 compact skeletons for recent episodes
    const cards = document.querySelectorAll('[data-slot="card"]');
    // At least 2 cards (featured + some compact)
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it("renders all skeletons with pulse animation", () => {
    render(<HomeLoading />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    skeletons.forEach((skeleton) => {
      expect(skeleton).toHaveClass("animate-pulse");
    });
  });
});
