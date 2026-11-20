# ACE Actions

An Obsidian plugin for the ACE note structure. It creates typed notes ("kinds"), sets a note's kind, links notes to Maps, files notes into their kind's folder, and starts Efforts. Kinds are configured by notes in the Kinds folder (a setting, default `Atlas/Kinds`), so adding a kind or property means editing a note, not code. Everything is written as plain markdown and YAML frontmatter, so notes read the same with the plugin removed.

## Commands

No default hotkeys. Assign your own in Obsidian settings.

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
| `default_up` | name of the Map suggested first in the picker | none |
| `fields` | properties asked for when you create a note of this kind or set its kind, e.g. `[status, author]` | none |
| `<field>_options` | list of choices for that field, e.g. `status_options` | none |
| `<field>_default` | value filled in or listed first for that field, e.g. `status_default` | none |
| `title_template` | builds the note name from fields, e.g. `{{first_name}} {{last_name}}` | none |
| `template` | path or wikilink to a plain markdown file whose body is copied into new notes of this kind | none |

How each field is asked for comes from its Obsidian property type (`.obsidian/types.json`).

## Settings

Open Settings, then ACE Actions (needs Obsidian 1.13 or newer). Per-kind settings (folder, fields and their options, template) stay on Kind notes; the plugin settings below cover the rest. Folders use Obsidian's folder picker. Intensities is a list: add with +, drag to reorder, delete with the bin.

The first row, **About ACE**, expands into a short guide to LYT, ACE, how this plugin uses them, the field syntax and the reserved names, using your current folder names.

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

**Property names** are the six properties the plugin writes on notes: the kind link, the Maps list, a source's link, a note's efforts, an effort's intensity, and the note an effort was made from. Each can be renamed. A blank name means the default. Two properties can't share a name, and a Kind can't have a field with one of these names. Renaming changes what the plugin reads and writes from then on. It does not rename the property in notes you already have, or in the views inside existing Map and Kind notes.

The two effort templates are markdown files whose body (without properties) becomes a new effort's body. `{{date}}` and `{{time}}` are filled in with the Log formats, and in the Make effort template `{{note}}` becomes a link to the note you started from. While a template is blank or its file is missing, the built-in text is used; a missing file gets a **Create file** button that writes the built-in text there for you to edit.

The **Create starter kinds** button adds the standard Kind notes and the Map kind. The Maps folder is used when no Map kind exists and for the Map kind note it creates. It never overwrites an existing note.

### Kinds editor

Under Kinds, each kind has an **Edit** button that opens an editor for its folder, source flag, default Map, fields (with options and defaults), title template and template. Save writes only those keys to the Kind note in one edit and leaves the body alone; Cancel writes nothing. A Problems list warns about things like a missing folder or a default that isn't one of the options, but doesn't block Save. A missing folder, default Map or template file gets a **Create** button that makes it straight away (never overwriting anything). The editor can also open, rename or delete the Kind note. Deleting asks first, removes the `kind` property from the notes that use it, and sends the Kind note to the trash. **New kind** creates a Kind note and opens the editor. The folder button at the top right of Kinds (**Create missing folders**) creates every kind's folder that doesn't exist yet. A faint count beside it shows how many are missing.

## Migrating from the hard-coded version

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
