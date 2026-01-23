import { describe, it, expect } from "vitest";
import { cn, buildChapterDeepLink, escapeHtml } from "./utils";

describe("cn", () => {
  it("merges class names correctly", () => {
    const result = cn("px-2 py-1", "px-4");
    expect(result).toBe("py-1 px-4");
  });

  it("handles conditional classes", () => {
    const isActive = true;
    const result = cn("base", isActive && "active");
    expect(result).toBe("base active");
  });

  it("handles undefined values", () => {
    const result = cn("base", undefined, "extra");
    expect(result).toBe("base extra");
  });
});

describe("buildChapterDeepLink", () => {
  it("builds deep link with timestamp and tab parameters", () => {
    const result = buildChapterDeepLink("https://pptnc.com.br/episodios/test-episode", 754);
    expect(result).toBe("https://pptnc.com.br/episodios/test-episode?t=754&tab=capitulos");
  });

  it("floors decimal timestamps to integers", () => {
    const result = buildChapterDeepLink("https://pptnc.com.br/episodios/test-episode", 123.456);
    expect(result).toBe("https://pptnc.com.br/episodios/test-episode?t=123&tab=capitulos");
  });

  it("handles zero timestamp", () => {
    const result = buildChapterDeepLink("https://pptnc.com.br/episodios/test-episode", 0);
    expect(result).toBe("https://pptnc.com.br/episodios/test-episode?t=0&tab=capitulos");
  });

  it("preserves existing query params", () => {
    const result = buildChapterDeepLink("https://pptnc.com.br/episodios/test-episode?foo=bar", 300);
    expect(result).toBe("https://pptnc.com.br/episodios/test-episode?foo=bar&t=300&tab=capitulos");
  });

  it("overwrites existing t and tab params", () => {
    const result = buildChapterDeepLink("https://pptnc.com.br/episodios/test-episode?t=100&tab=descricao", 500);
    expect(result).toBe("https://pptnc.com.br/episodios/test-episode?t=500&tab=capitulos");
  });

  it("throws error when baseUrl is empty", () => {
    expect(() => buildChapterDeepLink("", 100)).toThrow("baseUrl is required");
  });

  it("throws error when baseUrl is invalid", () => {
    expect(() => buildChapterDeepLink("not-a-url", 100)).toThrow();
  });
});

describe("escapeHtml", () => {
  it("escapes ampersand", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes less than sign", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes greater than sign", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });

  it("escapes multiple special characters", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("returns unchanged text when no special characters", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});
