import type { ReactNode } from "react";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { Icon, type IconName } from "./icons";

export function SystemState({ title, body, icon = "warning", children }: { title: string; body: string; icon?: IconName; children: ReactNode }) {
  return <main className="auth-page">
    <div className="auth-topbar"><Brand /><ThemeToggle /></div>
    <section className="mx-auto mt-16 max-w-lg rounded-card border border-border bg-surface p-8">
      <Icon name={icon} size={32} className="mb-4 text-primary" />
      <h1 className="display mb-3 text-xl md:text-2xl">{title}</h1>
      <p className="mb-6 text-base text-muted">{body}</p>
      <div className="flex flex-wrap gap-3">{children}</div>
    </section>
  </main>;
}
