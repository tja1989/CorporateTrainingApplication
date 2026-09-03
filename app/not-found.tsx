import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md">
        <EmptyState icon="question" tone="neutral" title="Page not found" body="The link may be out of date, or you may not have access to it." action={<ButtonLink href="/">Go home</ButtonLink>} />
      </div>
    </main>
  );
}
