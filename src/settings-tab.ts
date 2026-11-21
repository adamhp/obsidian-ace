import { App, ButtonComponent, Notice, PluginSettingTab, Setting, SettingDefinition, SettingDefinitionItem, TFile, normalizePath } from "obsidian";
import type AcePlugin from "./main";
import type { Ace } from "./vault";
import { AceSettings, DEFAULT_SETTINGS, PROP_KEYS, PropKey, cleanName, folderSetting, intensityError, isTaken, propNameError, textSetting } from "./rules";
import { ask, confirm, confirmTyped } from "./ui";
import { KindEditorModal } from "./kind-editor";
import { draftFromFrontmatter, kindProblems } from "./kinds";
import { STARTER_KINDS } from "./starter";

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
	private missingAnchor: HTMLElement | null = null;
	private missingEl: HTMLElement | null = null;
	private renameWarnEl: HTMLElement | null = null;
	private renameButton: ButtonComponent | null = null;

	constructor(
		app: App,
		private plugin: AcePlugin,
		private ace: Ace,
	) {
		super(app, plugin);
		// Obsidian stores the definitions when the tab is added, before the vault has loaded,
		// and does not ask for them again when the tab opens. So the Kinds list is rebuilt here:
		// once the vault is ready, and whenever a Kind note is added, edited, moved or deleted.
		const inKinds = (path?: string) => path === this.s.kindsFolder;
		this.app.workspace.onLayoutReady(() => this.update());
		this.plugin.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (inKinds(file.parent?.path)) this.update();
				// A rename by Check notes lands in the cache note by note; keep the warning's counts in step.
				else if (this.containerEl.isShown()) this.refreshRenameWarning();
			}),
		);
		this.plugin.registerEvent(
			this.app.metadataCache.on("deleted", (file) => {
				if (inKinds(file.parent?.path)) this.update();
			}),
		);
		this.plugin.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				const oldParent = oldPath.includes("/") ? oldPath.slice(0, oldPath.lastIndexOf("/")) : "/";
				if (inKinds(file.parent?.path) || inKinds(oldParent)) this.update();
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
			// No redraw here: that would take the cursor out of the box while typing.
			this.refreshRenameWarning();
			return;
		}
		if (FOLDER_KEYS.includes(key)) {
			const k = key as FolderKey;
			this.s[k] = normalizePath(folderSetting(value, DEFAULT_SETTINGS[k]));
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

	// Says which starter kinds the button would create, and which are already there.
	private starterDesc(): string {
		const missing = this.ace.missingStarterKinds();
		const have = STARTER_KINDS.filter((k) => !missing.includes(k));
		if (missing.length === 0) return `All starter kinds already exist: ${have.join(", ")}.`;
		const there = have.length === 0 ? "" : ` Already there: ${have.join(", ")}.`;
		return `Will create: ${missing.join(", ")}.${there} Existing notes are never overwritten.`;
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

	// Asks, then removes old keys from Kind notes that already have the new key. Returns the result line, or null if cancelled.
	private async removeOldKeys(items: { from: string; to: string; files: TFile[] }[]): Promise<string | null> {
		const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
		const ok = await confirm(
			this.app,
			"Remove old keys from Kind notes?",
			(el) => {
				el.createEl("p", { text: "These Kind notes have an old key and its new key. The old key and its value are removed. The new key stays as it is." });
				const ul = el.createEl("ul", { cls: "ace-check-list" });
				for (const t of items) {
					for (const f of t.files) {
						const fm = this.ace.fm(f);
						const li = ul.createEl("li");
						li.createEl("strong", { text: f.basename });
						li.appendText(`: remove ${t.from} (${show(fm[t.from])}), keep ${t.to} (${show(fm[t.to])})`);
					}
				}
			},
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

	// What Check notes would do: renames, notes it must leave alone, and old Kind keys it can remove.
	private pendingRenames() {
		type Item = { key?: PropKey; from: string; to: string; files: TFile[] };
		// `key` is set for a renamed ACE property; old Kind note keys have none.
		const found: Item[] = [];
		for (const key of PROP_KEYS) {
			const from = this.s.renamedFrom[key];
			if (from === undefined) continue;
			found.push({ key, from, to: this.s.props[key], files: this.ace.notesWithProperty(from) });
		}
		found.push(...this.ace.oldKindKeys());
		const todo: (Item & { clash: number })[] = [];
		// Notes that have both names: renaming would lose a value, so they are reported, not renamed.
		const both: Item[] = [];
		// Kind notes that have an old key and its new one: the old key can be removed, after asking.
		const removable: Item[] = [];
		for (const t of found) {
			const has = (f: TFile) => Object.prototype.hasOwnProperty.call(this.ace.fm(f), t.to);
			const clash = t.files.filter(has);
			const files = t.files.filter((f) => !has(f));
			if (clash.length > 0) (t.key === undefined ? removable : both).push({ ...t, files: clash });
			if (files.length > 0) todo.push({ ...t, files, clash: clash.length });
		}
		return { found, todo, both, removable };
	}

	// Shows, under the Check notes row, what is waiting to be renamed. Runs without redrawing the tab.
	private refreshRenameWarning(): void {
		const el = this.renameWarnEl;
		if (!el || !el.isConnected) return;
		el.empty();
		const plural = (n: number) => (n === 1 ? "1 note still uses" : `${n} notes still use`);
		const p = this.pendingRenames();
		for (const t of p.found) {
			if (t.files.length === 0) continue;
			el.createDiv({
				text: t.key === undefined
					? `${t.files.length === 1 ? "1 Kind note has" : `${t.files.length} Kind notes have`} the old key ${t.from}.`
					: `${plural(t.files.length)} ${t.from}, which is now ${t.to}. ACE no longer reads it there.`,
			});
		}
		if (el.childElementCount > 0) el.createDiv({ text: "Press Check notes to update them." });
		this.renameButton?.buttonEl.toggleClass("mod-cta", el.childElementCount > 0);
	}

	// Danger zone: deletes every old property, with its value, from every note that still has it.
	private async removeAllOld(): Promise<void> {
		const count = (n: number) => (n === 1 ? "1 note" : `${n} notes`);
		const { found } = this.pendingRenames();
		const items = found
			.filter((t) => t.files.length > 0)
			.map((t) => ({
				...t,
				// Notes where the old property is the only copy: they have no property under the new name.
				only: t.files.filter((f) => !Object.prototype.hasOwnProperty.call(this.ace.fm(f), t.to)).length,
			}));
		if (items.length === 0) {
			new Notice("No note has an old property or an old Kind note key.");
			return;
		}
		const ok = await confirmTyped(
			this.app,
			"Delete all old properties?",
			(el) => {
				el.createEl("p", {
					cls: "mod-warning",
					text: "This deletes each old property and its value from every note that has it. It cannot be undone from here. Check notes renames instead and keeps the values.",
				});
				const ul = el.createEl("ul", { cls: "ace-check-list" });
				for (const t of items) {
					const li = ul.createEl("li");
					li.createEl("strong", { text: `Delete ${t.from} from ${count(t.files.length)}` });
					if (t.only > 0) {
						li.appendText(`. ${count(t.only)} of them ${t.only === 1 ? "has" : "have"} no ${t.to}, so ${t.only === 1 ? "its" : "their"} value is lost.`);
					} else {
						li.appendText(`. All of them also have ${t.to}, which stays.`);
					}
				}
			},
			"yes",
			"Delete",
		);
		if (!ok) return;
		const out: string[] = [];
		for (const t of items) {
			const r = await this.ace.removeOldProperty(t.files, t.from);
			let line = `Deleted ${t.from} from ${count(r.removed)}`;
			if (r.failed.length > 0) line += `, failed in ${r.failed.length} (${r.failed.join(", ")})`;
			else if (t.key !== undefined) delete this.s.renamedFrom[t.key];
			out.push(line);
		}
		await this.plugin.saveSettings();
		new Notice(out.join("\n"), 10000);
		this.update();
	}

	// Renames each changed property in the notes that still use its old name, after asking.
	private async renameInNotes(): Promise<void> {
		const count = (n: number, kind = false) => (n === 1 ? `1 ${kind ? "Kind note" : "note"}` : `${n} ${kind ? "Kind notes" : "notes"}`);
		const { found, todo, both, removable } = this.pendingRenames();
		for (const t of found) if (t.key !== undefined && t.files.length === 0) delete this.s.renamedFrom[t.key];
		const notRenamed = both.map((t) => `${count(t.files.length)} with both ${t.from} and ${t.to}`).join("; ");
		if (todo.length === 0 && removable.length === 0 && both.length === 0) {
			await this.plugin.saveSettings();
			new Notice("No notes use an old property name or an old Kind note key.");
			this.refreshRenameWarning();
			return;
		}
		const out: string[] = [];
		if (todo.length > 0 || both.length > 0) {
			let danger = false;
			const ok = await confirm(
				this.app,
				todo.length > 0 ? "Rename properties in existing notes?" : "Nothing to rename",
				(el, close) => {
					if (todo.length > 0) {
						el.createEl("p", { text: "Only the property's name changes. Its value stays. Views inside existing Map and Kind notes are not changed." });
						const ul = el.createEl("ul", { cls: "ace-check-list" });
						for (const t of todo) {
							const li = ul.createEl("li");
							li.createEl("strong", { text: `${t.from} becomes ${t.to}` });
							li.appendText(t.key === undefined ? ` in ${count(t.files.length, true)}: ${t.files.map((f) => f.basename).join(", ")}` : ` in ${count(t.files.length)}`);
						}
					}
					for (const t of both) {
						el.createEl("p", {
							cls: "mod-warning",
							text: `Not renamed: ${count(t.files.length)} already ${t.files.length === 1 ? "has" : "have"} both ${t.from} and ${t.to}. Remove one of the two by hand in ${t.files.length === 1 ? "that note" : "each of them"}.`,
						});
						const ul = el.createEl("ul", { cls: "ace-check-list ace-check-scroll" });
						for (const f of [...t.files].sort((a, b) => a.path.localeCompare(b.path))) ul.createEl("li", { text: f.path.replace(/\.md$/i, "") });
					}
					const zone = el.createDiv({ cls: "ace-danger-zone" });
					new Setting(zone)
						.setName("Danger zone: remove all old properties")
						.setDesc("Deletes every old property, with its value, instead of renaming it. Shows what will be deleted and asks you to type yes.")
						.addButton((b) =>
							b.setButtonText("Remove all old").setDestructive().onClick(() => {
								danger = true;
								close();
							}),
						);
				},
				todo.length > 0 ? "Rename" : "OK",
			);
			if (danger) {
				await this.removeAllOld();
				return;
			}
			if (!ok && todo.length > 0) return;
			for (const t of todo) {
				try {
					const r = await this.ace.renameProperty(t.from, t.to, t.files);
					let line = `${t.from} to ${t.to}: renamed in ${count(r.renamed)}`;
					if (r.skipped.length > 0) line += `, skipped ${r.skipped.length} that already have ${t.to}`;
					if (r.failed.length > 0) line += `, failed in ${r.failed.length} (${r.failed.join(", ")})`;
					out.push(line);
					// Keep the old name on record while any note still carries it.
					if (t.key !== undefined && t.clash === 0 && r.skipped.length === 0 && r.failed.length === 0) delete this.s.renamedFrom[t.key];
				} catch (e) {
					out.push(`${t.from} to ${t.to} failed: ${e instanceof Error ? e.message : String(e)}`);
				}
			}
			if (todo.length > 0 && notRenamed !== "") out.push(`Not renamed: ${notRenamed}`);
		}
		if (removable.length > 0) {
			const done = await this.removeOldKeys(removable);
			if (done !== null) out.push(done);
		}
		await this.plugin.saveSettings();
		if (out.length > 0) new Notice(out.join("\n"), 10000);
		this.update();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
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
							setting.addButton((b) => {
								this.renameButton = b;
								b.setButtonText("Check notes").onClick(() => void this.renameInNotes());
							});
							this.renameWarnEl = setting.descEl.createDiv({ cls: "ace-rename-warning mod-warning" });
							this.refreshRenameWarning();
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
						desc: this.starterDesc(),
						render: (setting) => {
							setting.addButton((b) =>
								b
									.setButtonText("Create")
									.setDisabled(this.ace.missingStarterKinds().length === 0)
									.onClick(() => this.createStarterKinds()),
							);
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
