import { readFileSync, writeFileSync } from "fs";

/**
 * Shared init-status file: written by start-server's background init loop,
 * read by /api/health so the deployment explains itself over HTTP.
 */
export const INIT_STATUS_PATH = "/tmp/ll-init-status.json";

export type InitStatus = {
  state: "starting" | "initializing" | "ready" | "error";
  attempt: number;
  target?: string;
  error?: string;
  updatedAt: string;
};

export function writeInitStatus(status: Omit<InitStatus, "updatedAt">): void {
  try {
    writeFileSync(INIT_STATUS_PATH, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }));
  } catch {
    /* status is best-effort */
  }
}

export function readInitStatus(): InitStatus | null {
  try {
    return JSON.parse(readFileSync(INIT_STATUS_PATH, "utf8")) as InitStatus;
  } catch {
    return null;
  }
}
