/**
 * Google Analytics gtag.js helper functions
 * @see https://developers.google.com/analytics/devguides/collection/gtagjs
 */

/**
 * Google Analytics 4 Measurement ID from environment variable
 * This is a public ID that can be safely exposed in client-side code
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Checks if Google Analytics is enabled and ready to use
 * Returns false during SSR, when GA is not configured, or when gtag is not loaded
 */
export function isGAEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    !!GA_MEASUREMENT_ID &&
    typeof window.gtag === "function"
  );
}

/**
 * Tracks a pageview in Google Analytics
 * @param url - The URL path to track
 */
export function pageview(url: string): void {
  if (!isGAEnabled()) return;

  window.gtag("config", GA_MEASUREMENT_ID!, {
    page_path: url,
  });
}

/**
 * Sends a custom event to Google Analytics
 * @param action - The event action name
 * @param params - Additional event parameters
 */
export function event(
  action: string,
  params: Record<string, string | number | boolean>
): void {
  if (!isGAEnabled()) return;

  window.gtag("event", action, params);
}
