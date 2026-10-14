"use client";
import { useState } from "react";
import { Icon, type IconName } from "./icons";
import { cx } from "./ui";

/** Existing course media with a consistent subject fallback, including load failures. */
export function CourseCover({ coverUrl, title, tags = [], className, priority = false, alt = "" }: { coverUrl?: string | null; title: string; tags?: string[]; className?: string; priority?: boolean; alt?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const subject = `${title} ${tags.join(" ")}`.toLowerCase();
  const icon: IconName = /safety|hygiene|compliance|security/.test(subject) ? "shield" : /customer|service|team|leadership/.test(subject) ? "users" : /practice|skill|sales/.test(subject) ? "target" : "book";
  return <div className={cx("course-cover", className)}>
    {coverUrl && failedUrl !== coverUrl ? <img src={coverUrl} alt={alt} width={640} height={360} loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setFailedUrl(coverUrl)} className="h-full w-full object-cover" /> : <div className="course-cover-fallback" aria-hidden="true"><div className="course-cover-symbol"><Icon name={icon} size={64} strokeWidth={1.25} /></div><span className="course-cover-line" /><span className="course-cover-line course-cover-line-short" /></div>}
  </div>;
}
