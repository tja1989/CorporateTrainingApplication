import type { Actor } from "./roles";
import { trainingScope } from "./scope";
import { teamOf } from "./guard";
export async function reportScopeFor(actor: Actor, legacyTeam = false) {
  const scope = await trainingScope(actor);
  if (legacyTeam && ["ADMIN", "HR_HEAD"].includes(actor.role))
    scope.userIds = (await teamOf(actor.id)).map((person) => person.id);
  return {
    userIds: scope.userIds,
    courseIds: scope.courseIds,
    instructorView: actor.role === "INSTRUCTOR",
  };
}
