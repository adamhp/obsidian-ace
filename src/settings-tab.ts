import { App, Notice, PluginSettingTab, SettingDefinition, SettingDefinitionItem, TFile } from "obsidian";
import type AcePlugin from "./main";
import type { Ace } from "./vault";
import { AceSettings, DEFAULT_SETTINGS, folderSetting, intensityError, textSetting } from "./rules";
import { ask } from "./ui";

type FolderKey = "atlasFolder" | "kindsFolder" | "mapsFolder" | "defaultFolder" | "sourcesFolder" | "effortsFolder";
type TextKey = "newEffortText" | "makeEffortText" | "logFormat" | "dateFormat" | "timeFormat";

const FOLDER_KEYS: readonly string[] = ["atlasFolder", "kindsFolder", "mapsFolder", "defaultFolder", "sourcesFolder", "effortsFolder"];
// These may be blank; the other text settings fall back to their default.
const BLANK_OK: readonly string[] = ["newEffortText", "makeEffortText"];

export class AceSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: AcePlugin,
		private ace: Ace,
	) {
		super(app, plugin);
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
			this.s[k] = textSetting(value, DEFAULT_SETTINGS[k], BLANK_OK.includes(k));
		}
		await this.plugin.saveSettings();
	}

	private folder(key: FolderKey, name: string, desc: string): SettingDefinition {
		return { name, desc, control: { type: "folder", key, placeholder: DEFAULT_SETTINGS[key] } };
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

	private kindRows(): SettingDefinition[] {
		const folder = this.s.kindsFolder;
		const rows: SettingDefinition[] = this.ace.kinds().map((k) => ({
			name: k.name,
			desc: k.folder,
			action: () => {
				const file = this.app.vault.getAbstractFileByPath(`${folder}/${k.name}.md`);
				if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
			},
		}));
		if (rows.length === 0) rows.push({ name: `No Kind notes in ${folder} yet.`, searchable: false });
		rows.push({
			name: "Create starter kinds",
			desc: "Adds the standard Kind notes and the Map kind. Existing notes are never overwritten.",
			searchable: false,
			render: (setting) => {
				setting.addButton((b) => b.setButtonText("Create").onClick(() => this.createStarterKinds()));
			},
		});
		return rows;
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
					{
						type: "page",
						name: "Effort text",
						desc: "The body of new efforts.",
						items: [
							{
								name: "New effort text",
								desc: "Body of a new effort.",
								control: { type: "textarea", key: "newEffortText", rows: 8 },
							},
							{
								name: "Make effort text",
								desc: "Body of the new effort. {{note}} becomes a link to the original note.",
								control: { type: "textarea", key: "makeEffortText", rows: 8 },
							},
						],
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
				heading: "Kinds",
				search: {
					placeholder: "Filter kinds",
					match: (def, q) => def.name.toLowerCase().includes(q.toLowerCase()),
				},
				items: this.kindRows(),
			},
		];
	}
}
