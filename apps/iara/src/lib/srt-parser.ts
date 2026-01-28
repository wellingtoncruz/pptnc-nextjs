/**
 * SRT (SubRip Subtitle) parser.
 *
 * Converts SRT subtitle format to plain text, removing timestamps
 * and sequence numbers while preserving paragraph structure.
 *
 * SRT Format:
 * ```
 * 1
 * 00:00:00,000 --> 00:00:02,500
 * First line of text
 *
 * 2
 * 00:00:02,500 --> 00:00:05,000
 * Second line of text
 * with continuation
 * ```
 *
 * @see https://en.wikipedia.org/wiki/SubRip
 */

/**
 * Parses SRT content to plain text.
 *
 * Algorithm:
 * 1. Split content into blocks (separated by double newlines)
 * 2. For each block:
 *    - Skip the sequence number (first line)
 *    - Skip the timestamp line (second line)
 *    - Join remaining lines with space
 * 3. Join blocks with double newlines (paragraph separation)
 *
 * @param srt - SRT subtitle content
 * @returns Plain text with paragraphs separated by double newlines
 *
 * @example
 * const srt = `1
 * 00:00:00,000 --> 00:00:02,500
 * Hello world
 *
 * 2
 * 00:00:02,500 --> 00:00:05,000
 * Second line`
 *
 * parseSrtToText(srt) // "Hello world\n\nSecond line"
 */
export function parseSrtToText(srt: string): string {
  if (!srt || typeof srt !== 'string') {
    return ''
  }

  // Normalize line endings
  const normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Split into blocks (separated by one or more blank lines)
  const blocks = normalized.split(/\n\n+/)

  const textBlocks: string[] = []

  for (const block of blocks) {
    const lines = block.trim().split('\n')

    // Skip empty blocks
    if (lines.length < 3) {
      continue
    }

    // Line 0: sequence number (skip)
    // Line 1: timestamp (skip)
    // Lines 2+: actual subtitle text

    // Validate timestamp line format (00:00:00,000 --> 00:00:00,000)
    const timestampPattern = /^\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/
    if (!timestampPattern.test(lines[1])) {
      // Not a valid SRT block, skip
      continue
    }

    // Get text lines (everything after timestamp)
    const textLines = lines.slice(2)

    // Join text lines with space (continuation within same subtitle)
    const text = textLines.join(' ').trim()

    if (text) {
      textBlocks.push(text)
    }
  }

  // Join blocks with double newlines (paragraph separation)
  return textBlocks.join('\n\n')
}

/**
 * Checks if content appears to be valid SRT format.
 *
 * @param content - Content to check
 * @returns true if content looks like SRT format
 */
export function isValidSrt(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false
  }

  // Check for basic SRT structure: number, timestamp, text
  const timestampPattern = /\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/
  return timestampPattern.test(content)
}
