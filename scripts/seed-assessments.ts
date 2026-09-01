/** Assessment seed — populated in M3 (question banks, quizzes, drill, staged attempts). */
export async function seedAssessments(_opts: {
  courseIds: { customerService: string; foodSafety: string; fire: string; pos: string };
  learnerIds: { farhan: string; meera: string };
}): Promise<void> {
  // M3 fills this in.
}
