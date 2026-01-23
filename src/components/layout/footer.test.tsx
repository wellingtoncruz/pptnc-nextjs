import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Footer } from "./footer";

describe("Footer", () => {
  it("renders the footer element", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toBeInTheDocument();
  });

  it("displays podcast logo with alt text", () => {
    render(<Footer />);
    const logo = screen.getByRole("img", { name: /ppt não compila/i });
    expect(logo).toBeInTheDocument();
  });

  it("displays podcast description/tagline", () => {
    render(<Footer />);
    expect(
      screen.getByText(/podcast sobre tecnologia e transformação digital/i)
    ).toBeInTheDocument();
  });

  it("displays copyright text with current year", () => {
    render(<Footer />);
    const currentYear = new Date().getFullYear();
    expect(
      screen.getByText(new RegExp(`© ${currentYear}`))
    ).toBeInTheDocument();
  });

  it("displays all rights reserved text in Portuguese", () => {
    render(<Footer />);
    expect(
      screen.getByText(/todos os direitos reservados/i)
    ).toBeInTheDocument();
  });

  it("renders navigation links (Home, Episódios)", () => {
    render(<Footer />);
    const homeLink = screen.getByRole("link", { name: /home/i });
    const episodiosLink = screen.getByRole("link", { name: /episódios/i });

    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute("href", "/");
    expect(episodiosLink).toBeInTheDocument();
    expect(episodiosLink).toHaveAttribute("href", "/episodios");
  });

  it("has footer navigation with proper aria-label", () => {
    render(<Footer />);
    const nav = screen.getByRole("navigation", { name: /footer navigation/i });
    expect(nav).toBeInTheDocument();
  });

  it("renders YouTube social link", () => {
    render(<Footer />);
    const youtubeLink = screen.getByRole("link", { name: /seguir no youtube/i });
    expect(youtubeLink).toBeInTheDocument();
    expect(youtubeLink).toHaveAttribute(
      "href",
      expect.stringContaining("youtube.com")
    );
  });

  it("renders Spotify social link", () => {
    render(<Footer />);
    const spotifyLink = screen.getByRole("link", { name: /seguir no spotify/i });
    expect(spotifyLink).toBeInTheDocument();
    expect(spotifyLink).toHaveAttribute(
      "href",
      expect.stringContaining("spotify.com")
    );
  });

  it("renders Instagram social link", () => {
    render(<Footer />);
    const instagramLink = screen.getByRole("link", {
      name: /seguir no instagram/i,
    });
    expect(instagramLink).toBeInTheDocument();
    expect(instagramLink).toHaveAttribute(
      "href",
      expect.stringContaining("instagram.com")
    );
  });

  it("renders LinkedIn social link", () => {
    render(<Footer />);
    const linkedinLink = screen.getByRole("link", {
      name: /seguir no linkedin/i,
    });
    expect(linkedinLink).toBeInTheDocument();
    expect(linkedinLink).toHaveAttribute(
      "href",
      expect.stringContaining("linkedin.com")
    );
  });

  it("all external social links open in new tab", () => {
    render(<Footer />);
    const externalLinks = screen.getAllByRole("link").filter((link) => {
      const href = link.getAttribute("href");
      return href?.startsWith("http");
    });

    externalLinks.forEach((link) => {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  it("has border-top styling", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("border-t");
  });

  it("social links have proper accessibility labels", () => {
    render(<Footer />);

    const youtubeLink = screen.getByRole("link", { name: /seguir no youtube/i });
    const spotifyLink = screen.getByRole("link", { name: /seguir no spotify/i });

    expect(youtubeLink).toHaveAccessibleName();
    expect(spotifyLink).toHaveAccessibleName();
  });
});
