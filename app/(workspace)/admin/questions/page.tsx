import { requireRole } from "@/lib/auth/guard";
import { BankPage, type BankSearchParams } from "@/components/question-bank/bank-page";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<BankSearchParams> }) {
  return <BankPage actor={await requireRole("ADMIN")} searchParams={await searchParams} />;
}
