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
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    // Mock clipboard API
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Restore original clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
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
});
