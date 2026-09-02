import { requireUser } from "@/lib/auth/guard";
import { liveAvailable } from "@/lib/live/gemini";
import { PageHeader } from "@/components/ui";
import { HrVoice } from "./voice";

export const dynamic = "force-dynamic";

/** HR assistant — live voice mode (spec FR-14.3, §11). */
export default async function HrLivePage() {
  const user = await requireUser();
  return (
    <div className="animate-slide-up">
      <PageHeader title="Talk to your assistant" sub="HR policy, your courses, and what's due — spoken, with the source cited. Answers are in English." />
      <HrVoice configured={liveAvailable()} sharedDevice={user.session.shared} demoMode={process.env.DEMO_MODE === "true"} firstName={user.name.split(" ")[0] ?? ""} />
    </div>
  );
}
