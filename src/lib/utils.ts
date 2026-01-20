import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Builds a deep link URL for sharing a specific chapter timestamp
 * @param baseUrl - The episode page URL (must be a valid URL)
 * @param seconds - Timestamp in seconds (will be floored to integer)
 * @returns URL with ?t=seconds&tab=capitulos parameters
 * @throws Error if baseUrl is not a valid URL
 */
export function buildChapterDeepLink(baseUrl: string, seconds: number): string {
  if (!baseUrl) {
    throw new Error("baseUrl is required");
  }
  const url = new URL(baseUrl);
  url.searchParams.set("t", String(Math.floor(seconds)));
  url.searchParams.set("tab", "capitulos");
  return url.toString();
}
