"use client";
import { useRef, useState } from "react";
import type { CourseOutlineView } from "@/lib/lms/outline";
import { LiveCourseOutline } from "./lesson-progress";
import { Dialog } from "./dialog";
import { Button } from "./ui";
export function LessonContents({ view }: { view: CourseOutlineView }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <><Button ref={trigger} className="lesson-contents-trigger" variant="secondary" aria-expanded={open} aria-controls="lesson-contents-drawer" onClick={() => setOpen(true)}>Course contents</Button><Dialog id="lesson-contents-drawer" title="Course contents" open={open} onClose={() => setOpen(false)} returnFocusRef={trigger}><LiveCourseOutline view={view} variant="rail" /><Button variant="secondary" className="mt-4" onClick={() => setOpen(false)}>Close contents</Button></Dialog></>;
}
