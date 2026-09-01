import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { WorkspaceShell } from "@/components/shell";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "LEARNER") redirect("/home");
  if (user.session.workspace === "learner") redirect("/home");
  return <WorkspaceShell user={user}>{children}</WorkspaceShell>;
}
