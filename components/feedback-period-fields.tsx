"use client";
import { useState } from "react";
import { Field, Input, Select } from "./ui";
import type { FeedbackReportParams } from "@/lib/feedback/report-options";

export function FeedbackPeriodFields({
  params,
}: {
  params: FeedbackReportParams;
}) {
  const [period, setPeriod] = useState(params.period ?? "week");
  return (
    <div className="grid gap-x-4 sm:grid-cols-3">
      <Field label="Reporting period">
        <Select
          name="period"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        >
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="custom">Custom dates</option>
        </Select>
      </Field>
      <div hidden={period !== "custom"}>
        <Field label="Start date">
          <Input
            type="date"
            name="start"
            defaultValue={params.start ?? ""}
            disabled={period !== "custom"}
            required={period === "custom"}
          />
        </Field>
      </div>
      <div hidden={period !== "custom"}>
        <Field label="Through date" hint="Includes this day">
          <Input
            type="date"
            name="end"
            defaultValue={params.end ?? ""}
            disabled={period !== "custom"}
            required={period === "custom"}
          />
        </Field>
      </div>
    </div>
  );
}
