"use client";

import { useEffect, useState } from "react";
import { AiSurface, Button, Card, Input, Skeleton, Field } from "@/components/ui";

type AskResult = {
  plan: { report: string; filters: Record<string, unknown>; explanation: string };
  narration: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  mock: boolean;
};

export function AskReports({ scope }: { scope?: "team" } = {}) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);

  async function ask(question: string) {
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/reports/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, scope }),
      });
      if (res.ok) setResult(await res.json());
      else setError("The report could not be interpreted. Try a shorter question or use the report filters above.");
    } catch {
      setError("The connection was interrupted. Your question is still here; try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-3xl p-4"><h2 className="mb-2 text-lg font-semibold">Ask Reports</h2><p className="mb-4 text-sm text-muted">Your question is translated into one of the six reports and named filters. Your workspace permissions always apply.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Ask the data — e.g. "who in Khalidiyah is overdue on Food Safety?"'
          aria-label="Ask reports"
          disabled={!ready}
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={!ready || loading || !q.trim()}>Ask</Button>
      </form>

      {!ready ? <p role="status" className="mt-3 text-sm text-muted">Loading report assistant…</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-destructive-text">{error}</p> : null}
      {loading ? <Skeleton delayed className="mt-3 h-[64px] w-full" /> : null}

      {result ? (
        <div className="animate-enter mt-3">
          <AiSurface variant="block" className="mb-3" mock={result.mock}>
            {result.narration}
          </AiSurface>
          <p className="mb-2 text-sm text-muted">{result.rows.length} results · showing the first {Math.min(result.rows.length, 15)}</p>
          <div role="region" aria-label="Ask Reports table" tabIndex={0} className="mb-2 overflow-x-auto rounded-control border border-border">
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
            <summary className="touch-target flex cursor-pointer items-center">View interpreted report and filters {result.mock ? "· offline planner" : ""}</summary>
            <pre className="mt-1 overflow-x-auto rounded-control bg-surface-2 p-2">{JSON.stringify(result.plan, null, 2)}</pre>
          </details>
        </div>
      ) : null}
    </Card>
  );
}
