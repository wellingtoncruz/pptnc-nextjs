/**
 * Formats chapters for YouTube description.
 *
 * YouTube chapters format requires timestamps at the beginning of the description
 * in the format "MM:SS Title" or "HH:MM:SS Title".
 *
 * Requirements for YouTube to recognize chapters:
 * - First chapter must start at 00:00
 * - Minimum 3 chapters
 * - Each chapter must be at least 10 seconds long
 *
 * @see https://support.google.com/youtube/answer/9884579
 */

export interface Chapter {
  timestamp: string
  title: string
}

/**
 * Formats an array of chapters into YouTube-compatible format.
 *
 * @param chapters - Array of chapters with timestamp and title
 * @returns Formatted string with one chapter per line
 *
 * @example
 * formatChaptersForYouTube([
 *   { timestamp: '00:00', title: 'Intro' },
 *   { timestamp: '05:30', title: 'Topic 1' },
 * ])
 * // Returns: "00:00 Intro\n05:30 Topic 1"
 */
export function formatChaptersForYouTube(chapters: Chapter[]): string {
  return chapters
    .map(c => `${c.timestamp} ${c.title}`)
    .join('\n')
}

/**
 * Builds the final description with chapters prepended.
 *
 * If chapters exist, they are added at the beginning of the description
 * with two newlines separating them from the main content.
 *
 * @param description - Original video description
 * @param chapters - Array of chapters (optional)
 * @returns Final description with chapters at the beginning
 */
export function buildDescriptionWithChapters(
  description: string,
  chapters: Chapter[] = []
): string {
  if (chapters.length === 0) {
    return description
  }
  return `${formatChaptersForYouTube(chapters)}\n\n${description}`
}

/**
 * Guest information for formatting.
 */
export interface Guest {
  name: string
  linkedin?: string
}

/**
 * Options for building the complete YouTube description.
 */
export interface BuildYouTubeDescriptionOptions {
  /** Main video description */
  description: string
  /** Array of guests with name and linkedin */
  guests?: Guest[]
  /** Array of chapters with timestamp and title */
  chapters?: Chapter[]
  /** Footer text from podcast settings */
  youtubeFooter?: string
}

/**
 * Builds the complete YouTube description with all sections.
 *
 * Format:
 * ```
 * {description}
 *
 * Convidados
 * {guest.name}
 * {guest.linkedin}
 *
 * {chapters}
 *
 * {youtubeFooter}
 * ```
 *
 * @param options - Description building options
 * @returns Complete formatted description for YouTube
 */
export function buildCompleteYouTubeDescription(
  options: BuildYouTubeDescriptionOptions
): string {
  const { description, guests = [], chapters = [], youtubeFooter } = options
  const sections: string[] = []

  // 1. Main description
  if (description.trim()) {
    sections.push(description.trim())
  }

  // 2. Guests section
  if (guests.length > 0) {
    const guestLines = ['Convidados']
    for (const guest of guests) {
      guestLines.push(guest.name)
      if (guest.linkedin) {
        guestLines.push(guest.linkedin)
      }
      guestLines.push('') // Empty line between guests
    }
    // Remove trailing empty line
    if (guestLines[guestLines.length - 1] === '') {
      guestLines.pop()
    }
    sections.push(guestLines.join('\n'))
  }

  // 3. Chapters section
  if (chapters.length > 0) {
    sections.push(formatChaptersForYouTube(chapters))
  }

  // 4. YouTube footer
  if (youtubeFooter?.trim()) {
    sections.push(youtubeFooter.trim())
  }

  return sections.join('\n\n')
}
