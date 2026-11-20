// The "About ACE" guide shown in settings. Pure: must not import from "obsidian".
import type { AceSettings } from './rules';

export function aboutMarkdown(s: AceSettings): string {
  const p = s.props;
  const reserved = Object.values(p)
    .map((f) => `\`${f}\``)
    .join(', ');
  return `ACE Actions is inspired by [Linking Your Thinking](https://blog.linkingyourthinking.com/notes/ace-folder-framework) and its ACE folder framework and borrows heavily from them.

### Linking Your Thinking (LYT)

Build understanding by linking notes, not by sorting them into a deep folder tree.

- **Dots** are single notes: an idea, a concept, a person, a book.
- **Maps** are notes that gather related dots around a topic and hold your thinking about how they connect. A note can sit on several Maps, and Maps can sit on other Maps.
- **Links** carry the structure. Folders stay few and shallow.

### ACE

- **Atlas** holds knowledge: Maps, dots and sources. It answers "where would you like to go?"
- **Calendar** holds time: daily notes, logs and plans. It answers "what's on your mind?"
- **Efforts** holds action: the things you are working on. Each effort has an intensity, so you can see what is on and what is asleep.

### How this plugin works

Everything is plain markdown and properties, so your notes read the same with the plugin removed.

- **Kinds.** A note's \`${p.kind}\` property links to a Kind note in \`${s.kindsFolder}\`. The Kind note's properties say where notes of that kind are filed, which fields to ask for, and which template to use. Edit them under Kinds below, or edit the Kind notes directly.
- **Maps.** Map is a built-in kind, filed in \`${s.mapsFolder}\`. A note joins a Map by listing it in its \`${p.up}\` property (**Add to Map**, **Set kind**, **New note…**). The Map shows its notes in a view.
- **Sources.** A kind marked as a source (\`is_source\`) asks for a link and writes it to \`${p.source}\`. Starter source kinds are filed under \`${s.sourcesFolder}\`.
- **Filing.** **File by kind** moves a note to its kind's folder. A kind with no folder uses \`${s.defaultFolder}\`. Notes inside \`${s.effortsFolder}\` are never moved, and nothing is ever overwritten.
- **Efforts.** **New effort** creates an effort in \`${s.effortsFolder}\` with an \`${p.intensity}\` (${s.intensities.join(', ')}). **Make effort** on a note in \`${s.atlasFolder}\` creates a linked effort (\`${p.from}\` on the effort, \`${p.effort}\` on the note). On any other note it sets the intensity and moves the note to \`${s.effortsFolder}\`.
- **Calendar.** The plugin does not manage a Calendar folder. **Log** inserts a line that links to today's date, so entries connect to your daily notes.

### Field syntax

A Kind note's properties describe its fields. For example, a Person kind:

\`\`\`yaml
fields: [first_name, last_name, status]
status_options: [friend, colleague, family]
status_default: friend
title_template: "{{first_name}} {{last_name}}"
\`\`\`

- \`fields\` lists the properties asked for, in order, when you create a note of this kind or set a note's kind.
- \`<field>_options\` gives that field a pick list, for example \`status_options\`.
- \`<field>_default\` is the value filled in, or listed first, for that field, for example \`status_default\`.
- \`title_template\` builds the note's name from its fields. Write each field as \`{{field}}\`.
- **Types.** How a field is asked for (text, number, checkbox, date, date and time, list) comes from its Obsidian property type. A field with no type is asked for as text.
- **Templates.** Effort templates and the Log format fill in \`{{date}}\` and \`{{time}}\`. The Make effort template also fills in \`{{note}}\`.

### Reserved names

- **Not allowed as field names:** ${reserved}. The plugin writes these properties itself. You can rename them under Property names below.
- **Read on Kind notes:** \`folder\`, \`is_source\`, \`default_up\`, \`fields\`, \`title_template\`, \`template\`, and any \`<field>_options\` or \`<field>_default\`.
`;
}
