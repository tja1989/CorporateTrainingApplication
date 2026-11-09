"use client";
import { useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { WorkspaceForm, SubmitButton, type ActionResult } from "@/components/workspace-form";
import { AUTHORED_QUESTION_TYPES, type AuthoredQuestionType } from "@/lib/courses/question-input";
import type { QuestionBody } from "@/lib/db/schema";

const OPTION_SLOTS = 5;

/** Add or edit one instructor-written question; the fields follow the chosen type. */
export function QuestionForm({
  action,
  revision,
  initial,
  submitLabel,
}: {
  action: (form: FormData) => Promise<ActionResult>;
  revision: number;
  initial?: { type: AuthoredQuestionType; body: QuestionBody };
  submitLabel: string;
}) {
  const [type, setType] = useState<AuthoredQuestionType>(initial?.type ?? "mcq_single");
  const body = initial?.body;
  const correct = new Set(body?.correct ?? []);
  const options = Array.from({ length: OPTION_SLOTS }, (_, i) => body?.options?.[i] ?? "");
  const choice = type === "mcq_single" || type === "mcq_multi";
  return (
    <WorkspaceForm action={action} className="min-w-0">
      <input type="hidden" name="revision" value={revision} />
      <Field label="Question type">
        <Select name="type" value={type} onChange={(e) => setType(e.target.value as AuthoredQuestionType)}>
          {AUTHORED_QUESTION_TYPES.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Question">
        <Textarea name="prompt" required rows={2} defaultValue={body?.prompt ?? ""} />
      </Field>
      {choice ? (
        <fieldset className="mb-4 min-w-0">
          <legend className="mb-2 text-sm font-medium">
            Answer options ({type === "mcq_single" ? "select the correct one" : "tick every correct one"})
          </legend>
          <div className="flex flex-col gap-2">
            {options.map((value, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type={type === "mcq_single" ? "radio" : "checkbox"}
                  name="correct"
                  value={i}
                  defaultChecked={initial?.type === type && correct.has(i)}
                  aria-label={`Option ${i + 1} is correct`}
                  className="size-4 shrink-0"
                />
                <Input name="options" defaultValue={value} placeholder={i < 2 ? `Option ${i + 1}` : `Option ${i + 1} (optional)`} aria-label={`Option ${i + 1}`} />
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      {type === "truefalse" ? (
        <fieldset className="mb-4 flex gap-6">
          <legend className="mb-2 text-sm font-medium">Correct answer</legend>
          {(["true", "false"] as const).map((value, i) => (
            <label key={value} className="touch-target flex items-center gap-2 text-sm">
              <input type="radio" name="correct" value={value} defaultChecked={initial?.type === "truefalse" && correct.has(i)} />
              {value === "true" ? "True" : "False"}
            </label>
          ))}
        </fieldset>
      ) : null}
      {type === "fill_blank" ? (
        <Field label="Accepted answers (one per line)">
          <Textarea name="accepted" rows={2} defaultValue={(body?.acceptedAnswers ?? []).join("\n")} />
        </Field>
      ) : null}
      <Field label="Explanation shown after the answer is revealed (optional)">
        <Textarea name="explanation" rows={2} defaultValue={body?.explanation ?? ""} />
      </Field>
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </WorkspaceForm>
  );
}
