"use client";

import { useState } from "react";
import { AiSurface, Button, Card, Input, Skeleton } from "@/components/ui";

type AskResult = {
  plan: { report: string; filters: Record<string, unknown>; explanation: string };
  narration: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  mock: boolean;
};

export function AskReports() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);

  async function ask(question: string) {
    if (!question.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/reports/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (res.ok) setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-3xl p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="flex gap-2"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Ask the data — e.g. "who in Khalidiyah is overdue on Food Safety?"'
          aria-label="Ask reports"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={loading || !q.trim()}>Ask</Button>
      </form>

      {loading ? <Skeleton delayed className="mt-3 h-[64px] w-full" /> : null}

      {result ? (
        <div className="animate-enter mt-3">
          <AiSurface variant="block" className="mb-3" mock={result.mock}>
            {result.narration}
          </AiSurface>
          <div className="mb-2 overflow-x-auto rounded-control border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {result.columns.map((c) => (
                    <th key={c} className="px-3 py-1 text-start font-medium text-muted">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 15).map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-1">{cell}</td>
                    ))}
                  </tr>
                ))}
                {result.rows.length === 0 ? (
                  <tr><td colSpan={result.columns.length} className="px-3 py-3 text-center text-muted">No matching rows</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {/* Structured-query disclosure (trust + debuggability, spec FR-10.3) */}
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Query this ran {result.mock ? "· offline planner" : ""}</summary>
            <pre className="mt-1 overflow-x-auto rounded-control bg-surface-2 p-2">{JSON.stringify(result.plan, null, 2)}</pre>
          </details>
        </div>
      ) : null}
    </Card>
  );
}
