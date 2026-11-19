# ACE Actions

An Obsidian plugin for the ACE note structure. It creates typed notes ("kinds"), sets a note's kind, links notes to Maps, files notes into their kind's folder, and starts Efforts. Kinds are configured by notes in `Atlas/Kinds`, so adding a kind or property means editing a note, not code. Everything is written as plain markdown and YAML frontmatter, so notes read the same with the plugin removed.

## Commands

No default hotkeys. Assign your own in Obsidian settings.

- **New note…**: pick a kind, name, Map, and status or link if the kind asks. Creates and opens the note.
- **New Map**: New note with kind Map preselected.
- **Set kind**: set the active note's kind, add a Map to `up`, add the kind's fields, then file it.
- **Add to Map**: add a Map from `Atlas/Maps` to the active note's `up`.
- **File by kind**: move the active note into its kind's folder.
- **Make effort**: set an intensity on the active note. From an Atlas note, create a linked Effort; elsewhere, move the note to `Efforts/`.
- **New effort**: create a single-note or folder Effort in `Efforts/`.
- **Log**: insert `[[YYYY-MM-DD]] HH:mm: ` at the cursor.

## Kind note keys

A kind exists if `Atlas/Kinds/<name>.md` exists. These frontmatter keys configure it. All are optional.

| key | meaning | default |
|---|---|---|
| `folder` | where notes of this kind are filed | `Atlas/Dots` |
| `is_source` | asks for a link and writes `source` | false |
| `default_status` | status written if the note has none | none |
| `status_options` | statuses offered; empty means don't ask | none |
| `default_up` | Map suggested first | none |
| `fields` | extra blank properties added on create and set kind, e.g. `[author]` | none |
| `effort_status` | status set on a note when Make effort creates an Effort from it | none |
| `effort_status_active` | status used instead when the intensity is the first (active) one | none |
| `template` | path or wikilink to a plain markdown file whose body is copied into new notes of this kind | none |

## Settings

Open Settings, then ACE Actions. Per-kind settings (folder, statuses, fields, template) stay on Kind notes; the plugin settings below cover the rest.

| setting | default |
|---|---|
| Atlas folder | `Atlas` |
| Kinds folder | `Atlas/Kinds` |
| Maps folder | `Atlas/Maps` |
| Default folder | `Atlas/Dots` |
| Sources folder | `Atlas/Sources` |
| Efforts folder | `Efforts` |
| Intensities | `on, ongoing, simmering, sleeping` |
| New effort text | `## Goal`, `## Next steps`, `## Log` sections |
| Make effort text | `Started from {{note}}.` plus a `## Next steps` section |
| Log format | `[[{{date}}]] {{time}}: ` |
| Date format | `YYYY-MM-DD` |
| Time format | `HH:mm` |

The **Create starter kinds** button adds the standard Kind notes and the Map kind. It never overwrites an existing note.

## Migrating from the hard-coded version

Add `effort_status: selected` and `effort_status_active: working` to your Idea Kind note.

## Filing rule

A note moves to its kind's `folder` unless it is anywhere inside `Efforts/`. This applies to every kind. It never overwrites: if the target path exists, the note stays and a Notice says why. Moves use `fileManager.renameFile`, so links update.

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
