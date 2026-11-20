# ACE Actions

An Obsidian plugin for the ACE note structure. It creates typed notes ("kinds"), sets a note's kind, links notes to Maps, files notes into their kind's folder, and starts Efforts. Kinds are configured by notes in the Kinds folder (a setting, default `Atlas/Kinds`), so adding a kind or property means editing a note, not code. Everything is written as plain markdown and YAML frontmatter, so notes read the same with the plugin removed.

ACE Actions is inspired by [Linking Your Thinking](https://blog.linkingyourthinking.com/notes/ace-folder-framework) and its ACE folder framework and borrows heavily from them.

## Linking Your Thinking (LYT)

Build understanding by linking notes, not by sorting them into a deep folder tree.

- **Dots** are single notes: an idea, a concept, a person, a book.
- **Maps** are notes that gather related dots around a topic and hold your thinking about how they connect. A note can sit on several Maps, and Maps can sit on other Maps.
- **Links** carry the structure. Folders stay few and shallow.

## ACE

- **Atlas** holds knowledge: Maps, dots and sources. It answers "where would you like to go?"
- **Calendar** holds time: daily notes, logs and plans. It answers "what's on your mind?"
- **Efforts** holds action: the things you are working on. Each effort has an intensity, so you can see what is on and what is asleep.

## How this plugin works

Everything is plain markdown and properties, so your notes read the same with the plugin removed. The folder and property names below are the defaults; all of them can be changed in settings.

- **Kinds.** A note's `kind` property links to a Kind note in `Atlas/Kinds`. The Kind note's properties say where notes of that kind are filed, which fields to ask for, and which template to use. Edit them under Kinds in settings, or edit the Kind notes directly.
- **Maps.** Map is a built-in kind, filed in `Atlas/Maps`. A note joins a Map by listing it in its `up` property (**Add to Map**, **Set kind**, **New note…**). The Map shows its notes in a view.
- **Sources.** A kind marked as a source (`is_source`) asks for a link and writes it to `source`. Starter source kinds are filed under `Atlas/Sources`.
- **Filing.** **File by kind** moves a note to its kind's folder. A kind with no folder uses `Atlas/Dots`. Notes inside `Efforts` are never moved, and nothing is ever overwritten.
- **Efforts.** **New effort** creates an effort in `Efforts` with an `intensity` (on, ongoing, simmering, sleeping). **Make effort** on a note in `Atlas` creates a linked effort (`from` on the effort, `effort` on the note). On any other note it sets the intensity and moves the note to `Efforts`.
- **Calendar.** The plugin does not manage a Calendar folder. **Log** inserts a line that links to today's date, so entries connect to your daily notes.

## Commands

No default hotkeys. Assign your own in Obsidian settings. Set kind, Add to Map, File by kind and Make effort act on the open note, so the command palette only offers them while a note is open. Log needs an editor.

- **New note…**: pick a kind, name, Map, and status or link if the kind asks. Creates and opens the note.
- **New Map**: New note with kind Map preselected. If no Map kind note exists, it creates one first.
- **Set kind**: set the active note's kind, add a Map to `up`, add the kind's fields, then file it.
- **Add to Map**: add a Map from the Maps folder (setting, default `Atlas/Maps`) to the active note's `up`.
- **File by kind**: move the active note into its kind's folder.
- **Make effort**: set an intensity on the active note. From an Atlas note, create a linked Effort; elsewhere, move the note to the Efforts folder (setting, default `Efforts`).
- **New effort**: create a single-note or folder Effort in the Efforts folder (setting, default `Efforts`).
- **Log**: insert `[[YYYY-MM-DD]] HH:mm: ` at the cursor.

## Kind note keys

A kind exists if `<Kinds folder>/<name>.md` exists (default `Atlas/Kinds/<name>.md`). These frontmatter keys configure it. All are optional.

| key | meaning | default |
|---|---|---|
| `folder` | where notes of this kind are filed | `Atlas/Dots` |
| `is_source` | asks for a link and writes `source` | false |
| `default_map` | name of the Map suggested first in the picker | none |
| `fields` | properties asked for when you create a note of this kind or set its kind, e.g. `[status, author]` | none |
| `<field>_options` | list of choices for that field, e.g. `status_options` | none |
| `<field>_default` | value filled in or listed first for that field, e.g. `status_default` | none |
| `title_template` | builds the note name from fields, e.g. `{{first_name}} {{last_name}}` | none |
| `template` | path or wikilink to a plain markdown file whose body is copied into new notes of this kind | none |

### Field syntax

For example, a Person kind:

```yaml
fields: [first_name, last_name, status]
status_options: [friend, colleague, family]
status_default: friend
title_template: "{{first_name}} {{last_name}}"
```

- `fields` lists the properties asked for, in order, when you create a note of this kind or set a note's kind.
- `<field>_options` gives that field a pick list, for example `status_options`.
- `<field>_default` is the value filled in, or listed first, for that field, for example `status_default`.
- `title_template` builds the note's name from its fields. Write each field as `{{field}}`.
- **Types.** How a field is asked for (text, number, checkbox, date, date and time, list) comes from its Obsidian property type (`.obsidian/types.json`). A field with no type is asked for as text.
- **Templates.** Effort templates and the Log format fill in `{{date}}` and `{{time}}`. The Make effort template also fills in `{{note}}`.

### Reserved names

- **Not allowed as field names:** `kind`, `up`, `source`, `effort`, `intensity`, `from`, or whatever you renamed them to under Property names in settings. The plugin writes these properties itself.
- **Read on Kind notes:** `folder`, `is_source`, `default_map`, `fields`, `title_template`, `template`, and any `<field>_options` or `<field>_default`.

## Settings

Open Settings, then ACE Actions (needs Obsidian 1.13 or newer). Per-kind settings (folder, fields and their options, template) stay on Kind notes; the plugin settings below cover the rest. Folders use Obsidian's folder picker. Intensities is a list: add with +, drag to reorder, delete with the bin.

| setting | default |
|---|---|
| Atlas folder | `Atlas` |
| Kinds folder | `Atlas/Kinds` |
| Maps folder | `Atlas/Maps` |
| Default folder | `Atlas/Dots` |
| Sources folder | `Atlas/Sources` |
| Efforts folder | `Efforts` |
| Intensities | `on, ongoing, simmering, sleeping` |
| New effort template | blank: built-in `## Goal`, `## Next steps`, `## Log` sections |
| Make effort template | blank: built-in `Started from {{note}}.` plus a `## Next steps` section |
| Log format | `[[{{date}}]] {{time}}: ` |
| Date format | `YYYY-MM-DD` |
| Time format | `HH:mm` |
| Property names | `kind`, `up`, `source`, `effort`, `intensity`, `from` |

**Property names** are the six properties the plugin writes on notes: the kind link, the Maps list, a source's link, a note's efforts, an effort's intensity, and the note an effort was made from. Each can be renamed. A blank name means the default. Two properties can't share a name, and a Kind can't have a field with one of these names. Renaming changes what the plugin reads and writes from then on. As soon as a name changes, a warning under **Rename in existing notes** says how many notes still use the old name. Notes you already have keep the old name until you press **Check notes** (under **Rename in existing notes**). That shows how many notes use each old name, asks first, then renames the property in place and keeps its value. A note that already has both the old and the new name is not renamed; it is named in the window and the notice so you can remove one by hand. For a Kind note that has an old key and its new key, Check notes asks whether to remove the old key, showing both values first. **Danger zone: remove all old properties**, at the bottom of the Check notes window, deletes every old property, with its value, from every note that still has one. It shows how many notes lose their only copy and makes you type `yes` first. Use Check notes before it. The views inside existing Map and Kind notes are not changed; edit those by hand.

The two effort templates are markdown files whose body (without properties) becomes a new effort's body. `{{date}}` and `{{time}}` are filled in with the Log formats, and in the Make effort template `{{note}}` becomes a link to the note you started from. While a template is blank or its file is missing, the built-in text is used; a missing file gets a **Create file** button that writes the built-in text there for you to edit.

The **Create starter kinds** button adds the starter Kind notes: Article, Book, Collection, Concept, Idea, Method and Tool. Its row lists which of them it will create and which are already there. It never overwrites an existing note.

The Map kind is not a starter kind. The plugin creates its Kind note by default when it loads, in the Kinds folder, if there is none. New Map also creates it if it is missing. The Maps folder is used when no Map kind exists and for the Map kind note the plugin creates.

### Kinds editor

Under Kinds, each kind has an **Edit** button that opens an editor for its folder, source flag, default Map, fields (with options and defaults), title template and template. Save writes only those keys to the Kind note in one edit and leaves the body alone; Cancel writes nothing. A Problems list warns about things like a missing folder or a default that isn't one of the options, but doesn't block Save. A missing folder, default Map or template file gets a **Create** button that makes it straight away (never overwriting anything). An old key gets a **Rename** button, **Delete** when it is empty, or **Remove old** when the new key is already on the note; these change the Kind note straight away, so save or cancel your other edits first. The editor can also open, rename or delete the Kind note. Deleting asks first, removes the `kind` property from the notes that use it, and sends the Kind note to the trash. **New kind** creates a Kind note and opens the editor. The folder button at the top right of Kinds (**Create missing folders**) creates every kind's folder that doesn't exist yet. A faint count beside it shows how many are missing.

## Migrating from the hard-coded version

Kind notes use `default_map` where they used `default_up`. The Kind editor lists it under Problems until it is renamed. **Check notes** (Settings, Property names) renames old Kind note keys for you: `default_up` to `default_map`, and `default_<field>` to `<field>_default`. You can also rename them by hand.

Make effort no longer changes a note's status. The Templater version set an Idea to `working` or `selected`; set the status by hand instead.

Kind notes no longer use `default_status` as a built-in key. For Article, Book, Idea, Movie and Product, add `status` first in `fields` and rename `default_status` to `status_default` (`status_options` keeps its name). For List and Library the two keys are empty, so delete them; do not add `status`.

## Filing rule

A note moves to its kind's `folder` unless it is anywhere inside the Efforts folder. This applies to every kind. It never overwrites: if the target path exists, the note stays and a Notice says why. Moves use `fileManager.renameFile`, so links update.

## Dev loop

```
npm install
npm run dev     # watch build into the dev vault
npm run seed    # fill the dev vault with sample notes
```

Open the dev vault in Obsidian (`C:\Users\adamp\Documents\ACE Dev Vault`) and enable community plugins if prompted. Hot Reload reloads the plugin on each build. Then follow `Home.md` in the vault.

`ACE_VAULT` overrides the vault path for `dev`, `seed` and `check-vault`. Default: `/mnt/c/Users/adamp/Documents/ACE Dev Vault`.

`npm run check-vault` checks that every note's frontmatter parses and no Templater syntax remains. It is read-only.

## Adding a command

Add one file in `src/commands` exporting an `AceCommand`, then add it to the `COMMANDS` array in `src/commands/index.ts`.

## Tests

`npm test` runs the Vitest unit tests for the pure logic in `src/rules.ts`. `npm run build` typechecks and builds.
