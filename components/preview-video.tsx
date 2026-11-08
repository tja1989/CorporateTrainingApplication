import { Card } from "@/components/ui";
import { statusLabel } from "@/lib/status";

type PreviewVideoRow = { youtubeId: string; ingestionStatus: string; failureReason: string | null };

/** The video as a learner would see it, without the tutor, transcript or watch tracking. */
export function PreviewVideo({ title, video }: { title: string; video: PreviewVideoRow | null }) {
  if (!video) {
    return (
      <Card className="mb-6 max-w-3xl p-6">
        <p className="text-sm text-muted">Video not configured yet.</p>
      </Card>
    );
  }
  if (video.ingestionStatus !== "READY") {
    return (
      <Card className="mb-6 max-w-3xl p-6">
        <p className="text-sm text-muted">
          This video is still being prepared ({statusLabel(video.ingestionStatus).label.toLowerCase()}
          {video.failureReason ? ` — ${video.failureReason}` : ""}). Check back shortly.
        </p>
      </Card>
    );
  }
  return (
    <div className="mb-6 aspect-video w-full max-w-3xl overflow-hidden rounded-card border border-border bg-black">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.youtubeId)}`}
        title={`${title} (video preview)`}
        allow="encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        className="size-full"
      />
    </div>
  );
}
