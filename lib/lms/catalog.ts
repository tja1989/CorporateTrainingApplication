export type CatalogQuery = { view: "mine" | "paths" | "browse"; q: string; tag: string; language: string; duration: string; status: string; sort: "title" | "duration"; page: number };
export type CatalogCourse = { id: string; title: string; description: string; tags: string[]; language: string; estMinutes: number; status: string };
export type CatalogParams = Record<string, string | string[] | undefined>;
export function parseCatalogQuery(params: CatalogParams): CatalogQuery {
  const value = (key: string) => typeof params[key] === "string" ? (params[key] as string).trim() : "";
  const q = value("q").slice(0, 200);
  const page = Number(value("page"));
  return { view: q ? "browse" : value("view") === "paths" ? "paths" : value("view") === "browse" ? "browse" : "mine", q,
    tag: value("tag"), language: value("language"), duration: ["short", "medium", "long"].includes(value("duration")) ? value("duration") : "",
    status: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "unenrolled"].includes(value("status")) ? value("status") : "",
    sort: value("sort") === "duration" ? "duration" : "title", page: Number.isSafeInteger(page) && page > 0 ? page : 1 };
}
export function filterCatalog<T extends CatalogCourse>(courses: T[], enrollment: Map<string, string>, query: CatalogQuery, pageSize = 12) {
  const words = query.q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matching = courses.filter(c => c.status === "PUBLISHED" && (query.view !== "mine" || enrollment.has(c.id))
    && words.every(w => `${c.title} ${c.description} ${c.tags.join(" ")}`.toLocaleLowerCase().includes(w))
    && (!query.tag || c.tags.includes(query.tag)) && (!query.language || c.language === query.language)
    && (!query.status || (query.status === "unenrolled" ? !enrollment.has(c.id) : enrollment.get(c.id) === query.status))
    && (!query.duration || (query.duration === "short" ? c.estMinutes < 20 : query.duration === "medium" ? c.estMinutes >= 20 && c.estMinutes <= 60 : c.estMinutes > 60)))
    .sort((a, b) => (query.sort === "duration" ? a.estMinutes - b.estMinutes : 0) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(query.page, pages);
  return { items: matching.slice((page - 1) * pageSize, page * pageSize), total: matching.length, page, pages };
}
export function catalogHref(query: CatalogQuery, patch: Partial<CatalogQuery> = {}) {
  const next = { ...query, ...patch };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) if (value !== "" && !(key === "page" && value === 1)) search.set(key, String(value));
  return `/learn?${search}`;
}
