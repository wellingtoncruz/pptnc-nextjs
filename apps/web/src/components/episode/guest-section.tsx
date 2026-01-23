"use client";

import { useId } from "react";

import { GuestCard } from "./guest-card";
import { cn } from "@/lib/utils";

import type { Guest } from "@/types";

export interface GuestSectionProps {
  /** List of guests to display */
  guests: Guest[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Section component that displays a list of episode guests
 * Returns null when no guests are provided (graceful degradation)
 */
export function GuestSection({ guests, className }: GuestSectionProps) {
  // Generate unique ID to avoid duplicate IDs if multiple sections exist
  const headingId = useId();

  // Handle empty guests array gracefully
  if (!guests || guests.length === 0) {
    return null;
  }

  return (
    <section className={cn("space-y-4", className)} aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xl font-semibold">
        Convidados
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {guests.map((guest, index) => (
          <GuestCard key={`${guest.name}-${index}`} guest={guest} />
        ))}
      </div>
    </section>
  );
}
