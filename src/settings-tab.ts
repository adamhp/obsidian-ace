import { App, Notice, PluginSettingTab, SettingDefinition, SettingDefinitionItem, TFile } from "obsidian";
import type AcePlugin from "./main";
import type { Ace } from "./vault";
import { AceSettings, DEFAULT_SETTINGS, cleanName, folderSetting, intensityError, isTaken, textSetting } from "./rules";
import { ask } from "./ui";
import { KindEditorModal } from "./kind-editor";
import { draftFromFrontmatter, kindProblems } from "./kinds";

type FolderKey = "atlasFolder" | "kindsFolder" | "mapsFolder" | "defaultFolder" | "sourcesFolder" | "effortsFolder";
type TextKey = "newEffortTemplate" | "makeEffortTemplate" | "logFormat" | "dateFormat" | "timeFormat";

const FOLDER_KEYS: readonly string[] = ["atlasFolder", "kindsFolder", "mapsFolder", "defaultFolder", "sourcesFolder", "effortsFolder"];
// These may be blank; the other text settings fall back to their default.
const BLANK_OK: readonly string[] = ["newEffortTemplate", "makeEffortTemplate"];

export class AceSettingTab extends PluginSettingTab {
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
		return this.s[key as keyof AceSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
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
					(b) =>
						b
							.setIcon("folder-plus")
							.setTooltip("Create missing folders")
							.onClick(() => void this.createMissingFolders()),
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
