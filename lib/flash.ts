import { cookies } from "next/headers";

export type FlashTone = "neutral" | "success" | "warning" | "destructive";
export type Flash = { message: string; tone?: FlashTone };

const NAME = "ll_flash";

/** Call from a Server Action before revalidatePath/redirect to show a toast on the next render. */
export async function setFlash(message: string, tone: FlashTone = "success"): Promise<void> {
  const store = await cookies();
  store.set(NAME, JSON.stringify({ message, tone } satisfies Flash), {
    path: "/",
    maxAge: 30,
    sameSite: "lax",
    httpOnly: false, // cleared client-side by <ToastProvider> once shown
  });
}

/** Read (without clearing — server components cannot set cookies) the pending flash, if any. */
export async function readFlash(): Promise<Flash | null> {
  const store = await cookies();
  const raw = store.get(NAME)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Flash;
    return typeof parsed.message === "string" ? parsed : null;
  } catch {
    return null;
  }
}
