// Pure builders for starter Kind notes. Must not import from "obsidian".
import type { AceSettings } from "./rules";

export const STARTER_KINDS = ["Article", "Book", "Collection", "Concept", "Idea", "Method", "Tool"] as const;

const READ_STATUSES = ["to read", "reading", "finished"];

export function starterKindFrontmatter(name: string, s: AceSettings): Record<string, unknown> {
  const src = (sub: string) => ({ is_source: true, folder: `${s.sourcesFolder}/${sub}` });
  let fm: Record<string, unknown>;
  switch (name) {
    case "Article":
      fm = { ...src("Articles"), fields: ["status"], status_options: [...READ_STATUSES], status_default: "to read" };
      break;
    case "Book":
      fm = { ...src("Books"), fields: ["status", "author"], status_options: [...READ_STATUSES], status_default: "to read" };
      break;
    case "Collection":
      fm = { folder: s.defaultFolder };
      break;
    case "Idea":
      fm = {
        fields: ["status"],
        status_options: ["backlog", "selected", "working", "completed", "graveyard"],
        status_default: "backlog",
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

const notesBlock = (up: string) => `## Notes

\`\`\`base
filters:
  and:
    - file.hasLink(this.file)
views:
  - type: table
    name: All
    order:
      - file.name
      - ${up}
      - file.mtime
  - type: cards
    name: Cards
    order:
      - file.name
      - ${up}
\`\`\`
`;

export function kindNoteBody(s: AceSettings): string {
  return `%%
Kind note keys (frontmatter above). All are optional.
folder: where new notes of this kind are filed (blank = ${s.defaultFolder})
is_source: true to ask for a link and write "${s.props.source}"
default_up: name of the Map to suggest first when picking a Map
fields: properties asked for when you create a note of this kind (or set its kind)
<field>_options: list of choices for that field
<field>_default: value filled in or listed first for that field
title_template: builds the note name from fields, e.g. {{first_name}} {{last_name}}
template: path or wikilink to a plain markdown file whose body is copied into new notes of this kind
%%

${notesBlock(s.props.up)}`;
}

export function mapKindFrontmatter(s: AceSettings): Record<string, unknown> {
  return { folder: s.mapsFolder, title: "Map" };
}

export function mapKindBody(s: AceSettings): string {
  return `## Overview

A Map is a note that gathers related notes around a topic.
Notes join a Map by listing it in their \`${s.props.up}\` property.
The Map shows them in a view, and you can add your own thinking around it.
Maps can sit on other Maps.
Use Add to Map or Set kind to link notes.

${kindNoteBody(s)}`;
}

export function mapBody(s: AceSettings): string {
  const kind = s.props.kind;
  const expr = s.atlasFolder.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const folder = `file.inFolder("${expr}")`.replace(/'/g, "''");
  return `## Dots

\`\`\`base
filters:
  and:
    - '${folder}'
    - file.hasLink(this.file)
views:
  - type: table
    name: By kind
    groupBy:
      property: ${kind}
      direction: ASC
    order:
      - file.name
      - ${kind}
      - file.mtime
  - type: cards
    name: Cards
    order:
      - file.name
      - ${kind}
\`\`\`
`;
}
