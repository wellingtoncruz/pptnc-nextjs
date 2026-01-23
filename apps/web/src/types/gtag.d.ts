/**
 * Type declarations for Google Analytics gtag.js
 * @see https://developers.google.com/analytics/devguides/collection/gtagjs
 */

declare global {
  interface Window {
    /**
     * Google Analytics gtag function
     * @param command - The command to execute (config, event, js, set)
     * @param targetId - The target (measurement ID, event name, or Date)
     * @param config - Optional configuration parameters
     */
    gtag: (
      command: "config" | "event" | "js" | "set",
      targetId: string | Date,
      config?: Record<string, unknown>
    ) => void;

    /**
     * Google Analytics data layer
     */
    dataLayer: unknown[];
  }
}

export {};
