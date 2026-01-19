/**
 * Represents a topic/category that episodes can be tagged with
 */
export interface Topic {
  /** Unique identifier for the topic */
  id: string;
  /** Display name of the topic */
  name: string;
  /** URL-friendly slug for the topic */
  slug: string;
  /** Number of episodes associated with this topic */
  episodeCount: number;
}
