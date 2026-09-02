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
      <PageHeader title="Talk to the HR assistant" sub="Speak naturally — answers are in English, with the policy cited. Same guardrails as the text chat." />
      <HrVoice configured={liveAvailable()} sharedDevice={user.session.shared} />
    </div>
  );
}
