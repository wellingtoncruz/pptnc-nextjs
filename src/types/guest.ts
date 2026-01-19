/**
 * Represents a guest who appeared on a podcast episode
 */
export interface Guest {
  /** Full name of the guest */
  name: string;
  /** Guest's role/title at the time of the episode */
  role?: string;
  /** Company or organization the guest was associated with */
  company?: string;
  /** Brief biography or description */
  bio?: string;
  /** URL to the guest's photo */
  photoUrl?: string;
  /** Social media and website links */
  socialLinks?: GuestSocialLinks;
}

/**
 * Guest data as stored in Datastore
 */
export interface GuestEntity {
  /** Full name of the guest */
  name: string;
  /** Guest's role/title */
  role?: string;
  /** Company or organization */
  company?: string;
}

/**
 * Social media and website links for a guest
 */
export interface GuestSocialLinks {
  /** Twitter/X profile URL */
  twitter?: string;
  /** LinkedIn profile URL */
  linkedin?: string;
  /** Personal or professional website URL */
  website?: string;
}
