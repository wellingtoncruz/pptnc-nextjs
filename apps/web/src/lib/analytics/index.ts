/**
 * Analytics module exports
 * Provides Google Analytics integration for tracking user interactions
 */

// Event tracking functions
export { trackTimestampClick, type TimestampClickSource } from "./events";

// Core GA functions (for advanced use cases)
export { GA_MEASUREMENT_ID, isGAEnabled, pageview, event } from "./gtag";
