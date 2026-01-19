import { describe, it, expect } from "vitest";

import { formatDate, formatDuration, formatViewCount } from "./formatters";

describe("formatDuration", () => {
  it("formats hours and minutes correctly", () => {
    expect(formatDuration(5400)).toBe("1h 30min");
    expect(formatDuration(7200)).toBe("2h 0min");
    expect(formatDuration(3661)).toBe("1h 1min");
  });

  it("formats minutes only when less than an hour", () => {
    expect(formatDuration(2700)).toBe("45min");
    expect(formatDuration(60)).toBe("1min");
    expect(formatDuration(120)).toBe("2min");
  });

  it("handles zero and negative values", () => {
    expect(formatDuration(0)).toBe("0min");
    expect(formatDuration(-100)).toBe("0min");
  });

  it("handles undefined/null by returning 0min", () => {
    expect(formatDuration(undefined as unknown as number)).toBe("0min");
    expect(formatDuration(null as unknown as number)).toBe("0min");
  });

  it("rounds down partial minutes", () => {
    expect(formatDuration(90)).toBe("1min"); // 1.5 min -> 1 min
    expect(formatDuration(150)).toBe("2min"); // 2.5 min -> 2 min
  });
});

describe("formatDate", () => {
  it("formats Date object to PT-BR short format", () => {
    // Use a date with noon time to avoid timezone edge cases
    const date = new Date("2026-01-12T12:00:00Z");
    const result = formatDate(date);
    // Should contain month abbreviation and year
    expect(result).toMatch(/jan/i);
    expect(result).toMatch(/2026/);
  });

  it("formats ISO string to PT-BR short format", () => {
    const result = formatDate("2026-06-15T12:00:00Z");
    expect(result).toMatch(/jun/i);
    expect(result).toMatch(/2026/);
  });

  it("handles invalid date string gracefully", () => {
    expect(formatDate("invalid-date")).toBe("Data não disponível");
  });

  it("handles empty string gracefully", () => {
    expect(formatDate("")).toBe("Data não disponível");
  });
});

describe("formatViewCount", () => {
  it("formats thousands with K suffix", () => {
    expect(formatViewCount(1500)).toBe("1.5K");
    expect(formatViewCount("2000")).toBe("2K");
    expect(formatViewCount(999)).toBe("999");
  });

  it("formats millions with M suffix", () => {
    expect(formatViewCount(1500000)).toBe("1.5M");
    expect(formatViewCount("2000000")).toBe("2M");
  });

  it("handles small numbers without suffix", () => {
    expect(formatViewCount(500)).toBe("500");
    expect(formatViewCount("100")).toBe("100");
    expect(formatViewCount(0)).toBe("0");
  });

  it("handles invalid input gracefully", () => {
    expect(formatViewCount("invalid")).toBe("0");
    expect(formatViewCount(-100)).toBe("0");
  });
});
