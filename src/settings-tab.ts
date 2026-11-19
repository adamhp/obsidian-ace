import { AbstractInputSuggest, App, Notice, PluginSettingTab, Setting, TFile, TFolder } from "obsidian";
import type AcePlugin from "./main";
import type { Ace } from "./vault";
import { AceSettings, DEFAULT_SETTINGS, folderSetting, parseIntensities } from "./rules";

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		private input: HTMLInputElement,
	) {
		super(app, input);
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getAllFolders()
			.filter((f) => f.path.toLowerCase().includes(q))
			.slice(0, 50);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.input.value = folder.path;
		this.input.dispatchEvent(new Event("input"));
		this.close();
	}
}

type FolderKey = "atlasFolder" | "kindsFolder" | "mapsFolder" | "defaultFolder" | "sourcesFolder" | "effortsFolder";
type TextKey = "newEffortText" | "makeEffortText" | "logFormat" | "dateFormat" | "timeFormat";

export class AceSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: AcePlugin,
		private ace: Ace,
	) {
		super(app, plugin);
	}

	private folder(el: HTMLElement, key: FolderKey, name: string, desc: string): void {
		const s: AceSettings = this.plugin.settings;
		new Setting(el)
			.setName(name)
			.setDesc(desc)
			.addText((t) => {
				t.setPlaceholder(DEFAULT_SETTINGS[key])
					.setValue(s[key])
					.onChange(async (v) => {
						s[key] = folderSetting(v, DEFAULT_SETTINGS[key]);
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, t.inputEl);
			});
	}

	private text(el: HTMLElement, key: TextKey, name: string, desc: string, area = false): void {
		const s: AceSettings = this.plugin.settings;
		const set = new Setting(el).setName(name).setDesc(desc);
		const onChange = async (v: string) => {
			s[key] = v === "" && !(key === "newEffortText" || key === "makeEffortText") ? DEFAULT_SETTINGS[key] : v;
			await this.plugin.saveSettings();
		};
		if (area) {
			set.addTextArea((t) => {
				t.setValue(s[key]).onChange(onChange);
				t.inputEl.rows = 8;
			});
		} else {
			set.addText((t) => t.setPlaceholder(DEFAULT_SETTINGS[key]).setValue(s[key]).onChange(onChange));
		}
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl).setName("Folders").setHeading();
		this.folder(containerEl, "atlasFolder", "Atlas folder", "Where your notes live. New Map lists notes in this folder.");
		this.folder(containerEl, "kindsFolder", "Kinds folder", "Kind notes live here.");
		this.folder(containerEl, "mapsFolder", "Maps folder", "New Maps go here unless the Map kind sets its own folder.");
		this.folder(containerEl, "defaultFolder", "Default folder", "New notes go here when their kind has no folder.");
		this.folder(containerEl, "sourcesFolder", "Sources folder", "Starter kinds that are sources use subfolders of this folder.");

		new Setting(containerEl).setName("Efforts").setHeading();
		this.folder(containerEl, "effortsFolder", "Efforts folder", "Efforts are filed here.");
		new Setting(containerEl)
			.setName("Intensities")
			.setDesc("Comma-separated list of effort intensities. Avoid the characters [ ] { } : # |.")
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_SETTINGS.intensities.join(", "))
					.setValue(s.intensities.join(", "))
					.onChange(async (v) => {
						const list = parseIntensities(v);
						s.intensities = list.length > 0 ? list : [...DEFAULT_SETTINGS.intensities];
						await this.plugin.saveSettings();
					}),
			);
		this.text(containerEl, "newEffortText", "New effort text", "Body of a new effort. You can use {{note}}, {{date}} and {{time}}.", true);
		this.text(containerEl, "makeEffortText", "Make effort text", "Body added when you make a note into an effort. You can use {{note}}, {{date}} and {{time}}.", true);

		new Setting(containerEl).setName("Log").setHeading();
		this.text(containerEl, "logFormat", "Log format", "Line added by Log. You can use {{date}} and {{time}}.");
		this.text(containerEl, "dateFormat", "Date format", "Moment.js format for {{date}}, for example YYYY-MM-DD.");
		this.text(containerEl, "timeFormat", "Time format", "Moment.js format for {{time}}, for example HH:mm.");

		new Setting(containerEl).setName("Kinds").setHeading();
		const kinds = this.ace.kinds();
		const info = new Setting(containerEl);
		if (kinds.length === 0) {
			info.setName(`No Kind notes in ${s.kindsFolder} yet.`);
		} else {
			info.setName(`Found ${kinds.length} kinds in ${s.kindsFolder}`);
			const list = info.descEl.createDiv();
			for (const k of kinds) {
				const file = this.app.vault.getAbstractFileByPath(`${s.kindsFolder}/${k.name}.md`);
				const a = list.createEl("a", { text: k.name, cls: "ace-kind-link" });
				list.appendText(" ");
				a.addEventListener("click", (e) => {
					e.preventDefault();
					if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
				});
			}
		}
		new Setting(containerEl)
			.setName("Create starter kinds")
			.setDesc("Adds the standard Kind notes and the Map kind. Existing notes are never overwritten.")
			.addButton((b) =>
				b.setButtonText("Create").onClick(async () => {
					try {
						const r = await this.ace.createStarterKinds();
						new Notice(
							`Created ${r.created.length} kinds (${r.created.join(", ")}); skipped ${r.skipped.length} (already there)`,
						);
					} catch (e) {
						new Notice(`Create starter kinds failed: ${e instanceof Error ? e.message : String(e)}`, 10000);
					}
					this.display();
				}),
			);
	}
}
