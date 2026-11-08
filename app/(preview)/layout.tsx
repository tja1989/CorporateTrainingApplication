import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";

/** Learner-styled frame for authors and approvers. No learner nav: nothing here belongs to a learner's progress. */
export default async function PreviewLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "LEARNER") redirect("/home");
  return (
    <div className="min-h-dvh">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <main id="main-content" tabIndex={-1} className="lesson-shell-main">
        <div className="content-container">{children}</div>
      </main>
    </div>
  );
}
