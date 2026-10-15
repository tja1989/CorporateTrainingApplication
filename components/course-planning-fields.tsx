"use client";
import { useState } from "react";
import { Button, Field, Input, Select } from "./ui";
import { zoneLabel } from "@/lib/format";

export type PrerequisiteChoice = {
  id: string;
  title: string;
  available: boolean;
};
export function CoursePlanningFields({
  startDate,
  endDate,
  folderPath,
  choices,
  initialIds,
}: {
  startDate: string;
  endDate: string;
  folderPath: string;
  choices: PrerequisiteChoice[];
  initialIds: string[];
}) {
  const [selected, setSelected] = useState(initialIds),
    [candidate, setCandidate] = useState("");
  const available = choices.filter(
    (course) => course.available && !selected.includes(course.id),
  );
  return (
    <fieldset className="mb-6 border-t border-border pt-4">
      <legend className="font-semibold">Schedule and organization</legend>
      <input type="hidden" name="planningFields" value="1" />
      <p className="mb-4 text-sm text-muted">
        Dates use {zoneLabel()}. Training opens on the start date; the end date is
        a completion target. Employees can still finish overdue training.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Course start date" hint="Optional · opens at midnight">
          <Input type="date" name="startDate" defaultValue={startDate} />
        </Field>
        <Field label="Course end date" hint="Optional · includes the whole day">
          <Input type="date" name="endDate" defaultValue={endDate} />
        </Field>
      </div>
      <Field
        label="Course folder"
        hint="For example Operations/Safety/Food handling. Use up to 8 levels; leave blank for the catalog root."
      >
        <Input name="folderPath" defaultValue={folderPath} maxLength={640} />
      </Field>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">
          Prerequisite courses
        </legend>
        <p className="mb-3 text-sm text-muted">
          Employees must have completed every selected course. Earlier completed
          training still counts after renewal.
        </p>
        {selected.length ? (
          <ul className="mb-4 divide-y divide-border">
            {selected.map((id) => (
              <li
                key={id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
              >
                <input type="hidden" name="prerequisiteIds" value={id} />
                <span className="min-w-0 break-words">
                  {choices.find((course) => course.id === id)?.title ??
                    "Unavailable prerequisite"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove prerequisite ${choices.find((course) => course.id === id)?.title ?? "Unavailable prerequisite"}`}
                  onClick={() =>
                    setSelected(selected.filter((value) => value !== id))
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-muted">
            No additional course prerequisites.
          </p>
        )}
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <Field label="Add prerequisite course">
              <Select
                value={candidate}
                onChange={(event) => setCandidate(event.target.value)}
              >
                <option value="">Choose a published course</option>
                {available.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button
            className="mb-5"
            type="button"
            variant="secondary"
            disabled={!candidate}
            onClick={() => {
              if (candidate && !selected.includes(candidate))
                setSelected([...selected, candidate]);
              setCandidate("");
            }}
          >
            Add prerequisite
          </Button>
        </div>
      </fieldset>
    </fieldset>
  );
}
