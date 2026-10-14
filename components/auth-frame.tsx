import type { ReactNode } from "react";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

export function AuthFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="auth-page">
    <div className="auth-topbar"><Brand href="/login" /><ThemeToggle /></div>
    <div className="auth-content">
      <div className="auth-intro">
        <p className="mb-4 text-sm font-semibold text-primary">Learning at LuLu</p>
        <h2 className="display mb-4 text-3xl">Build skills for<br />your everyday work.</h2>
        <p className="max-w-sm text-base text-muted">Find your assigned training, continue a lesson, and get support when you need it.</p>
        <div className="mt-8 border-t border-border pt-6"><p className="text-sm font-semibold">Your employee ID is all you need to get started.</p><p className="mt-2 text-sm text-muted">Your manager or HR can help with account activation and password resets.</p></div>
      </div>
      <section className="auth-form" aria-labelledby="auth-title">
        <h1 id="auth-title" className="display mb-2 text-xl md:text-2xl">{title}</h1>
        <p className="mb-6 text-sm text-muted">{description}</p>
        {children}
      </section>
    </div>
    <p className="mx-auto max-w-4xl text-center text-sm text-muted">xprtn · Workplace learning</p>
  </main>;
}
