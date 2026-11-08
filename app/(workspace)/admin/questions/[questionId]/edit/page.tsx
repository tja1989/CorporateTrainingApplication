import { requireRole } from "@/lib/auth/guard";
import { EditQuestionPage } from "@/components/question-bank/bank-page";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ questionId: string }> }) {
  return <EditQuestionPage actor={await requireRole("ADMIN")} questionId={(await params).questionId} />;
}
