/**
 * Wizard phase components.
 *
 * Each phase has its own component following the pattern:
 * - phase-N-*.tsx - Phase component implementation
 *
 * Phase types:
 * - Type 1 (Reprocessable): Phases 5-7 - can be reprocessed with prompt override
 * - Type 2 (Immutable): Phases 1-4 - run once, cannot be reprocessed
 * - Final: Phase 8 - no LLM, just YouTube API call
 */

export { Phase1Critique } from './phase-1-critique'
