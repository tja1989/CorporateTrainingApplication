"use client";

import { useEffect, useRef, useState } from "react";
import { WorkspaceForm } from "@/components/workspace-form";
import { ResetCode } from "@/components/reset-code";
import { Button, Chip, Field, Select } from "@/components/ui";
import { issueCodeAction, updateUserAction } from "./actions";

type Choice = { id: string; name: string };
type Person = {
  id: string;
  employeeId: string;
  name: string;
  role: "LEARNER" | "MANAGER" | "ADMIN";
  passwordState: string;
  jobTitle: string | null;
  storeId: string | null;
  managerId: string | null;
  groupId: string | null;
  timeMultiplier: number;
};
type Choices = { managers: Choice[]; stores: Choice[]; groups: Choice[] };

/** One shared safe choice payload; closed rows do not render duplicate options. */
export function PeopleEditorList({ people, managers, stores, groups }: Choices & { people: Person[] }) {
  const choices = { managers, stores, groups };
  return <div className="flex flex-col gap-2">
    {people.map(person => <PersonEditor key={person.id} person={person} choices={choices} />)}
    {people.length === 0 ? <p className="text-sm text-muted">No one matches this search.</p> : null}
  </div>;
}

function PersonEditor({ person, choices }: { person: Person; choices: Choices }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    role: person.role,
    managerId: person.managerId ?? "",
    storeId: person.storeId ?? "",
    groupId: person.groupId ?? "",
    timeMultiplier: String(person.timeMultiplier),
  });
  // Native disclosure can open before hydration attaches its toggle handler.
  useEffect(() => setOpen(details.current?.open ?? false), []);
  const storeName = choices.stores.find(store => store.id === person.storeId)?.name;

  return <details ref={details} onToggle={event => setOpen(event.currentTarget.open)} className="rounded-card border border-border bg-surface">
    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <span className="min-w-0 break-words">
        <span className="font-medium">{person.name}</span>
        <span className="mt-1 block text-sm text-muted">{person.employeeId} · {person.jobTitle ?? "—"} · {storeName ?? "—"}</span>
      </span>
      <span className="flex gap-2">
        <Chip variant={person.role === "ADMIN" ? "primary" : person.role === "MANAGER" ? "warning" : "neutral"}>{person.role.toLowerCase()}</Chip>
        {person.passwordState === "INVITED" ? <Chip variant="warning">invited</Chip> : null}
      </span>
    </summary>
    <div className="border-t border-border p-3">
      {/* Keep the form mounted so collapse never resets an in-flight save guard. */}
      <WorkspaceForm action={form => updateUserAction(person.id, form)} className="grid gap-3">
        {open ? <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role">
            <Select name="role" value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as Person["role"] })}>
              <option>LEARNER</option><option>MANAGER</option><option>ADMIN</option>
            </Select>
          </Field>
          <Field label="Manager">
            <Select name="managerId" value={draft.managerId} onChange={event => setDraft({ ...draft, managerId: event.target.value })}>
              <option value="">— none —</option>
              {choices.managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
            </Select>
          </Field>
          <Field label="Store">
            <Select name="storeId" value={draft.storeId} onChange={event => setDraft({ ...draft, storeId: event.target.value })}>
              <option value="">— none —</option>
              {choices.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
            </Select>
          </Field>
          <Field label="Group">
            <Select name="groupId" value={draft.groupId} onChange={event => setDraft({ ...draft, groupId: event.target.value })}>
              <option value="">— none —</option>
              {choices.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </Select>
          </Field>
          <Field label="Time multiplier (assessment accommodation)">
            <Select name="timeMultiplier" value={draft.timeMultiplier} onChange={event => setDraft({ ...draft, timeMultiplier: event.target.value })}>
              <option value="1">1× (standard)</option><option value="1.5">1.5×</option><option value="2">2×</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2 pb-4"><Button type="submit" variant="secondary">Save</Button></div>
        </div> : null}
      </WorkspaceForm>
      <div className="border-t border-border pt-4">
        <ResetCode action={() => issueCodeAction(person.id)} label="Issue reset/activation code" />
        <p className="mt-2 text-sm text-muted">Verify identity first. Resetting invalidates the current password and records who issued the code.</p>
      </div>
    </div>
  </details>;
}
