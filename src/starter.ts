// Pure builders for starter Kind notes. Must not import from "obsidian".
import type { AceSettings } from "./rules";

export const STARTER_KINDS = ["Article", "Book", "Collection", "Concept", "Idea", "Method", "Tool"] as const;

const READ_STATUSES = ["to read", "reading", "finished"];

export function starterKindFrontmatter(name: string, s: AceSettings): Record<string, unknown> {
  const src = (sub: string) => ({ is_source: true, folder: `${s.sourcesFolder}/${sub}` });
  let fm: Record<string, unknown>;
  switch (name) {
    case "Article":
      fm = { ...src("Articles"), status_options: [...READ_STATUSES], default_status: "to read" };
      break;
    case "Book":
      fm = { ...src("Books"), status_options: [...READ_STATUSES], default_status: "to read", fields: ["author"] };
      break;
    case "Collection":
      fm = { folder: s.defaultFolder };
      break;
    case "Idea":
      fm = {
        status_options: ["backlog", "selected", "working", "completed", "graveyard"],
        default_status: "backlog",
        effort_status: "selected",
        effort_status_active: "working",
      };
      break;
    case "Method":
      fm = src("Methods");
      break;
    case "Tool":
      fm = src("Tools");
      break;
    default:
      fm = {};
  }
  return { ...fm, title: name };
}

const NOTES_BLOCK = `## Notes

\`\`\`base
filters:
  and:
    - file.hasLink(this.file)
views:
  - type: table
    name: All
    order:
      - file.name
      - up
      - file.mtime
  - type: cards
    name: Cards
    order:
      - file.name
      - up
\`\`\`
`;

export function kindNoteBody(s: AceSettings): string {
  return `%%
Kind note keys (frontmatter above). All are optional.
folder: where new notes of this kind are filed (blank = ${s.defaultFolder})
is_source: true if notes of this kind are sources
status_options: list of statuses to choose from
default_status: status given to new notes
default_up: note that new notes link to in "up"
fields: extra properties to ask for when creating a note
template: note whose body is copied into new notes
effort_status: status set on a note when Make effort creates an Effort from it
effort_status_active: status used instead when the intensity is the first (active) one
%%

${NOTES_BLOCK}`;
}

export function mapKindFrontmatter(s: AceSettings): Record<string, unknown> {
  return { folder: s.mapsFolder, title: "Map" };
}

export function mapKindBody(s: AceSettings): string {
  return `## Overview

A Map is a note that gathers related notes around a topic.
Notes join a Map by listing it in their \`up\` property.
The Map shows them in a view, and you can add your own thinking around it.
Maps can sit on other Maps.
Use Add to Map or Set kind to link notes.

${kindNoteBody(s)}`;
}

export function mapBody(atlasFolder: string): string {
  const folder = atlasFolder.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `## Dots

\`\`\`base
filters:
  and:
    - file.inFolder("${folder}")
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
`;
}
