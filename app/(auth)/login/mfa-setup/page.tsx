import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { generateTotpSecret } from "@/lib/auth/totp";
import { MfaSetupForm } from "./setup-form";
import { Card } from "@/components/ui";

export default async function MfaSetupPage() {
  const session = await readSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  const secret = generateTotpSecret();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="animate-enter w-full max-w-md p-6">
        <h1 className="mb-1 text-xl font-medium">Set up two-factor</h1>
        <p className="mb-4 text-sm text-muted">
          Admin accounts require an authenticator app (spec FR-1.4). Add this secret to your app, then confirm with a code.
        </p>
        <div className="mb-4 rounded-control bg-surface-2 p-3 font-mono text-sm break-all" aria-label="TOTP secret">
          {secret}
        </div>
        <p className="mb-4 text-xs text-muted">
          Or add manually: account <code>LuLu Learn</code>, type TOTP, 30-second period, 6 digits.
        </p>
        <MfaSetupForm secret={secret} />
      </Card>
    </main>
  );
}
