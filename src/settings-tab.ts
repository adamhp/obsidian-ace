import { App, Component, MarkdownRenderer, Notice, PluginSettingTab, SettingDefinition, SettingDefinitionItem, TFile } from "obsidian";
import type AcePlugin from "./main";
import type { Ace } from "./vault";
import { AceSettings, DEFAULT_SETTINGS, PROP_KEYS, PropKey, cleanName, folderSetting, intensityError, isTaken, propNameError, textSetting } from "./rules";
import { ask, confirm } from "./ui";
import { KindEditorModal } from "./kind-editor";
import { draftFromFrontmatter, kindProblems } from "./kinds";
import { aboutMarkdown } from "./about";

type FolderKey = "atlasFolder" | "kindsFolder" | "mapsFolder" | "defaultFolder" | "sourcesFolder" | "effortsFolder";
type TextKey = "newEffortTemplate" | "makeEffortTemplate" | "logFormat" | "dateFormat" | "timeFormat";

const FOLDER_KEYS: readonly string[] = ["atlasFolder", "kindsFolder", "mapsFolder", "defaultFolder", "sourcesFolder", "effortsFolder"];
// These may be blank; the other text settings fall back to their default.
const BLANK_OK: readonly string[] = ["newEffortTemplate", "makeEffortTemplate"];
// Control keys for the property names are "prop.kind", "prop.up", and so on.
const PROP_PREFIX = "prop.";
const PROP_LABELS: Record<PropKey, string> = {
	kind: "Kind property",
	up: "Map property",
	source: "Source property",
	effort: "Effort property",
	intensity: "Intensity property",
	from: "Started-from property",
};
const PROP_DESCS: Record<PropKey, string> = {
	kind: "Links a note to its Kind note.",
	up: "Lists the Maps a note is on.",
	source: "Holds the link of a note whose kind is a source.",
	effort: "On a note, links to the efforts made from it.",
	intensity: "Holds an effort's intensity.",
	from: "On an effort, links to the note it was made from.",
};

export class AceSettingTab extends PluginSettingTab {
	// Kept so the guide stays open when the tab redraws.
	private aboutOpen = false;
	private missingAnchor: HTMLElement | null = null;
	private missingEl: HTMLElement | null = null;

