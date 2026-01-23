import { describe, it, expect } from "vitest";

import {
  parseSrt,
  formatTimestamp,
  parseSrtTimestamp,
  groupSegmentsIntoParagraphs,
  groupSegmentsIntoParagraphsWithTimestamps,
  type TranscriptSegment,
} from "./parse-srt";

describe("parseSrt", () => {
  it("parses valid SRT content into segments", () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,500
Olá, bem-vindos ao PPT Não Compila!

2
00:00:05,500 --> 00:00:12,000
Hoje vamos falar sobre microsserviços.`;

    const result = parseSrt(srtContent);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      index: 1,
      startTime: 0,
      endTime: 5.5,
      text: "Olá, bem-vindos ao PPT Não Compila!",
    });
    expect(result[1]).toEqual({
      index: 2,
      startTime: 5.5,
      endTime: 12,
      text: "Hoje vamos falar sobre microsserviços.",
    });
  });

  it("handles multi-line text in a segment", () => {
    const srtContent = `1
00:00:00,000 --> 00:00:10,000
Esta é a primeira linha.
Esta é a segunda linha.
E esta é a terceira.`;

    const result = parseSrt(srtContent);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(
      "Esta é a primeira linha.\nEsta é a segunda linha.\nE esta é a terceira."
    );
  });

  it("returns empty array for empty input", () => {
    expect(parseSrt("")).toEqual([]);
    expect(parseSrt("   ")).toEqual([]);
  });

  it("returns empty array for null or undefined input", () => {
    expect(parseSrt(null as unknown as string)).toEqual([]);
    expect(parseSrt(undefined as unknown as string)).toEqual([]);
  });

  it("skips malformed segments gracefully", () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,000
Valid segment

invalid
no timestamp here
garbage

2
00:00:10,000 --> 00:00:15,000
Another valid segment`;

    const result = parseSrt(srtContent);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Valid segment");
    expect(result[1].text).toBe("Another valid segment");
  });

  it("parses timestamps with hours correctly", () => {
    const srtContent = `1
01:30:45,500 --> 02:15:30,250
Long episode segment`;

    const result = parseSrt(srtContent);

    expect(result[0].startTime).toBe(5445.5); // 1h30m45.5s = 5445.5s
    expect(result[0].endTime).toBe(8130.25); // 2h15m30.25s = 8130.25s
  });

  it("handles segments without trailing newline", () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,000
Single segment without trailing newline`;

    const result = parseSrt(srtContent);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Single segment without trailing newline");
  });

  it("trims whitespace from text", () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,000
   Text with surrounding whitespace   `;

    const result = parseSrt(srtContent);

    expect(result[0].text).toBe("Text with surrounding whitespace");
  });
});

describe("formatTimestamp", () => {
  it("formats seconds into MM:SS format", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3661)).toBe("61:01");
  });

  it("handles decimal seconds by rounding down", () => {
    expect(formatTimestamp(5.7)).toBe("0:05");
    expect(formatTimestamp(65.999)).toBe("1:05");
  });

  it("handles large values correctly", () => {
    expect(formatTimestamp(7200)).toBe("120:00"); // 2 hours
    expect(formatTimestamp(5445.5)).toBe("90:45"); // 1h30m45.5s
  });
});

describe("groupSegmentsIntoParagraphs", () => {
  it("returns empty array for empty input", () => {
    expect(groupSegmentsIntoParagraphs([])).toEqual([]);
  });

  it("groups segments by sentence ending punctuation", () => {
    const segments: TranscriptSegment[] = [
      { index: 1, startTime: 0, endTime: 5, text: "First sentence." },
      { index: 2, startTime: 5, endTime: 10, text: "Second sentence." },
    ];

    const result = groupSegmentsIntoParagraphs(segments);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe("First sentence.");
    expect(result[1]).toBe("Second sentence.");
  });

  it("groups segments by time gaps greater than 3 seconds", () => {
    const segments: TranscriptSegment[] = [
      { index: 1, startTime: 0, endTime: 5, text: "Part one" },
      { index: 2, startTime: 10, endTime: 15, text: "Part two after gap" },
    ];

    const result = groupSegmentsIntoParagraphs(segments);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Part one");
    expect(result[1]).toBe("Part two after gap");
  });

  it("joins continuous segments into single paragraph", () => {
    const segments: TranscriptSegment[] = [
      { index: 1, startTime: 0, endTime: 3, text: "This is" },
      { index: 2, startTime: 3, endTime: 6, text: "a continuous" },
      { index: 3, startTime: 6, endTime: 9, text: "sentence." },
    ];

    const result = groupSegmentsIntoParagraphs(segments);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe("This is a continuous sentence.");
  });
});

