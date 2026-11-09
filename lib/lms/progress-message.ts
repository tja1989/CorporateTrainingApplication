/** A short encouraging status line for course progress, like "You're halfway there!". */
export function progressMessage(done: number, total: number): string {
  if (total === 0) return "Lessons are being prepared.";
  if (done >= total) return "All lessons complete. Well done!";
  if (done === 0) return "Start your first lesson to get going.";
  const share = done / total;
  if (share < 0.5) return "Good start! Keep going.";
  if (share < 0.75) return "You're halfway there! Keep it up!";
  return "Almost there. Just a few lessons left.";
}
