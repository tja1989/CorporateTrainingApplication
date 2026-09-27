import { ButtonLink } from "@/components/ui";
import { SystemState } from "@/components/system-state";
export default function NotFound() {
  return <SystemState icon="question" title="Page not found" body="This link may be out of date, or the page may no longer be available. Return home to find your learning and workspace."><ButtonLink href="/">Go home</ButtonLink></SystemState>;
}
