import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";

export default async function RootPage() {
  const session = await readSession();
  if (!session) redirect("/login");
  redirect(session.workspace === "learner" ? "/home" : session.workspace === "manager" ? "/team" : "/admin");
}
