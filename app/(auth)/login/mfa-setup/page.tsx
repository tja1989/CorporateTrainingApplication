import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/guard";
import { generateTotpSecret } from "@/lib/auth/totp";
import { MfaSetupForm } from "./setup-form";
import { AuthFrame } from "@/components/auth-frame";

export default async function MfaSetupPage() {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");
  if (user.totpSecret) redirect(user.session.mfa ? "/admin" : "/login/mfa");
  const secret = generateTotpSecret();
  return <AuthFrame title="Set up two-factor authentication" description="Admin accounts require two-factor authentication. Add this setup key to your authenticator app, then enter the code it generates.">
    <div className="mb-4 break-all rounded-control bg-surface-2 p-4 font-mono text-base" aria-label="Authenticator setup key">{secret}</div>
    <p className="mb-6 text-sm text-muted">Account: <strong>welearn</strong>. Choose a time-based code (TOTP), a 30-second period, and 6 digits.</p>
    <MfaSetupForm secret={secret} />
  </AuthFrame>;
}
