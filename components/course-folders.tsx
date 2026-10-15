import { folderChildren } from "@/lib/courses/planning";
import {
  catalogHref,
  type CatalogCourse,
  type CatalogQuery,
} from "@/lib/lms/catalog";
import { ButtonAnchor, Icon } from "./ui";
export function CourseFolders({
  courses,
  query,
}: {
  courses: CatalogCourse[];
  query: CatalogQuery;
}) {
  const folders = folderChildren(
    courses.map((course) => ({ folderPath: course.folderPath ?? "" })),
    query.folder,
  );
  const segments = query.folder.split("/").filter(Boolean);
  if (!folders.length && !query.folder) return null;
  return (
    <section className="mb-6" aria-label="Course folders">
      <nav
        aria-label="Folder breadcrumbs"
        className="mb-3 flex min-w-0 flex-wrap items-center gap-x-2 text-sm"
      >
        <a
          className="touch-target inline-flex items-center text-link underline"
          href={catalogHref(query, { folder: "", page: 1 })}
        >
          All folders
        </a>
        {segments.map((segment, index) => (
          <span key={index} className="inline-flex min-w-0 items-center gap-2">
            <span aria-hidden="true">/</span>
            {index === segments.length - 1 ? (
              <bdi aria-current="page" className="break-words font-medium">
                {segment}
              </bdi>
            ) : (
              <a
                className="touch-target inline-flex items-center break-words text-link underline"
                href={catalogHref(query, {
                  folder: segments.slice(0, index + 1).join("/"),
                  page: 1,
                })}
              >
                <bdi>{segment}</bdi>
              </a>
            )}
          </span>
        ))}
      </nav>
      {folders.length ? (
        <ul className="flex flex-wrap gap-2">
          {folders.map((folder) => (
            <li key={folder.path} className="max-w-full">
              <ButtonAnchor
                variant="secondary"
                className="max-w-full whitespace-normal break-words text-left"
                href={catalogHref(query, { folder: folder.path, page: 1 })}
              >
                <Icon name="book" size={16} className="shrink-0 text-muted" />
                {folder.name} · {folder.count} course
                {folder.count === 1 ? "" : "s"}
              </ButtonAnchor>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
