"use client";
import { useState } from "react";
import { Field, Input } from "./ui";
import { CourseCover } from "./course-cover";

/** Cover URL input with a live preview; anything but an https or site-relative path previews the generated cover. */
export function CoverUrlField({ defaultValue, title, tags }: { defaultValue: string; title: string; tags: string[] }) {
  const [value, setValue] = useState(defaultValue);
  const url = value.trim();
  const previewable = /^https:\/\//i.test(url) || (url.startsWith("/") && !url.startsWith("//"));
  return (
    <div className="mb-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-start">
      <Field label="Cover image URL" hint="An HTTPS image URL or a local / path. Leave blank to use the subject illustration.">
        <Input name="coverUrl" value={value} onChange={(event) => setValue(event.target.value)} />
      </Field>
      <div>
        <p className="mb-1 text-sm font-medium text-foreground">Preview</p>
        <CourseCover key={previewable ? url : "generated"} title={title} tags={tags} coverUrl={previewable ? url : null} className="rounded-input border border-border" />
      </div>
    </div>
  );
}
