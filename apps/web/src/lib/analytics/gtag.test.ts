import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GA_MEASUREMENT_ID, isGAEnabled, pageview, event } from "./gtag";

describe("gtag helpers", () => {
  const originalWindow = global.window;
  let mockGtag: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGtag = vi.fn();
    // @ts-expect-error - mocking window.gtag
    global.window = {
      gtag: mockGtag,
    };
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.unstubAllEnvs();
  });

  describe("GA_MEASUREMENT_ID", () => {
    it("reads from environment variable", () => {
      // The value comes from process.env at module load time
      // In test environment, it's typically undefined
      expect(GA_MEASUREMENT_ID).toBe(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
    });
  });

  describe("isGAEnabled", () => {
    it("returns false when window is undefined (SSR)", () => {
      // @ts-expect-error - simulating SSR
      global.window = undefined;

      expect(isGAEnabled()).toBe(false);
    });

    it("returns false when GA_MEASUREMENT_ID is not set", () => {
      // GA_MEASUREMENT_ID is a module-level constant, so this test
      // verifies behavior when it's falsy (which it is in test env)
      expect(isGAEnabled()).toBe(false);
    });

    it("returns false when gtag function is not available", () => {
      // @ts-expect-error - mocking window without gtag
      global.window = {};

      expect(isGAEnabled()).toBe(false);
    });
  });

  describe("pageview", () => {
    it("does nothing when GA is not enabled", () => {
      // GA is not enabled in test environment
      pageview("/test-page");

      expect(mockGtag).not.toHaveBeenCalled();
    });
  });

  describe("event", () => {
    it("does nothing when GA is not enabled", () => {
      // GA is not enabled in test environment
      event("test_event", { param: "value" });

      expect(mockGtag).not.toHaveBeenCalled();
    });
  });
});

// Separate describe block to test positive paths with mocked isGAEnabled
describe("gtag helpers - positive path", () => {
  // We need to test that pageview and event actually call gtag when enabled
  // Since GA_MEASUREMENT_ID is a module constant, we mock the module

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("pageview calls gtag with config when GA is enabled", async () => {
    // Stub the env var before importing
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123");

    // Mock window.gtag
    const mockGtag = vi.fn();
    // @ts-expect-error - mocking window
    global.window = { gtag: mockGtag };

    // Re-import the module with the new env var
    const { pageview: pv, isGAEnabled: isEnabled } = await import("./gtag");

    // Verify GA is now enabled
    expect(isEnabled()).toBe(true);

    // Call pageview
    pv("/test-page");

    // Verify gtag was called correctly
    expect(mockGtag).toHaveBeenCalledWith("config", "G-TEST123", {
      page_path: "/test-page",
    });
  });

  it("event calls gtag with event data when GA is enabled", async () => {
    // Stub the env var before importing
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST456");

    // Mock window.gtag
    const mockGtag = vi.fn();
    // @ts-expect-error - mocking window
    global.window = { gtag: mockGtag };

    // Re-import the module with the new env var
    const { event: ev, isGAEnabled: isEnabled } = await import("./gtag");

    // Verify GA is now enabled
    expect(isEnabled()).toBe(true);

    // Call event
    ev("test_action", { category: "test", value: 42 });

    // Verify gtag was called correctly
    expect(mockGtag).toHaveBeenCalledWith("event", "test_action", {
      category: "test",
      value: 42,
    });
  });

  it("isGAEnabled returns true when all conditions are met", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-VALID");

    const mockGtag = vi.fn();
    // @ts-expect-error - mocking window
    global.window = { gtag: mockGtag };

    const { isGAEnabled: isEnabled } = await import("./gtag");

    expect(isEnabled()).toBe(true);
  });
});