	constructor(
		app: App,
		private plugin: AcePlugin,
		private ace: Ace,
	) {
		super(app, plugin);
		// Refresh the Kinds list once the cache catches up after a Save or New kind.
		this.plugin.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file.parent?.path === this.s.kindsFolder && this.containerEl.isShown()) this.update();
			}),
		);
	}

	private get s(): AceSettings {
		return this.plugin.settings;
	}

	// Settings are changed in place: Ace holds the same object.
	getControlValue(key: string): unknown {
		if (key.startsWith(PROP_PREFIX)) return this.s.props[key.slice(PROP_PREFIX.length) as PropKey];
		return this.s[key as keyof AceSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key.startsWith(PROP_PREFIX)) {
			const k = key.slice(PROP_PREFIX.length) as PropKey;
			// Blank means the default name, as the placeholder shows.
			const v = typeof value === "string" && value.trim() !== "" ? value : DEFAULT_SETTINGS.props[k];
			const error = propNameError(v, PROP_KEYS.filter((o) => o !== k).map((o) => this.s.props[o]));
			// A name that can't be used is not saved: the old one stays in effect.
			if (error !== null) {
				new Notice(`${PROP_LABELS[k]}: ${error} Still using "${this.s.props[k]}".`);
				return;
			}
			// Remember the name notes still carry, so "Rename in existing notes" can find them.
			const from = this.s.renamedFrom[k] ?? this.s.props[k];
			this.s.props[k] = v.trim();
			if (from === this.s.props[k]) delete this.s.renamedFrom[k];
			else this.s.renamedFrom[k] = from;
			await this.plugin.saveSettings();
			return;
		}
		if (FOLDER_KEYS.includes(key)) {
			const k = key as FolderKey;
			this.s[k] = folderSetting(value, DEFAULT_SETTINGS[k]);
		} else {
			const k = key as TextKey;
			this.s[k] = textSetting(value, DEFAULT_SETTINGS[k], BLANK_OK.includes(k)).trim();
		}
		await this.plugin.saveSettings();
		// The "Create file" rows depend on the template paths.
		if (BLANK_OK.includes(key)) this.update();
	}

	private folder(key: FolderKey, name: string, desc: string): SettingDefinition {
		return { name, desc, control: { type: "folder", key, placeholder: DEFAULT_SETTINGS[key] } };
	}

	private effortTemplate(which: "new" | "make", name: string, desc: string): SettingDefinition[] {
		const key = which === "new" ? "newEffortTemplate" : "makeEffortTemplate";
		const missing = () => {
			const path = this.ace.effortTemplatePath(which);
			return path !== null && !(this.app.vault.getAbstractFileByPath(path) instanceof TFile);
		};
		return [
			{ name, desc, control: { type: "file", key, placeholder: "System/Templates/…" } },
			{
				name: `${name}: file not found`,
				desc: "Until it exists, the built-in text is used. Create it filled with that text, ready to edit.",
				searchable: false,
				visible: missing,
				render: (setting) => {
					setting.addButton((b) =>
						b.setButtonText("Create file").onClick(async () => {
							try {
								new Notice(await this.ace.createEffortTemplate(which));
							} catch (e) {
								new Notice(`Create file failed: ${e instanceof Error ? e.message : String(e)}`, 10000);
							}
							this.update();
						}),
					);
				},
			},
		];
	}

	private momentFormat(key: "dateFormat" | "timeFormat", name: string, desc: string): SettingDefinition {
		return {
			name,
			desc,
			render: (setting) => {
				const sample = setting.descEl.createDiv({ cls: "ace-format-sample" });
				setting.addMomentFormat((m) =>
					m
						.setDefaultFormat(DEFAULT_SETTINGS[key])
						.setPlaceholder(DEFAULT_SETTINGS[key])
						.setValue(this.s[key])
						.setSampleEl(sample)
						.onChange((v) => this.setControlValue(key, v)),
				);
			},
		};
	}

	private async addIntensity(): Promise<void> {
		const v = await ask(this.app, "New intensity", "", (x) => intensityError(x, this.s.intensities));
		if (v === null) return;
		this.s.intensities.push(v.trim());
		await this.plugin.saveSettings();
		this.update();
	}

	private async moveIntensity(from: number, to: number): Promise<void> {
		const [item] = this.s.intensities.splice(from, 1);
		this.s.intensities.splice(to, 0, item);
		await this.plugin.saveSettings();
		this.update();
	}

	private async deleteIntensity(i: number): Promise<void> {
		if (this.s.intensities.length === 1) {
			new Notice("Keep at least one intensity.");
			return;
		}
		this.s.intensities.splice(i, 1);
		await this.plugin.saveSettings();
		this.update();
	}

	private async createStarterKinds(): Promise<void> {
		try {
			const r = await this.ace.createStarterKinds();
			new Notice(
				r.created.length === 0
					? `No kinds created; all ${r.skipped.length} already there`
					: `Created ${r.created.length} kinds (${r.created.join(", ")}); skipped ${r.skipped.length} (already there)`,
			);
		} catch (e) {
			new Notice(`Create starter kinds failed: ${e instanceof Error ? e.message : String(e)}`, 10000);
		}
		this.update();
	}

	private async newKind(): Promise<void> {
		const taken = this.ace.basenames();
		const v = await ask(this.app, "New kind", "", (x) => {
			const n = cleanName(x);
			if (n === "") return "Name cannot be empty.";
			if (isTaken(n, taken)) return `A note named "${n}" already exists.`;
			return null;
		});
		if (v === null) return;
		try {
			const file = await this.ace.createKind(cleanName(v));
			this.update();
			new KindEditorModal(this.ace, file, () => this.update()).open();
		} catch (e) {
			new Notice(`New kind failed: ${e instanceof Error ? e.message : String(e)}`, 10000);
		}
	}

	private kindRows(): SettingDefinition[] {
		const folder = this.s.kindsFolder;
		const ctx = this.ace.problemContext();
		const rows: SettingDefinition[] = this.ace.kinds().map((k) => {
			const file = this.app.vault.getAbstractFileByPath(`${folder}/${k.name}.md`);
			const fm = file instanceof TFile ? this.ace.fm(file) : {};
			const n = kindProblems(draftFromFrontmatter(fm), fm, ctx).length;
			return {
				name: k.name,
				desc: n > 0 ? `${k.folder} · ⚠ ${n}` : k.folder,
				render: (setting) => {
					setting.nameEl.addClass("ace-kind-link");
					setting.nameEl.addEventListener("click", () => {
						if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
					});
					setting.addButton((b) =>
						b.setButtonText("Edit").onClick(() => {
							if (file instanceof TFile) new KindEditorModal(this.ace, file, () => this.update()).open();
						}),
					);
				},
			};
		});
		const none = rows.length === 0;
		rows.unshift({
			name: "New kind",
			desc: "Creates a Kind note and opens the editor.",
			searchable: false,
			render: (setting) => {
				setting.addButton((b) => b.setButtonText("New").onClick(() => this.newKind()));
			},
		});
		if (none) rows.push({ name: `No Kind notes in ${folder} yet.`, searchable: false });
		return rows;
	}

	// Redraws the faint "N missing folders" count beside the Create missing folders button.
	// The count sits outside the button, so a redraw of the tab does not clear it: remove the old one here.
	private refreshMissingCount(): void {
		this.missingEl?.remove();
		this.missingEl = null;
		const anchor = this.missingAnchor;
		if (!anchor || !anchor.isConnected) return;
		const n = this.ace.missingKindFolders().length;
		if (n === 0) return;
		this.missingEl = createSpan({ cls: "ace-missing-count", text: `${n} missing ${n === 1 ? "folder" : "folders"}` });
		anchor.before(this.missingEl);
	}

	update(): void {
		super.update();
		this.refreshMissingCount();
	}

	private async createMissingFolders(): Promise<void> {
		try {
			const made = await this.ace.createMissingKindFolders();
			new Notice(
				made.length === 0
					? "Every kind's folder already exists."
					: `Created ${made.length} ${made.length === 1 ? "folder" : "folders"}: ${made.join(", ")}`,
			);
		} catch (e) {
			new Notice(`Create missing folders failed: ${e instanceof Error ? e.message : String(e)}`, 10000);
		}
		this.update();
	}

	private about(): SettingDefinition {
		return {
			name: "About ACE",
			aliases: ["readme", "help", "guide", "LYT"],
			render: (setting) => {
				const details = setting.descEl.createEl("details", { cls: "ace-about" });
				details.open = this.aboutOpen;
				details.createEl("summary", { text: "How LYT and ACE work, how this plugin uses them, and the field syntax" });
				details.addEventListener("toggle", () => (this.aboutOpen = details.open));
				const owner = new Component();
				owner.load();
				void MarkdownRenderer.render(this.app, aboutMarkdown(this.s), details.createDiv(), "", owner);
				return () => owner.unload();
			},
		};
	}

	// Renames each changed property in the notes that still use its old name, after asking.
	// Asks, then removes old keys from Kind notes that already have the new key. Returns the result line, or null if cancelled.
	private async removeOldKeys(items: { from: string; to: string; files: TFile[] }[]): Promise<string | null> {
		const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
		const lines = items.flatMap((t) =>
			t.files.map((f) => {
				const fm = this.ace.fm(f);
				return `${f.basename} has ${t.from} (${show(fm[t.from])}) and ${t.to} (${show(fm[t.to])})`;
			}),
		);
		const ok = await confirm(
			this.app,
			"Remove old keys from Kind notes?",
			`${lines.join("; ")}. The old key and its value are removed. The new key stays as it is.`,
			"Remove old",
		);
		if (!ok) return null;
		const out: string[] = [];
		for (const t of items) {
			const r = await this.ace.removeOldProperty(t.files, t.from, t.to);
			let line = `Removed ${t.from} from ${r.removed === 1 ? "1 Kind note" : `${r.removed} Kind notes`}`;
			if (r.failed.length > 0) line += `, failed in ${r.failed.length} (${r.failed.join(", ")})`;
			out.push(line);
		}
		return out.join("\n");
	}

	private async renameInNotes(): Promise<void> {
		const plural = (n: number, kind = false) => (n === 1 ? `1 ${kind ? "Kind note" : "note"}` : `${n} ${kind ? "Kind notes" : "notes"}`);
		const names = (files: TFile[]) => files.map((f) => f.basename).join(", ");
		// `key` is set for a renamed ACE property; old Kind note keys have none.
		const found: { key?: PropKey; from: string; to: string; files: TFile[] }[] = [];
		for (const key of PROP_KEYS) {
			const from = this.s.renamedFrom[key];
			if (from === undefined) continue;
			const files = this.ace.notesWithProperty(from);
			if (files.length > 0) found.push({ key, from, to: this.s.props[key], files });
			else delete this.s.renamedFrom[key];
		}
		found.push(...this.ace.oldKindKeys());
		// A note that already has the new name can't be renamed without losing a value: report it, don't offer it.
		const todo: ((typeof found)[number] & { clash: number })[] = [];
		const both: string[] = [];
		// Kind notes that have an old key and its new one: the old key can be removed, after asking.
		const removable: { from: string; to: string; files: TFile[] }[] = [];
		for (const t of found) {
			const has = (f: TFile) => Object.prototype.hasOwnProperty.call(this.ace.fm(f), t.to);
			const clash = t.files.filter(has);
			const files = t.files.filter((f) => !has(f));
			if (clash.length > 0 && t.key === undefined) removable.push({ from: t.from, to: t.to, files: clash });
			else if (clash.length > 0) both.push(`${names(clash)} ${clash.length === 1 ? "has" : "have"} both ${t.from} and ${t.to}`);
			if (files.length > 0) todo.push({ ...t, files, clash: clash.length });
		}
		const leftAlone = both.length === 0 ? "" : `${both.join("; ")}. Remove one of the two by hand in ${both.length === 1 ? "that note" : "those notes"}.`;
		if (todo.length === 0) {
			await this.plugin.saveSettings();
			if (removable.length > 0) {
				const done = await this.removeOldKeys(removable);
				if (done !== null) new Notice([done, leftAlone === "" ? "" : `Not renamed: ${leftAlone}`].filter((x) => x !== "").join("\n"), 10000);
				this.update();
				return;
			}
			new Notice(
				leftAlone === "" ? "No notes use an old property name or an old Kind note key." : `Nothing to rename. ${leftAlone}`,
				leftAlone === "" ? undefined : 10000,
			);
			return;
		}
		const lines = todo
			.map((t) => `${t.from} becomes ${t.to} in ${t.key === undefined ? `${plural(t.files.length, true)} (${names(t.files)})` : plural(t.files.length)}`)
			.join("; ");
		const ok = await confirm(
			this.app,
			"Rename properties in existing notes?",
			`${lines}. Only the property's name changes; its value stays. Views inside existing Map and Kind notes are not changed.${leftAlone === "" ? "" : ` Not renamed: ${leftAlone}`}`,
			"Rename",
		);
		if (!ok) return;
		const out: string[] = [];
		for (const t of todo) {
			try {
				const r = await this.ace.renameProperty(t.from, t.to, t.files);
				let line = `${t.from} to ${t.to}: renamed in ${plural(r.renamed)}`;
				if (r.skipped.length > 0) line += `, skipped ${r.skipped.length} that already have ${t.to} (${r.skipped.join(", ")})`;
				if (r.failed.length > 0) line += `, failed in ${r.failed.length} (${r.failed.join(", ")})`;
				out.push(line);
				// Keep the old name on record while any note still carries it.
				if (t.key !== undefined && t.clash === 0 && r.skipped.length === 0 && r.failed.length === 0) delete this.s.renamedFrom[t.key];
			} catch (e) {
				out.push(`${t.from} to ${t.to} failed: ${e instanceof Error ? e.message : String(e)}`);
			}
		}
		if (leftAlone !== "") out.push(`Not renamed: ${leftAlone}`);
		if (removable.length > 0) {
			const done = await this.removeOldKeys(removable);
			if (done !== null) out.push(done);
		}
		await this.plugin.saveSettings();
		new Notice(out.join("\n"), 10000);
		this.update();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			this.about(),
			this.folder("atlasFolder", "Atlas folder", "Where your notes live. New Map lists notes in this folder."),
			this.folder("kindsFolder", "Kinds folder", "Kind notes live here."),
			this.folder("mapsFolder", "Maps folder", "Used when no Map kind exists, and for the Map kind note the plugin creates."),
			this.folder("defaultFolder", "Default folder", "New notes go here when their kind has no folder."),
			this.folder("sourcesFolder", "Sources folder", "Starter kinds that are sources use subfolders of this folder."),
			{
				type: "group",
				heading: "Efforts",
				items: [
					this.folder("effortsFolder", "Efforts folder", "Efforts are filed here."),
					...this.effortTemplate(
						"new",
						"New effort template",
						"Body of a new effort. {{date}} and {{time}} are filled in. Blank uses the built-in text.",
					),
					...this.effortTemplate(
						"make",
						"Make effort template",
						"Body of an effort made from a note. {{note}} becomes a link to that note; {{date}} and {{time}} are filled in. Blank uses the built-in text.",
					),
				],
			},
			{
				type: "group",
				heading: "Property names",
				items: [
					{
						name: "These are the properties ACE writes on your notes.",
						desc: "Changing a name affects what ACE reads and writes from now on. Properties already in your notes keep the old name until you press Check notes below. Views inside existing Map and Kind notes keep the old name until you edit them.",
						searchable: false,
					},
					...PROP_KEYS.map(
						(k): SettingDefinition => ({
							name: PROP_LABELS[k],
							desc: PROP_DESCS[k],
							control: { type: "text", key: PROP_PREFIX + k, placeholder: DEFAULT_SETTINGS.props[k] },
						}),
					),
					{
						name: "Rename in existing notes",
						desc: "After changing a name above, renames the old property in every note that has it. Also renames old keys on Kind notes, such as default_up to default_map. Shows how many notes will change and asks first.",
						render: (setting) => {
							setting.addButton((b) => b.setButtonText("Check notes").onClick(() => void this.renameInNotes()));
						},
					},
				],
			},
			{
				type: "list",
				heading: "Intensities",
				emptyState: "No intensities.",
				addItem: { name: "Add intensity", action: () => void this.addIntensity() },
				onReorder: (from, to) => void this.moveIntensity(from, to),
				onDelete: (i) => void this.deleteIntensity(i),
				items: this.s.intensities.map((name) => ({ name })),
			},
			{
				type: "group",
				heading: "Log",
				items: [
					{
						name: "Log format",
						desc: "Line added by Log. You can use {{date}} and {{time}}.",
						control: { type: "text", key: "logFormat", placeholder: DEFAULT_SETTINGS.logFormat },
					},
					this.momentFormat("dateFormat", "Date format", "Moment.js format for {{date}}."),
					this.momentFormat("timeFormat", "Time format", "Moment.js format for {{time}}."),
				],
			},
			{
				type: "group",
				items: [
					{
						name: "Create starter kinds",
						desc: "Adds the standard Kind notes and the Map kind. Existing notes are never overwritten.",
						render: (setting) => {
							setting.addButton((b) => b.setButtonText("Create").onClick(() => this.createStarterKinds()));
						},
					},
				],
			},
			{
				type: "group",
				heading: "Kinds",
				extraButtons: [
					(b) => {
						b.setIcon("folder-plus")
							.setTooltip("Create missing folders")
							.onClick(() => void this.createMissingFolders());
						this.missingAnchor = b.extraSettingsEl;
						this.refreshMissingCount();
					},
				],
				search: {
					placeholder: "Filter kinds",
					match: (def, q) => def.name.toLowerCase().includes(q.toLowerCase()),
				},
				items: this.kindRows(),
			},
		];
	}
}
