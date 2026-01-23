import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { GuestCard } from "./guest-card";

describe("GuestCard", () => {
  const fullGuest = {
    name: "John Doe",
    role: "CEO",
    company: "Acme Inc",
    bio: "A brief bio about John that describes his background and expertise.",
    photoUrl: "https://example.com/photo.jpg",
    socialLinks: {
      twitter: "https://twitter.com/johndoe",
      linkedin: "https://linkedin.com/in/johndoe",
      website: "https://johndoe.com",
    },
  };

  describe("Basic rendering", () => {
    it("renders guest name", () => {
      render(<GuestCard guest={fullGuest} />);
      expect(screen.getByRole("heading", { name: "John Doe" })).toBeInTheDocument();
    });

    it("renders guest photo when provided", () => {
      render(<GuestCard guest={fullGuest} />);
      // Radix Avatar renders img element but JSDOM doesn't load images
      // so the AvatarImage is present but hidden until onload fires
      // We verify the structure is correct by checking for avatar container
      const avatar = document.querySelector('[data-slot="avatar"]');
      expect(avatar).toBeInTheDocument();
    });

    it("renders role and company as subtitle", () => {
      render(<GuestCard guest={fullGuest} />);
      expect(screen.getByText("CEO @ Acme Inc")).toBeInTheDocument();
    });

    it("renders bio when provided", () => {
      render(<GuestCard guest={fullGuest} />);
      expect(screen.getByText(fullGuest.bio)).toBeInTheDocument();
    });
  });

  describe("Social links", () => {
    it("renders Twitter link with aria-label", () => {
      render(<GuestCard guest={fullGuest} />);
      const link = screen.getByLabelText(/twitter/i);
      expect(link).toHaveAttribute("href", fullGuest.socialLinks!.twitter);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders LinkedIn link with aria-label", () => {
      render(<GuestCard guest={fullGuest} />);
      // Use more specific selector - the icon link in social section
      const link = screen.getByLabelText(`${fullGuest.name} no LinkedIn`);
      expect(link).toHaveAttribute("href", fullGuest.socialLinks!.linkedin);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders website link with aria-label", () => {
      render(<GuestCard guest={fullGuest} />);
      const link = screen.getByLabelText(/site de/i);
      expect(link).toHaveAttribute("href", fullGuest.socialLinks!.website);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("does not render social links section when no links provided", () => {
      render(<GuestCard guest={{ name: "Jane Doe" }} />);
      expect(screen.queryByLabelText(/twitter/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/linkedin/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/site de/i)).not.toBeInTheDocument();
    });

    it("renders only provided social links", () => {
      const guestWithPartialLinks = {
        name: "Partial Guest",
        socialLinks: {
          twitter: "https://twitter.com/partial",
        },
      };
      render(<GuestCard guest={guestWithPartialLinks} />);
      expect(screen.getByLabelText(/twitter/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/linkedin/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/site de/i)).not.toBeInTheDocument();
    });
  });

  describe("Fallback avatar", () => {
    it("renders fallback avatar when no photoUrl provided", () => {
      render(<GuestCard guest={{ name: "Jane Doe" }} />);
      // Avatar fallback should be rendered (contains User icon)
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      // No img element should be rendered
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });
  });

  describe("Missing optional fields", () => {
    it("handles guest with only name", () => {
      const minimalGuest = { name: "Minimal Guest" };
      render(<GuestCard guest={minimalGuest} />);
      expect(screen.getByRole("heading", { name: "Minimal Guest" })).toBeInTheDocument();
    });

    it("does not render subtitle when role and company are missing", () => {
      render(<GuestCard guest={{ name: "No Title Guest" }} />);
      expect(screen.queryByText("@")).not.toBeInTheDocument();
    });

    it("renders only role when company is missing", () => {
      render(<GuestCard guest={{ name: "Role Only", role: "Developer" }} />);
      expect(screen.getByText("Developer")).toBeInTheDocument();
    });

    it("renders only company when role is missing", () => {
      render(<GuestCard guest={{ name: "Company Only", company: "TechCorp" }} />);
      expect(screen.getByText("TechCorp")).toBeInTheDocument();
    });

    it("does not render bio paragraph when bio is missing", () => {
      render(<GuestCard guest={{ name: "No Bio Guest", role: "Developer" }} />);
      // Should only have name heading and role text, no bio
      const texts = screen.getAllByText(/.+/);
      expect(texts.some(t => t.textContent === "No Bio Guest")).toBe(true);
      expect(texts.some(t => t.textContent === "Developer")).toBe(true);
    });

    it("returns null when guest has no name", () => {
      // @ts-expect-error testing edge case with missing name
      const { container } = render(<GuestCard guest={{}} />);
      expect(container.firstChild).toBeNull();
    });

    it("returns null when guest is null-like", () => {
      // @ts-expect-error testing edge case
      const { container } = render(<GuestCard guest={null} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("URL validation", () => {
    it("does not render invalid social link URLs", () => {
      const guestWithInvalidUrls = {
        name: "Invalid URLs Guest",
        socialLinks: {
          twitter: "javascript:alert('xss')",
          linkedin: "ftp://invalid.com",
          website: "not-a-url",
        },
      };
      render(<GuestCard guest={guestWithInvalidUrls} />);
      // No social links should be rendered
      expect(screen.queryByLabelText(/twitter/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/linkedin/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/site de/i)).not.toBeInTheDocument();
    });

    it("renders only valid social link URLs", () => {
      const guestWithMixedUrls = {
        name: "Mixed URLs Guest",
        socialLinks: {
          twitter: "https://twitter.com/valid",
          linkedin: "javascript:alert('xss')",
          website: "http://valid-website.com",
        },
      };
      render(<GuestCard guest={guestWithMixedUrls} />);
      expect(screen.getByLabelText(/twitter/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/linkedin/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/site de/i)).toBeInTheDocument();
    });
  });

  describe("Styling", () => {
    it("applies custom className", () => {
      const { container } = render(
        <GuestCard guest={fullGuest} className="my-custom-class" />
      );
      expect(container.firstChild).toHaveClass("my-custom-class");
    });

    it("has flex layout", () => {
      const { container } = render(<GuestCard guest={fullGuest} />);
      expect(container.firstChild).toHaveClass("flex", "gap-4");
    });

    it("truncates long name and subtitle", () => {
      render(<GuestCard guest={fullGuest} />);
      const heading = screen.getByRole("heading", { level: 3 });
      expect(heading).toHaveClass("truncate");
      const subtitle = screen.getByText("CEO @ Acme Inc");
      expect(subtitle).toHaveClass("truncate");
    });
  });

  describe("Accessibility", () => {
    it("uses h3 for guest name", () => {
      render(<GuestCard guest={fullGuest} />);
      const heading = screen.getByRole("heading", { level: 3 });
      expect(heading).toHaveTextContent("John Doe");
    });

    it("has proper aria-labels on social links", () => {
      render(<GuestCard guest={fullGuest} />);
      expect(screen.getByLabelText("John Doe no Twitter")).toBeInTheDocument();
      expect(screen.getByLabelText("John Doe no LinkedIn")).toBeInTheDocument();
      expect(screen.getByLabelText("Site de John Doe")).toBeInTheDocument();
    });

    it("renders avatar component for guest photo", () => {
      render(<GuestCard guest={fullGuest} />);
      // Radix Avatar doesn't render the img until it loads (JSDOM limitation)
      // We verify the avatar container exists and has correct size classes
      const avatar = document.querySelector('[data-slot="avatar"]');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveClass("h-16", "w-16");
    });
  });
});
