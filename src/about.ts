// The "About ACE" guide shown in settings. Pure: must not import from "obsidian".
import type { AceSettings } from "./rules";

export function aboutMarkdown(s: AceSettings): string {
  return `### Linking Your Thinking (LYT)

LYT is Nick Milo's approach to notes: you build understanding by linking notes, not by sorting them into a deep folder tree.

- **Dots** are single notes: an idea, a concept, a person, a book.
- **Maps** (Maps of Content) are notes that gather related dots around a topic and hold your thinking about how they connect. A note can sit on several Maps, and Maps can sit on other Maps.
- **Links carry the structure.** Folders stay few and shallow.

### ACE

ACE is LYT's folder framework. It has three top-level spaces:

- **Atlas** holds knowledge: Maps, dots and sources. It answers "where would you like to go?"
- **Calendar** holds time: daily notes, logs and plans. It answers "what's on your mind?"
- **Efforts** holds action: the things you are working on. Each effort has an intensity, so you can see what is on and what is asleep.

### How this plugin implements it

Everything is plain markdown and properties, so your notes read the same with the plugin removed.

- **Kinds.** A note's \`kind\` property links to a Kind note in \`${s.kindsFolder}\`. The Kind note's properties say where notes of that kind are filed, which fields to ask for, and which template to use. Edit them under Kinds below, or edit the Kind notes directly.
- **Maps.** Map is a built-in kind, filed in \`${s.mapsFolder}\`. A note joins a Map by listing it in its \`up\` property (**Add to Map**, **Set kind**, **New note…**). The Map shows its notes in a view.
- **Sources.** A kind marked as a source (\`is_source\`) asks for a link and writes it to \`source\`. Starter source kinds are filed under \`${s.sourcesFolder}\`.
- **Filing.** **File by kind** moves a note to its kind's folder. A kind with no folder uses \`${s.defaultFolder}\`. Notes inside \`${s.effortsFolder}\` are never moved, and nothing is ever overwritten.
- **Efforts.** **New effort** creates an effort in \`${s.effortsFolder}\` with an \`intensity\` (${s.intensities.join(", ")}). **Make effort** on a note in \`${s.atlasFolder}\` creates a linked effort (\`from\` on the effort, \`effort\` on the note). On any other note it sets the intensity and moves the note to \`${s.effortsFolder}\`.
- **Calendar.** The plugin does not manage a Calendar folder. **Log** inserts a line that links to today's date, so entries connect to your daily notes.

Learn more: [The ACE folder framework](https://blog.linkingyourthinking.com/notes/ace-folder-framework).
`;
}
