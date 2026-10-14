/**
 * Motion tokens — the JS mirror of the CSS custom properties in app/globals.css.
 * `tests/design-guardrails.test.ts` asserts the two stay identical.
 *
 *  fast  150ms — press, hover, colour, tab indicator
 *  base  200ms — dialogs, toasts, tab feedback
 *  slow  250ms — longer state feedback
 */
export const DUR = { fast: 0.15, base: 0.2, slow: 0.25 } as const;

/** Entries and exits. */
export const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
/** On-screen movement (things that stay visible while they move). */
export const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1];

/** Rail/list stagger step (spec §10.5), capped at 8 items by <Stagger>. */
export const STAGGER = 0.04;
