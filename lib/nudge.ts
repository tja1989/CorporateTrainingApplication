/** A manager can remind a team member once every 48 hours. */
export const NUDGE_WINDOW_MS = 48 * 3600_000;
export const nudgeKey = (userId: string) => `nudge:${userId}`;
export const nudgedRecently = (sentAt: Date | undefined, now = new Date()) =>
  !!sentAt && now.getTime() - sentAt.getTime() < NUDGE_WINDOW_MS;
