"use client";
import { useEffect, useState } from "react";
import { Field, Input } from "./ui";
import { CourseCover } from "./course-cover";

/** Cover URL input with a live preview; anything but an https or site-relative path previews the generated cover. */
export function CoverUrlField({ defaultValue, title, tags }: { defaultValue: string; title: string; tags: string[] }) {
  const [value, setValue] = useState(defaultValue);
  // The preview follows typing after a pause (or on leaving the field), not on every keystroke.
  const [previewValue, setPreviewValue] = useState(defaultValue);
  useEffect(() => {
    const timer = setTimeout(() => setPreviewValue(value), 600);
    return () => clearTimeout(timer);
  }, [value]);
  const url = previewValue.trim();
  const previewable = /^https:\/\//i.test(url) || (url.startsWith("/") && !url.startsWith("//"));
  // Wraps on the space the form actually has (zoomed, or beside a sidebar), not on the viewport width.
  return (
    <div className="flex flex-wrap items-start gap-x-4">
      <div className="min-w-0 flex-[1_1_16rem]">
        <Field label="Cover image URL" hint="An HTTPS image URL or a local / path, shown in the catalog and on the course page. Leave blank to use the subject illustration.">
          <Input name="coverUrl" value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => setPreviewValue(value)} />
        </Field>
      </div>
      <div className="mb-4 w-[160px] max-w-full">
        <p className="mb-1 text-sm font-medium text-foreground">Preview</p>
        <CourseCover key={previewable ? url : "generated"} title={title} tags={tags} coverUrl={previewable ? url : null} className="course-cover-compact rounded-input border border-border" />
      </div>
    </div>
  );
}
