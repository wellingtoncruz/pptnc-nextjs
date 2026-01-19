/**
 * Formatting utilities for displaying episode data
 */

/**
 * Formats duration in seconds to human-readable PT-BR format
 *
 * @param seconds - Duration in seconds
 * @returns Formatted string like "1h 23min" or "45min"
 *
 * @example
 * formatDuration(5400) // "1h 30min"
 * formatDuration(2700) // "45min"
 * formatDuration(0) // "0min"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) {
    return "0min";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
}

/**
 * Formats date to PT-BR short format
 *
 * @param date - Date object or ISO string
 * @returns Formatted string like "12 jan 2026"
 *
 * @example
 * formatDate(new Date("2026-01-12")) // "12 jan 2026"
 * formatDate("2026-01-12T00:00:00Z") // "12 jan 2026"
 */
export function formatDate(date: Date | string): string {
  try {
    const d = typeof date === "string" ? new Date(date) : date;

    if (isNaN(d.getTime())) {
      return "Data não disponível";
    }

    return d.toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Data não disponível";
  }
}

/**
 * Formats view count to human-readable format with K/M suffix
 *
 * @param views - View count as string or number
 * @returns Formatted string like "1.2K" or "3.5M"
 *
 * @example
 * formatViewCount("1500") // "1.5K"
 * formatViewCount(1500000) // "1.5M"
 */
export function formatViewCount(views: string | number): string {
  const count = typeof views === "string" ? parseInt(views, 10) : views;

  if (isNaN(count) || count < 0) {
    return "0";
  }

  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1).replace(".0", "")}M`;
  }

  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(".0", "")}K`;
  }

  return count.toString();
}
