import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { SubscriptionCta } from "./subscription-cta";
import { EXTERNAL_LINKS, SITE_CONFIG } from "@/lib/constants";

describe("SubscriptionCta", () => {
  it("renders the CTA card", () => {
    render(<SubscriptionCta />);

    expect(
      screen.getByRole("complementary", { name: /inscreva-se no podcast/i })
    ).toBeInTheDocument();
  });

  it("renders compelling headline", () => {
    render(<SubscriptionCta />);

    expect(
      screen.getByText("Não perca os próximos episódios!")
    ).toBeInTheDocument();
  });

  it("renders description with podcast name from SITE_CONFIG", () => {
    render(<SubscriptionCta />);

    expect(
      screen.getByText(`Inscreva-se para receber novidades do ${SITE_CONFIG.name}`)
    ).toBeInTheDocument();
  });

  it("renders YouTube subscription link with correct URL", () => {
    render(<SubscriptionCta />);

    const youtubeLink = screen.getByRole("link", {
      name: /inscrever no youtube/i,
    });

    expect(youtubeLink).toHaveAttribute("href", EXTERNAL_LINKS.youtubeSubscribe);
    expect(youtubeLink).toHaveAttribute("target", "_blank");
    expect(youtubeLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders Spotify subscription link with correct URL", () => {
    render(<SubscriptionCta />);

    const spotifyLink = screen.getByRole("link", {
      name: /seguir no spotify/i,
    });

    expect(spotifyLink).toHaveAttribute("href", EXTERNAL_LINKS.spotify);
    expect(spotifyLink).toHaveAttribute("target", "_blank");
    expect(spotifyLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("has proper accessibility attributes on YouTube link", () => {
    render(<SubscriptionCta />);

    const youtubeLink = screen.getByRole("link", {
      name: /inscrever no youtube \(abre em nova aba\)/i,
    });

    expect(youtubeLink).toBeInTheDocument();
  });

  it("has proper accessibility attributes on Spotify link", () => {
    render(<SubscriptionCta />);

    const spotifyLink = screen.getByRole("link", {
      name: /seguir no spotify \(abre em nova aba\)/i,
    });

    expect(spotifyLink).toBeInTheDocument();
  });

  it("renders card with visual distinction styling", () => {
    const { container } = render(<SubscriptionCta />);

    const card = container.querySelector('[data-slot="card"]');
    expect(card).toHaveClass("bg-primary/5");
    expect(card).toHaveClass("border-primary/20");
  });

  it("applies custom className when provided", () => {
    const { container } = render(<SubscriptionCta className="mt-8" />);

    const card = container.querySelector('[data-slot="card"]');
    expect(card).toHaveClass("mt-8");
  });

  it("renders both buttons", () => {
    render(<SubscriptionCta />);

    const buttons = screen.getAllByRole("link");
    expect(buttons).toHaveLength(2);
  });
});
