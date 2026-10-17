"use client";
import { useState, type ReactNode } from "react";
import { courseArt, type CoverPattern, type CoverSubject } from "@/lib/course-art";
import { cx } from "./ui";

/* White line drawings on a 160×90 canvas, centred so any crop keeps the subject. */
const ILLUSTRATION: Record<CoverSubject, ReactNode> = {
  food: <><path d="M80 22c-11 15-18 25-18 34a18 18 0 0 0 36 0c0-9-7-19-18-34z" /><path d="m72 58 6 6 11-12" /></>,
  fire: <path d="M80 20c4 12 17 18 17 35a17 17 0 0 1-34 0c0-8 4-14 9-19 1 7 4 10 8 11-2-10-4-18 0-27z" />,
  safety: <><path d="M80 20l22 8v15c0 15-10 25-22 30-12-5-22-15-22-30V28z" /><path d="m71 47 6 6 12-13" /></>,
  cash: <><rect x="54" y="28" width="52" height="34" rx="6" /><path d="M54 39h52" /><path d="M63 52h12" /></>,
  service: <><path d="M56 26h30a8 8 0 0 1 8 8v8a8 8 0 0 1-8 8H68l-8 7v-7h-4a8 8 0 0 1-8-8v-8a8 8 0 0 1 8-8z" /><path d="M98 44h6a8 8 0 0 1 8 8v6a8 8 0 0 1-8 8h-2v6l-7-6H86a8 8 0 0 1-8-8" /></>,
  learning: <><path d="M80 31c-8-6-18-7-27-5v35c9-2 19-1 27 5 8-6 18-7 27-5V26c-9-2-19-1-27 5z" /><path d="M80 31v35" /></>,
};

/* Soft white background shapes, kept clear of the centred illustration. */
const PATTERN: Record<CoverPattern, ReactNode> = {
  0: <g fill="#FFFFFF" fillOpacity="0.1"><circle cx="22" cy="18" r="10" /><circle cx="140" cy="24" r="16" /><circle cx="132" cy="78" r="8" /><circle cx="30" cy="74" r="14" /></g>,
  1: <g fill="none" stroke="#FFFFFF" strokeOpacity="0.12" strokeWidth="6"><circle cx="148" cy="88" r="26" /><circle cx="148" cy="88" r="44" /><circle cx="8" cy="4" r="20" /></g>,
  2: <g fill="#FFFFFF" fillOpacity="0.08"><path d="M-10 70 60-10h18L8 70z" /><path d="M96 100 176 20v18l-62 62z" /><circle cx="140" cy="16" r="6" /></g>,
};

/** Existing course media, or a generated cover: a colour field with a subject illustration. */
export function CourseCover({ coverUrl, title, tags = [], className, priority = false, alt = "" }: { coverUrl?: string | null; title: string; tags?: string[]; className?: string; priority?: boolean; alt?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { field, subject, pattern } = courseArt(title, tags);
  return <div className={cx("course-cover", className)}>
    {coverUrl && failedUrl !== coverUrl
      ? <img src={coverUrl} alt={alt} width={640} height={360} loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setFailedUrl(coverUrl)} className="h-full w-full object-cover" />
      : <div className={cx("course-cover-fallback", `cover-field-${field}`)} aria-hidden="true">
          <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="course-cover-art">
            {PATTERN[pattern]}
            <g fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{ILLUSTRATION[subject]}</g>
          </svg>
        </div>}
  </div>;
}