describe("parseSrtTimestamp", () => {
  it("parses HH:MM:SS,mmm format correctly", () => {
    expect(parseSrtTimestamp("00:00:15,730")).toBe(15.73);
    expect(parseSrtTimestamp("00:01:30,500")).toBe(90.5);
    expect(parseSrtTimestamp("01:30:45,250")).toBe(5445.25);
  });

  it("handles zero values", () => {
    expect(parseSrtTimestamp("00:00:00,000")).toBe(0);
  });

  it("handles edge cases with max values", () => {
    expect(parseSrtTimestamp("23:59:59,999")).toBe(86399.999);
  });

  it("returns 0 for invalid format", () => {
    expect(parseSrtTimestamp("invalid")).toBe(0);
    expect(parseSrtTimestamp("12:34")).toBe(0);
    expect(parseSrtTimestamp("")).toBe(0);
  });
});

describe("groupSegmentsIntoParagraphsWithTimestamps", () => {
  it("returns empty array for empty input", () => {
    expect(groupSegmentsIntoParagraphsWithTimestamps([])).toEqual([]);
  });

  it("preserves start time of first segment in each paragraph", () => {
    const segments: TranscriptSegment[] = [
      { index: 1, startTime: 0, endTime: 5, text: "First sentence." },
      { index: 2, startTime: 10, endTime: 15, text: "Second sentence." },
    ];

    const result = groupSegmentsIntoParagraphsWithTimestamps(segments);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ startTime: 0, text: "First sentence." });
    expect(result[1]).toEqual({ startTime: 10, text: "Second sentence." });
  });

  it("uses first segment time for joined paragraphs", () => {
    const segments: TranscriptSegment[] = [
      { index: 1, startTime: 5, endTime: 8, text: "This is" },
      { index: 2, startTime: 8, endTime: 11, text: "a continuous" },
      { index: 3, startTime: 11, endTime: 14, text: "sentence." },
    ];

    const result = groupSegmentsIntoParagraphsWithTimestamps(segments);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      startTime: 5,
      text: "This is a continuous sentence.",
    });
  });

  it("creates new paragraph after sentence ending", () => {
    const segments: TranscriptSegment[] = [
      { index: 1, startTime: 0, endTime: 5, text: "End sentence." },
      { index: 2, startTime: 5, endTime: 10, text: "New paragraph." },
    ];

    const result = groupSegmentsIntoParagraphsWithTimestamps(segments);

    expect(result).toHaveLength(2);
    expect(result[0].startTime).toBe(0);
    expect(result[1].startTime).toBe(5);
  });

  it("creates new paragraph after time gap", () => {
    const segments: TranscriptSegment[] = [
      { index: 1, startTime: 0, endTime: 5, text: "Before gap" },
      { index: 2, startTime: 10, endTime: 15, text: "After gap" },
    ];

    const result = groupSegmentsIntoParagraphsWithTimestamps(segments);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ startTime: 0, text: "Before gap" });
    expect(result[1]).toEqual({ startTime: 10, text: "After gap" });
  });

  it("handles question and exclamation marks as sentence endings", () => {
    const segments: TranscriptSegment[] = [
      { index: 1, startTime: 0, endTime: 5, text: "Is this a question?" },
      { index: 2, startTime: 5, endTime: 10, text: "Yes it is!" },
      { index: 3, startTime: 10, endTime: 15, text: "More text." },
    ];

    const result = groupSegmentsIntoParagraphsWithTimestamps(segments);

    expect(result).toHaveLength(3);
    expect(result[0].startTime).toBe(0);
    expect(result[1].startTime).toBe(5);
    expect(result[2].startTime).toBe(10);
  });
});
