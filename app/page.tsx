import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { workspaceHome } from "@/lib/auth/roles";

export default async function RootPage() {
  const user = await requireUser();
  redirect(workspaceHome(user.session.workspace));
}
