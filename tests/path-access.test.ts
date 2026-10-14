import { describe, expect, it } from "vitest";
import { firstIncompletePrerequisite } from "@/lib/lms/path-rules";
const links = [{ courseId: "second", sort: 2 }, { courseId: "first", sort: 1 }, { courseId: "third", sort: 3 }];
describe("ordered path prerequisites", () => {
  it("blocks later courses until all prior course lessons are complete", () => {
    const progress = new Map([["first", { total: 2, done: 1 }]]);
    expect(firstIncompletePrerequisite(links, "second", progress)).toBe("first");
    progress.set("first", { total: 2, done: 2 });
    expect(firstIncompletePrerequisite(links, "second", progress)).toBeNull();
    expect(firstIncompletePrerequisite(links, "third", progress)).toBe("second");
  });
  it("does not block the first step or unrelated courses and does not treat empty courses as completed", () => {
    expect(firstIncompletePrerequisite(links, "first", new Map())).toBeNull();
    expect(firstIncompletePrerequisite(links, "unrelated", new Map())).toBeNull();
    expect(firstIncompletePrerequisite(links, "second", new Map([["first", { total: 0, done: 0 }]]))).toBe("first");
  });
});
