/**
 * @file priority.ts
 * @description Shared priority types used across domain modules (Orders, Stock, etc.).
 * Defines a normalized priority scale that all modules can reuse.
 */

/**
 * @description Normalized priority buckets for time- or risk-based evaluations.
 * - late: deadline has passed or condition is overdue.
 * - due_soon: within the next short time window (e.g. 2 hours).
 * - normal: no special urgency.
 */
export type Priority = 'late' | 'due_soon' | 'normal'