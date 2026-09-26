/** Matches path-reader completion: every lesson in each earlier course. */
export function firstIncompletePrerequisite(
  links: Array<{ courseId: string; sort: number }>,
  courseId: string,
  progress: Map<string, { total: number; done: number }>,
): string | null {
  const ordered = [...links].sort((a, b) => a.sort - b.sort);
  const index = ordered.findIndex(link => link.courseId === courseId);
  if (index <= 0) return null;
  return ordered.slice(0, index).find(link => {
    const p = progress.get(link.courseId);
    return !p || p.total === 0 || p.done < p.total;
  })?.courseId ?? null;
}
