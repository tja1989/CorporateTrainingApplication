export type Parsed<T> = { value: T; error?: never } | { error: string; value?: never };
export function parseCoverUrl(raw: string): Parsed<string | null> {
  const value = raw.trim();
  if (!value) return { value: null };
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return { value };
  try { const url = new URL(value); if (["https:", "http:"].includes(url.protocol)) return { value }; } catch { /* explained below */ }
  return { error: "Use an HTTPS image URL or a local path beginning with /, or leave the cover blank." };
}
export function parseDays(raw: string): Parsed<number> {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 3650 ? { value } : { error: "Enter a whole number of days between 1 and 3650." };
}
export type PeopleCsvRow = { row: number; employeeId: string; name: string; role: "ADMIN" | "MANAGER" | "LEARNER"; storeName: string; groupName: string; jobTitle: string; hireDate: string; managerEmployeeId: string };
export function parsePeopleCsv(csv: string): { rows: PeopleCsvRow[]; errors: { row: number; message: string }[] } {
  const rows: PeopleCsvRow[] = []; const errors: { row: number; message: string }[] = []; const seen = new Set<string>();
  csv.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const row = index + 1; const cells: string[] = []; let value = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
      else if (ch === "," && !quoted) { cells.push(value.trim()); value = ""; } else value += ch;
    }
    cells.push(value.trim());
    if (index === 0 && cells[0].toLowerCase() === "employeeid") return;
    const [employeeIdRaw, name, roleRaw, storeName = "", groupName = "", jobTitle = "", hireDate = "", managerEmployeeId = ""] = cells;
    const employeeId = employeeIdRaw?.toUpperCase(); const role = roleRaw?.toUpperCase();
    let message = quoted ? "Unclosed quoted field." : cells.length < 3 || cells.length > 8 ? "Use 3–8 columns in the displayed order." : !employeeId || !name ? "Employee ID and name are required." : !["ADMIN", "MANAGER", "LEARNER"].includes(role) ? "Role must be LEARNER, MANAGER or ADMIN." : hireDate && (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate) || Number.isNaN(Date.parse(hireDate)) || new Date(hireDate).toISOString().slice(0,10) !== hireDate) ? "Hire date must be a valid YYYY-MM-DD date." : seen.has(employeeId) ? "Duplicate employee ID in this import." : "";
    if (message) { errors.push({ row, message }); return; }
    seen.add(employeeId);
    rows.push({ row, employeeId, name, role: role as PeopleCsvRow["role"], storeName, groupName, jobTitle, hireDate, managerEmployeeId: managerEmployeeId.toUpperCase() });
  });
  return { rows, errors };
}
