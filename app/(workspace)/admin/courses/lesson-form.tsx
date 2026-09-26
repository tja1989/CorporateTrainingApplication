"use client";
import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { WorkspaceForm } from "@/components/workspace-form";
import type { InterviewConfig } from "@/lib/db/schema";
import { addLessonAction } from "./actions";
export function InterviewFields({ cfg }: { cfg?: InterviewConfig }) {
  return <div className="grid min-w-0 gap-3 sm:grid-cols-3">
    <Field label="Questions (1–6)"><Input name="questionCount" type="number" min={1} max={6} defaultValue={cfg?.questionCount ?? 3} /></Field>
    <Field label="Pass mark %"><Input name="passPct" type="number" min={50} max={100} defaultValue={cfg?.passPct ?? 67} /></Field>
    <Field label="Max minutes (3–9)"><Input name="maxMinutes" type="number" min={3} max={9} defaultValue={cfg?.maxMinutes ?? 6} /></Field>
    <Field label="Content scope"><Select name="scope" defaultValue={cfg?.scope ?? "module"}><option value="previous">Previous lesson</option><option value="module">This module</option><option value="course">Whole course</option></Select></Field>
    <div className="sm:col-span-2"><Field label="Focus (optional)" hint="Topics the interviewer should cover"><Textarea name="focus" rows={2} defaultValue={cfg?.focus ?? ""} /></Field></div>
    <label className="touch-target flex items-center gap-3 text-sm sm:col-span-3"><input type="checkbox" name="requirePass" defaultChecked={cfg?.requirePass ?? true} />Passing is required to complete this lesson</label>
  </div>;
}
export function LessonForm({ courseId, moduleId, banks }: { courseId: string; moduleId: string; banks: { id: string; name: string }[] }) {
  const [type, setType] = useState("TEXT");
  return <WorkspaceForm action={addLessonAction.bind(null, courseId, moduleId)} className="mt-4">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Lesson type"><Select name="type" value={type} onChange={e => setType(e.target.value)}><option value="TEXT">Text</option><option value="PDF">PDF document</option><option value="VIDEO">YouTube video</option><option value="QUIZ">Quiz or exam</option><option value="INTERVIEW">Voice oral check</option></Select></Field><Field label="Lesson title"><Input name="title" required /></Field></div>
    <fieldset hidden={type !== "TEXT"} disabled={type !== "TEXT"} className="min-w-0"><Field label="Lesson content" hint="Markdown supports headings, lists and links."><Textarea name="body" rows={7} required={type === "TEXT"} /></Field></fieldset>
    <fieldset hidden={type !== "PDF"} disabled={type !== "PDF"} className="min-w-0"><Field label="PDF file URL" hint="Use a local /demo/ path or an HTTPS PDF URL."><Input name="fileUrl" required={type === "PDF"} /></Field></fieldset>
    <fieldset hidden={type !== "VIDEO"} disabled={type !== "VIDEO"} className="min-w-0"><Field label="YouTube URL or video ID" hint="The video must be public or unlisted and allow embedding."><Input name="youtubeUrl" required={type === "VIDEO"} /></Field><Field label="Transcript (SRT or VTT)" hint="Paste a transcript you have permission to use. Without it, the configured vendor fetcher is used."><Textarea name="transcript" rows={5} /></Field></fieldset>
    <fieldset hidden={type !== "QUIZ"} disabled={type !== "QUIZ"} className="min-w-0"><div className="grid gap-3 sm:grid-cols-2"><Field label="Question bank"><Select name="bankId" required={type === "QUIZ"} defaultValue=""><option value="">Choose a question bank</option>{banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field><Field label="Questions to draw"><Input name="pickN" type="number" min={1} max={100} defaultValue={5} /></Field></div><label className="touch-target flex items-center gap-3 text-sm"><input type="checkbox" name="exam" />Exam mode (feedback after submission)</label><label className="touch-target mb-4 flex items-center gap-3 text-sm"><input type="checkbox" name="integrity" />Integrity monitoring</label><p className="mb-4 text-sm text-muted">All seven question formats in the selected bank are supported. Free-text AI grades still require human review where applicable.</p></fieldset>
    <fieldset hidden={type !== "INTERVIEW"} disabled={type !== "INTERVIEW"} className="min-w-0"><InterviewFields /></fieldset>
    <Button type="submit">Add lesson</Button>
  </WorkspaceForm>;
}
