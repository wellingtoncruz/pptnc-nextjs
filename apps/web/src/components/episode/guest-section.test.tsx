import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { GuestSection } from "./guest-section";

// Mock GuestCard to isolate GuestSection testing
vi.mock("./guest-card", () => ({
  GuestCard: ({ guest }: { guest: { name: string } }) => (
    <div data-testid="guest-card" data-name={guest.name}>
      {guest.name}
    </div>
  ),
}));

describe("GuestSection", () => {
  describe("Empty state handling", () => {
    it("renders nothing when guests array is empty", () => {
      const { container } = render(<GuestSection guests={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when guests is undefined", () => {
      // @ts-expect-error testing edge case
      const { container } = render(<GuestSection guests={undefined} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when guests is null", () => {
      // @ts-expect-error testing edge case
      const { container } = render(<GuestSection guests={null} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Section rendering", () => {
    it("renders section title as h2", () => {
      render(<GuestSection guests={[{ name: "Test Guest" }]} />);
      const heading = screen.getByRole("heading", { level: 2, name: "Convidados" });
      expect(heading).toBeInTheDocument();
    });

    it("renders section element with aria-labelledby", () => {
      render(<GuestSection guests={[{ name: "Test Guest" }]} />);
      const section = screen.getByRole("region");
      // useId generates dynamic IDs, just verify aria-labelledby is present
      expect(section).toHaveAttribute("aria-labelledby");
    });

    it("renders all guests", () => {
      const guests = [
        { name: "Guest 1" },
        { name: "Guest 2" },
        { name: "Guest 3" },
      ];
      render(<GuestSection guests={guests} />);

      const guestCards = screen.getAllByTestId("guest-card");
      expect(guestCards).toHaveLength(3);
      expect(guestCards[0]).toHaveTextContent("Guest 1");
      expect(guestCards[1]).toHaveTextContent("Guest 2");
      expect(guestCards[2]).toHaveTextContent("Guest 3");
    });

    it("renders single guest correctly", () => {
      render(<GuestSection guests={[{ name: "Solo Guest" }]} />);

      const guestCards = screen.getAllByTestId("guest-card");
      expect(guestCards).toHaveLength(1);
      expect(guestCards[0]).toHaveTextContent("Solo Guest");
    });
  });

  describe("Styling", () => {
    it("applies custom className", () => {
      const { container } = render(
        <GuestSection guests={[{ name: "Test Guest" }]} className="my-custom-class" />
      );
      expect(container.firstChild).toHaveClass("my-custom-class");
    });

    it("has responsive grid layout for guest cards", () => {
      render(<GuestSection guests={[{ name: "Test Guest" }]} />);
      const grid = document.querySelector(".grid");
      expect(grid).toBeInTheDocument();
      expect(grid).toHaveClass("gap-6", "sm:grid-cols-2", "lg:grid-cols-3");
    });

    it("has space-y-4 for section spacing", () => {
      const { container } = render(
        <GuestSection guests={[{ name: "Test Guest" }]} />
      );
      expect(container.firstChild).toHaveClass("space-y-4");
    });
  });

  describe("Accessibility", () => {
    it("uses section element", () => {
      render(<GuestSection guests={[{ name: "Test Guest" }]} />);
      expect(screen.getByRole("region")).toBeInTheDocument();
    });

    it("has heading with id matching aria-labelledby", () => {
      render(<GuestSection guests={[{ name: "Test Guest" }]} />);
      const section = screen.getByRole("region");
      const heading = screen.getByRole("heading", { level: 2 });
      // Verify heading id matches section's aria-labelledby (useId generates dynamic IDs)
      const ariaLabelledBy = section.getAttribute("aria-labelledby");
      expect(heading).toHaveAttribute("id", ariaLabelledBy);
    });
  });
});
