/**
 * @file orderTableLabels.tsx
 * @description Backward-compatible barrel. The actual content now lives in
 * two focused modules:
 * - `orderStatusLabels.ts`      — plain static text (labels, option lists).
 * - `orderStatusBadgeStyles.ts` — visual decisions for badges (icons, chip
 *   tones, CSS classes) consumed by React-rendered status/urgency chips.
 * Existing imports of `./orderTableLabels` keep working unchanged; new code
 * should import directly from whichever of the two modules it needs.
 */
export * from './orderStatusLabels'
export * from './orderStatusBadgeStyles'
