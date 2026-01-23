import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { SocialActions } from "./social-actions";

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("SocialActions", () => {
  const mockWriteText = vi.fn();
  const mockWindowOpen = vi.fn();
  const originalClipboard = navigator.clipboard;
  const originalWindowOpen = window.open;

  beforeEach(() => {
    // Mock clipboard API
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
      configurable: true,
    });
    // Mock window.open
    window.open = mockWindowOpen;
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Restore original clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
    // Restore original window.open
    window.open = originalWindowOpen;
  });

  describe("External links", () => {
    it("renders YouTube link with correct attributes", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      const link = screen.getByRole("link", { name: /youtube/i });
      expect(link).toHaveAttribute(
        "href",
        expect.stringContaining("youtube.com")
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders Spotify link with correct attributes", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      const link = screen.getByRole("link", { name: /spotify/i });
      expect(link).toHaveAttribute(
        "href",
        expect.stringContaining("spotify.com")
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders YouTube link text", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      expect(screen.getByText("Seguir no YouTube")).toBeInTheDocument();
    });

    it("renders Spotify link text", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      expect(screen.getByText("Seguir no Spotify")).toBeInTheDocument();
    });
  });

  describe("Copy link button", () => {
    it("renders copy link button", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      expect(
        screen.getByRole("button", { name: /copiar/i })
      ).toBeInTheDocument();
    });

    it("renders copy link button text", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      expect(screen.getByText("Copiar link")).toBeInTheDocument();
    });

    it("copies URL to clipboard on click", async () => {
      mockWriteText.mockResolvedValueOnce(undefined);
      render(<SocialActions episodeUrl="https://example.com/ep1" />);

      fireEvent.click(screen.getByRole("button", { name: /copiar/i }));

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith("https://example.com/ep1");
      });
    });

    it("shows success toast on successful copy", async () => {
      const { toast } = await import("sonner");
      mockWriteText.mockResolvedValueOnce(undefined);
      render(<SocialActions episodeUrl="https://example.com/ep1" />);

      fireEvent.click(screen.getByRole("button", { name: /copiar/i }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Link copiado!");
      });
    });

    it("shows error toast on clipboard failure", async () => {
      const { toast } = await import("sonner");
      mockWriteText.mockRejectedValueOnce(new Error("Clipboard error"));
      render(<SocialActions episodeUrl="https://example.com/ep1" />);

      fireEvent.click(screen.getByRole("button", { name: /copiar/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Erro ao copiar o link");
      });
    });

    it("changes button text after successful copy", async () => {
      mockWriteText.mockResolvedValueOnce(undefined);
      render(<SocialActions episodeUrl="https://example.com/ep1" />);

      fireEvent.click(screen.getByRole("button", { name: /copiar/i }));

      await waitFor(() => {
        expect(screen.getByText("Copiado!")).toBeInTheDocument();
      });
    });
  });

  describe("Accessibility", () => {
    it("has proper aria-label on YouTube link", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      expect(screen.getByLabelText(/youtube/i)).toBeInTheDocument();
    });

    it("has proper aria-label on Spotify link", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      expect(screen.getByLabelText(/spotify/i)).toBeInTheDocument();
    });

    it("has proper aria-label on copy button", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      expect(screen.getByLabelText(/copiar/i)).toBeInTheDocument();
    });
  });

  describe("Styling", () => {
    it("applies custom className", () => {
      const { container } = render(
        <SocialActions
          episodeUrl="https://example.com/ep1"
          className="my-custom-class"
        />
      );
      expect(container.firstChild).toHaveClass("my-custom-class");
    });

    it("has flex layout", () => {
      const { container } = render(
        <SocialActions episodeUrl="https://example.com/ep1" />
      );
      expect(container.firstChild).toHaveClass("flex");
    });
  });

  describe("Share buttons", () => {
    describe("WhatsApp button", () => {
      it("renders WhatsApp button", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        expect(
          screen.getByRole("button", { name: /whatsapp/i })
        ).toBeInTheDocument();
      });

      it("renders WhatsApp button text", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        expect(screen.getByText("WhatsApp")).toBeInTheDocument();
      });

      it("opens WhatsApp share URL on click", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        fireEvent.click(screen.getByRole("button", { name: /whatsapp/i }));
        expect(mockWindowOpen).toHaveBeenCalledWith(
          expect.stringContaining("wa.me/?text="),
          "_blank"
        );
      });

      it("includes episode URL in WhatsApp share", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        fireEvent.click(screen.getByRole("button", { name: /whatsapp/i }));
        expect(mockWindowOpen).toHaveBeenCalledWith(
          expect.stringContaining(encodeURIComponent("https://example.com/ep1")),
          "_blank"
        );
      });

      it("includes episode title in WhatsApp share when provided", () => {
        render(
          <SocialActions
            episodeUrl="https://example.com/ep1"
            episodeTitle="My Test Episode"
          />
        );
        fireEvent.click(screen.getByRole("button", { name: /whatsapp/i }));
        expect(mockWindowOpen).toHaveBeenCalledWith(
          expect.stringContaining(encodeURIComponent("My Test Episode")),
          "_blank"
        );
      });
    });

    describe("X (Twitter) button", () => {
      it("renders X button", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        expect(
          screen.getByRole("button", { name: /compartilhar no x/i })
        ).toBeInTheDocument();
      });

      it("renders X button text", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        expect(screen.getByText("X")).toBeInTheDocument();
      });

      it("opens Twitter share URL on click", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        fireEvent.click(screen.getByRole("button", { name: /compartilhar no x/i }));
        expect(mockWindowOpen).toHaveBeenCalledWith(
          expect.stringContaining("twitter.com/intent/tweet"),
          "_blank"
        );
      });

      it("includes episode URL in Twitter share", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        fireEvent.click(screen.getByRole("button", { name: /compartilhar no x/i }));
        expect(mockWindowOpen).toHaveBeenCalledWith(
          expect.stringContaining(encodeURIComponent("https://example.com/ep1")),
          "_blank"
        );
      });
    });

    describe("LinkedIn button", () => {
      it("renders LinkedIn button", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        expect(
          screen.getByRole("button", { name: /linkedin/i })
        ).toBeInTheDocument();
      });

      it("renders LinkedIn button text", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        expect(screen.getByText("LinkedIn")).toBeInTheDocument();
      });

      it("opens LinkedIn share URL on click", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        fireEvent.click(screen.getByRole("button", { name: /linkedin/i }));
        expect(mockWindowOpen).toHaveBeenCalledWith(
          expect.stringContaining("linkedin.com/sharing/share-offsite"),
          "_blank"
        );
      });

      it("includes episode URL in LinkedIn share", () => {
        render(<SocialActions episodeUrl="https://example.com/ep1" />);
        fireEvent.click(screen.getByRole("button", { name: /linkedin/i }));
        expect(mockWindowOpen).toHaveBeenCalledWith(
          expect.stringContaining(encodeURIComponent("https://example.com/ep1")),
          "_blank"
        );
      });
    });
  });

  describe("Share accessibility", () => {
    it("has proper aria-label on WhatsApp button", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      expect(
        screen.getByLabelText(/compartilhar no whatsapp/i)
      ).toBeInTheDocument();
    });

    it("has proper aria-label on X button", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      expect(
        screen.getByLabelText(/compartilhar no x/i)
      ).toBeInTheDocument();
    });

    it("has proper aria-label on LinkedIn button", () => {
      render(<SocialActions episodeUrl="https://example.com/ep1" />);
      expect(
        screen.getByLabelText(/compartilhar no linkedin/i)
      ).toBeInTheDocument();
    });
  });
});
