import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/rules";
import { starterKindFrontmatter, kindNoteBody, mapKindFrontmatter, mapKindBody, mapBody } from "../src/starter";

const EXPECTED_DOTS = `## Dots

\`\`\`base
filters:
  and:
    - file.inFolder("<Atlas>")
    - file.hasLink(this.file)
views:
  - type: table
    name: By kind
    groupBy:
      property: kind
      direction: ASC
    order:
      - file.name
      - kind
      - file.mtime
  - type: cards
    name: Cards
    order:
      - file.name
      - kind
\`\`\`
`.replace("<Atlas>", "Atlas");

describe("starter", () => {
  const s = { ...DEFAULT_SETTINGS, sourcesFolder: "Notes/Sources", defaultFolder: "Notes/Dots" };
  it("kind frontmatter", () => {
    expect(starterKindFrontmatter("Book", s)).toEqual({ is_source: true, folder: "Notes/Sources/Books", status_options: ["to read", "reading", "finished"], default_status: "to read", fields: ["author"], title: "Book" });
    expect(starterKindFrontmatter("Collection", s)).toEqual({ folder: "Notes/Dots", title: "Collection" });
    expect(starterKindFrontmatter("Concept", s)).toEqual({ title: "Concept" });
    expect(starterKindFrontmatter("Idea", s)).toMatchObject({ default_status: "backlog", effort_status: "selected", effort_status_active: "working" });
    expect(starterKindFrontmatter("Tool", s)).toEqual({ is_source: true, folder: "Notes/Sources/Tools", title: "Tool" });
    expect(starterKindFrontmatter("Article", s)).toEqual({ is_source: true, folder: "Notes/Sources/Articles", status_options: ["to read", "reading", "finished"], default_status: "to read", title: "Article" });
    expect(starterKindFrontmatter("Method", s)).toEqual({ is_source: true, folder: "Notes/Sources/Methods", title: "Method" });
  });
  it("map kind", () => {
    expect(mapKindFrontmatter({ ...DEFAULT_SETTINGS, mapsFolder: "M" })).toEqual({ folder: "M", title: "Map" });
    expect(mapKindBody(DEFAULT_SETTINGS)).toMatch(/^## Overview\n/);
    expect(mapKindBody(DEFAULT_SETTINGS)).toContain("## Notes");
  });
  it("kind note body", () => {
    expect(kindNoteBody(s)).toContain("blank = Notes/Dots");
    expect(kindNoteBody(s)).toContain("effort_status_active");
  });
  it("mapBody", () => {
    expect(mapBody('My "Atlas"')).toContain('file.inFolder("My \\"Atlas\\"")');
    expect(mapBody("Atlas")).toBe(EXPECTED_DOTS);
  });
});
