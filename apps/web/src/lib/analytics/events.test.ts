import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the gtag module before importing events
vi.mock("./gtag", () => ({
  event: vi.fn(),
  isGAEnabled: vi.fn(),
}));

// Mock formatTimestamp from transcript module
vi.mock("@/lib/transcript", () => ({
  formatTimestamp: (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  },
}));

import { trackTimestampClick } from "./events";
import { event as mockEvent, isGAEnabled as mockIsGAEnabled } from "./gtag";

describe("trackTimestampClick", () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset navigator.doNotTrack
    Object.defineProperty(global, "navigator", {
      value: { doNotTrack: null },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it("sends event with correct parameters when GA is enabled", () => {
    vi.mocked(mockIsGAEnabled).mockReturnValue(true);

    trackTimestampClick("abc123", 754, "transcript");

    expect(mockEvent).toHaveBeenCalledWith("timestamp_click", {
      episode_id: "abc123",
      timestamp_seconds: 754,
      timestamp_formatted: "12:34",
      click_source: "transcript",
    });
  });

  it("formats timestamp correctly for various seconds values", () => {
    vi.mocked(mockIsGAEnabled).mockReturnValue(true);

    // Test 0 seconds
    trackTimestampClick("ep1", 0, "transcript");
    expect(mockEvent).toHaveBeenLastCalledWith("timestamp_click", {
      episode_id: "ep1",
      timestamp_seconds: 0,
      timestamp_formatted: "0:00",
      click_source: "transcript",
    });

    // Test 65 seconds (1:05)
    trackTimestampClick("ep1", 65, "transcript");
    expect(mockEvent).toHaveBeenLastCalledWith("timestamp_click", {
      episode_id: "ep1",
      timestamp_seconds: 65,
      timestamp_formatted: "1:05",
      click_source: "transcript",
    });

    // Test 3661 seconds (61:01)
    trackTimestampClick("ep1", 3661, "transcript");
    expect(mockEvent).toHaveBeenLastCalledWith("timestamp_click", {
      episode_id: "ep1",
      timestamp_seconds: 3661,
      timestamp_formatted: "61:01",
      click_source: "transcript",
    });
  });

  it("uses default source of transcript when not specified", () => {
    vi.mocked(mockIsGAEnabled).mockReturnValue(true);

    trackTimestampClick("abc123", 100);

    expect(mockEvent).toHaveBeenCalledWith("timestamp_click", {
      episode_id: "abc123",
      timestamp_seconds: 100,
      timestamp_formatted: "1:40",
      click_source: "transcript",
    });
  });

  it("supports different source values", () => {
    vi.mocked(mockIsGAEnabled).mockReturnValue(true);

    trackTimestampClick("ep1", 60, "related");
    expect(mockEvent).toHaveBeenLastCalledWith(
      "timestamp_click",
      expect.objectContaining({ click_source: "related" })
    );

    trackTimestampClick("ep1", 60, "share");
    expect(mockEvent).toHaveBeenLastCalledWith(
      "timestamp_click",
      expect.objectContaining({ click_source: "share" })
    );
  });

  it("does not send event when GA is not enabled", () => {
    vi.mocked(mockIsGAEnabled).mockReturnValue(false);

    trackTimestampClick("abc123", 754, "transcript");

    expect(mockEvent).not.toHaveBeenCalled();
  });

  it("respects Do Not Track browser setting", () => {
    vi.mocked(mockIsGAEnabled).mockReturnValue(true);
    Object.defineProperty(global, "navigator", {
      value: { doNotTrack: "1" },
      writable: true,
      configurable: true,
    });

    trackTimestampClick("abc123", 754, "transcript");

    expect(mockEvent).not.toHaveBeenCalled();
  });

  it("sends event when Do Not Track is not set", () => {
    vi.mocked(mockIsGAEnabled).mockReturnValue(true);
    Object.defineProperty(global, "navigator", {
      value: { doNotTrack: null },
      writable: true,
      configurable: true,
    });

    trackTimestampClick("abc123", 754, "transcript");

    expect(mockEvent).toHaveBeenCalled();
  });

  it("sends event when Do Not Track is explicitly disabled", () => {
    vi.mocked(mockIsGAEnabled).mockReturnValue(true);
    Object.defineProperty(global, "navigator", {
      value: { doNotTrack: "0" },
      writable: true,
      configurable: true,
    });

    trackTimestampClick("abc123", 754, "transcript");

    expect(mockEvent).toHaveBeenCalled();
  });

  it("handles navigator being undefined (SSR) and proceeds to send event", () => {
    vi.mocked(mockIsGAEnabled).mockReturnValue(true);
    // @ts-expect-error - simulating SSR
    global.navigator = undefined;

    // Should not throw and should proceed to GA check
    expect(() => trackTimestampClick("abc123", 754, "transcript")).not.toThrow();

    // When navigator is undefined, doNotTrack check returns false (not enabled)
    // So it should proceed to call the event
    expect(mockEvent).toHaveBeenCalledWith("timestamp_click", {
      episode_id: "abc123",
      timestamp_seconds: 754,
      timestamp_formatted: "12:34",
      click_source: "transcript",
    });
  });
});
