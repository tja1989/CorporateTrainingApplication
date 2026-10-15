import type { ReactNode } from "react";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { CourseCover } from "./course-cover";

/* Decorative covers from three everyday subjects; no course names, so it suits any organization. */
const COLLAGE = [
  { title: "food hygiene", className: "row-span-2 h-full" },
  { title: "customer service", className: "" },
  { title: "fire emergency", className: "" },
];

export function AuthFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="auth-page">
    <div className="auth-topbar"><Brand href="/login" /><ThemeToggle /></div>
    <div className="auth-content">
      <div className="auth-intro">
        <p className="type-display mb-4 max-w-md text-foreground">Build skills for your everyday work.</p>
        <p className="max-w-sm text-base text-muted">Find your assigned training, continue a lesson, and get support when you need it.</p>
        <div className="auth-collage mt-8" aria-hidden="true">
          {COLLAGE.map((tile) => (
            <CourseCover key={tile.title} title={tile.title} className={`course-cover-fill rounded-card shadow-[var(--shadow-resting)] ${tile.className}`} />
          ))}
        </div>
        <p className="mt-6 text-sm text-muted"><span className="font-semibold text-foreground">Your employee ID is all you need to get started.</span> Your manager or HR can help with account activation and password resets.</p>
      </div>
      <section className="auth-form" aria-labelledby="auth-title">
        <h1 id="auth-title" className="type-title mb-2">{title}</h1>
        <p className="mb-6 text-sm text-muted">{description}</p>
        {children}
      </section>
    </div>
    <p className="mx-auto max-w-4xl text-center text-sm text-muted">Workplace learning, practice and support</p>
  </main>;
}
