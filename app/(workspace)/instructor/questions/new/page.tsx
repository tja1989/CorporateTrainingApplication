import { requireRole } from "@/lib/auth/guard";
import { NewQuestionPage } from "@/components/question-bank/bank-page";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  return <NewQuestionPage actor={await requireRole("INSTRUCTOR")} from={(await searchParams).from} />;
}
