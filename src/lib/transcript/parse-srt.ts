/**
 * Represents a single segment from an SRT transcript
 */
export interface TranscriptSegment {
  /** Sequence number in the SRT file */
  index: number;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** The text content of the segment */
  text: string;
}

/**
 * Parses a timestamp string in SRT format (HH:MM:SS,mmm) to seconds
 * Exported for use in chunk processing
 *
 * @param timestamp - Timestamp string like "00:01:30,500"
 * @returns Time in seconds, or 0 for invalid format
 */
export function parseSrtTimestamp(timestamp: string): number {
  if (!timestamp) return 0;

  const trimmed = timestamp.trim();
  // Strict SRT format: HH:MM:SS,mmm (1-2 digit hours, 2 digit min/sec, 3 digit ms)
  const match = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return 0;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const milliseconds = parseInt(match[4], 10);

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

/**
 * Internal alias for parseSrtTimestamp (kept for backward compatibility)
 */
function parseTimestamp(timestamp: string): number {
  return parseSrtTimestamp(timestamp);
}

/**
 * Parses SRT (SubRip Subtitle) formatted content into transcript segments
 *
 * SRT Format:
 * ```
 * 1
 * 00:00:00,000 --> 00:00:05,500
 * Text content here
 *
 * 2
 * 00:00:05,500 --> 00:00:12,000
 * More text content
 * ```
 *
 * @param srtContent - The raw SRT file content
 * @returns Array of parsed transcript segments
 */
export function parseSrt(srtContent: string): TranscriptSegment[] {
  if (!srtContent || typeof srtContent !== "string") {
    return [];
  }

  const trimmed = srtContent.trim();
  if (!trimmed) {
    return [];
  }

  const segments: TranscriptSegment[] = [];

  // Split by double newline to get individual segments
  // Handle both \n\n and \r\n\r\n
  const blocks = trimmed.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;

    // First line should be the index number
    const index = parseInt(lines[0].trim(), 10);
    if (isNaN(index)) continue;

    // Second line should be the timestamp range
    const timestampLine = lines[1].trim();
    const timestampMatch = timestampLine.match(
      /(\d+:\d+:\d+,\d+)\s*-->\s*(\d+:\d+:\d+,\d+)/
    );
    if (!timestampMatch) continue;

    const startTime = parseTimestamp(timestampMatch[1]);
    const endTime = parseTimestamp(timestampMatch[2]);

    // Remaining lines are the text content
    const text = lines
      .slice(2)
      .join("\n")
      .trim();

    if (text) {
      segments.push({
        index,
        startTime,
        endTime,
        text,
      });
    }
  }

  return segments;
}

/**
 * Formats a time in seconds to a readable MM:SS format
 * For timestamps longer than an hour, displays as MM:SS where MM can exceed 60
 *
 * @param seconds - Time in seconds
 * @returns Formatted string like "1:05" or "90:45"
 */
export function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Groups transcript segments into paragraphs based on time gaps
 * Segments with gaps > 3 seconds or ending with sentence punctuation
 * are considered paragraph breaks
 *
 * @param segments - Array of transcript segments
 * @returns Array of paragraph strings
 */
export function groupSegmentsIntoParagraphs(
  segments: TranscriptSegment[]
): string[] {
  // Reuse the timestamp-preserving function and extract just the text
  return groupSegmentsIntoParagraphsWithTimestamps(segments).map((p) => p.text);
}

/**
 * Represents a paragraph with its start timestamp
 */
export interface TranscriptParagraph {
  /** Start time of the paragraph in seconds */
  startTime: number;
  /** The paragraph text content */
  text: string;
}

/**
 * Groups transcript segments into paragraphs while preserving timestamps
 * Similar to groupSegmentsIntoParagraphs but includes the start time
 * of the first segment in each paragraph
 *
 * @param segments - Array of transcript segments
 * @returns Array of paragraphs with timestamps
 */
export function groupSegmentsIntoParagraphsWithTimestamps(
  segments: TranscriptSegment[]
): TranscriptParagraph[] {
  if (segments.length === 0) return [];

  const paragraphs: TranscriptParagraph[] = [];
  let currentParagraph: string[] = [];
  let paragraphStartTime = segments[0].startTime;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];

    currentParagraph.push(segment.text);

    const endsWithSentence = /[.!?]$/.test(segment.text.trim());
    const hasTimeGap = nextSegment
      ? nextSegment.startTime - segment.endTime > 3
      : false;
    const isLastSegment = !nextSegment;

    if (endsWithSentence || hasTimeGap || isLastSegment) {
      paragraphs.push({
        startTime: paragraphStartTime,
        text: currentParagraph.join(" "),
      });
      currentParagraph = [];
      // Next paragraph starts at the next segment's time
      if (nextSegment) {
        paragraphStartTime = nextSegment.startTime;
      }
    }
  }

  if (currentParagraph.length > 0) {
    paragraphs.push({
      startTime: paragraphStartTime,
      text: currentParagraph.join(" "),
    });
  }

  return paragraphs;
}
