import { requireUser } from "@/lib/auth/guard";
import { LearnerShell } from "@/components/shell";

export default async function LearnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <LearnerShell user={user}>{children}</LearnerShell>;
}
