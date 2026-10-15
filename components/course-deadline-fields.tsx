"use client";
import { useState } from "react";
import { Field, Input } from "./ui";
export function CourseDeadlineFields() {
  const [useDates, setUseDates] = useState(false);
  return (
    <fieldset className="mb-5">
      <legend className="mb-2 text-sm font-medium">Assignment deadline</legend>
      <label className="touch-target mb-2 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="useCourseEndDates"
          checked={useDates}
          onChange={(event) => setUseDates(event.target.checked)}
        />
        Use course end dates
      </label>
      <p className="mb-3 text-sm text-muted">
        Course dates use Asia/Dubai. A course without an end date has no
        deadline when this option is selected. Existing assignments keep their
        deadlines.
      </p>
      <div hidden={useDates}>
        <Field
          label="Due in days"
          hint="Override calculated in the employee’s store timezone. The deadline must be after the course opens."
        >
          <Input
            name="dueDays"
            type="number"
            min={1}
            max={3650}
            defaultValue={14}
            required={!useDates}
            disabled={useDates}
          />
        </Field>
      </div>
    </fieldset>
  );
}
