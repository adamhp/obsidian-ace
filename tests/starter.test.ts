import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/rules";
import { starterKindFrontmatter, kindNoteBody, mapKindFrontmatter, mapKindBody, mapBody } from "../src/starter";

const EXPECTED_DOTS = `## Dots

\`\`\`base
filters:
  and:
    - 'file.inFolder("<Atlas>")'
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
    expect(starterKindFrontmatter("Book", s)).toEqual({ is_source: true, folder: "Notes/Sources/Books", fields: ["status", "author"], status_options: ["to read", "reading", "finished"], status_default: "to read", title: "Book" });
    expect(starterKindFrontmatter("Collection", s)).toEqual({ folder: "Notes/Dots", title: "Collection" });
    expect(starterKindFrontmatter("Concept", s)).toEqual({ title: "Concept" });
    expect(starterKindFrontmatter("Idea", s)).toEqual({ fields: ["status"], status_options: ["backlog", "selected", "working", "completed", "graveyard"], status_default: "backlog", title: "Idea" });
    expect(starterKindFrontmatter("Idea", s)).not.toHaveProperty("effort_status");
    expect(starterKindFrontmatter("Tool", s)).toEqual({ is_source: true, folder: "Notes/Sources/Tools", title: "Tool" });
    expect(starterKindFrontmatter("Article", s)).toEqual({ is_source: true, folder: "Notes/Sources/Articles", fields: ["status"], status_options: ["to read", "reading", "finished"], status_default: "to read", title: "Article" });
    expect(starterKindFrontmatter("Method", s)).toEqual({ is_source: true, folder: "Notes/Sources/Methods", title: "Method" });
  });
  it("map kind", () => {
    expect(mapKindFrontmatter({ ...DEFAULT_SETTINGS, mapsFolder: "M" })).toEqual({ folder: "M", title: "Map" });
    expect(mapKindBody(DEFAULT_SETTINGS)).toMatch(/^## Overview\n/);
    expect(mapKindBody(DEFAULT_SETTINGS)).toContain("## Notes");
  });
  it("kind note body", () => {
    expect(kindNoteBody(s)).toContain("blank = Notes/Dots");
  });
  it("kind note body mentions every key", () => {
    for (const k of ["folder", "is_source", "default_up", "fields", "template", "title_template"]) {
      expect(kindNoteBody(s)).toContain(`${k}:`);
    }
    expect(kindNoteBody(s)).toContain("<field>_options:");
    expect(kindNoteBody(s)).toContain("<field>_default:");
    expect(kindNoteBody(s)).not.toContain("default_status");
  });
  it("mapBody", () => {
    expect(mapBody({ ...DEFAULT_SETTINGS, atlasFolder: 'My "Atlas"' })).toContain(`- 'file.inFolder("My \\"Atlas\\"")'`);
    expect(mapBody({ ...DEFAULT_SETTINGS, atlasFolder: "Bob's #notes" })).toContain(`- 'file.inFolder("Bob''s #notes")'`);
    expect(mapBody(DEFAULT_SETTINGS)).toBe(EXPECTED_DOTS);
    const renamed = { ...DEFAULT_SETTINGS, props: { ...DEFAULT_SETTINGS.props, kind: "type", up: "parent" } };
    expect(mapBody(renamed)).toContain("property: type");
    expect(mapBody(renamed)).not.toContain("- kind");
    expect(kindNoteBody(renamed)).toContain("- parent");
  });
});
