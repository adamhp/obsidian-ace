import { Notice, Plugin } from "obsidian";
import { Ace } from "./vault";
import { AceSettings, DEFAULT_SETTINGS, normalizeSettings } from "./rules";
import { COMMANDS } from "./commands";
import { AceSettingTab } from "./settings-tab";

export default class AcePlugin extends Plugin {
	settings: AceSettings = { ...DEFAULT_SETTINGS };

	async loadSettings() {
		// Mutate this.settings in place, never reassign: Ace holds the reference once built.
		let data: unknown = null;
		try {
			data = await this.loadData();
		} catch (e) {
			console.error("ACE Actions: could not read data.json, using defaults", e);
		}
		this.settings = normalizeSettings(data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onload() {
		await this.loadSettings();
		const ace = new Ace(this.app, this.settings);
		this.addSettingTab(new AceSettingTab(this.app, this, ace));
		// Map is part of ACE, so its Kind note is created by default. Never overwrites an existing note.
		this.app.workspace.onLayoutReady(() => {
			ace.ensureMapKind().catch((e) => console.error("ACE Actions: could not create the Map kind", e));
		});
		const fail = (name: string, e: unknown) => {
			console.error(`ACE Actions: ${name} failed`, e);
			new Notice(`${name} failed: ${e instanceof Error ? e.message : String(e)}`, 10000);
		};
		for (const c of COMMANDS) {
			const { run, editor } = c;
			this.addCommand({
				id: c.id,
				name: c.name,
				...(run && {
					callback: () => {
						run(ace).catch((e) => fail(c.name, e));
					},
				}),
				...(editor && {
					editorCallback: (ed) => {
						try {
							editor(ace, ed);
						} catch (e) {
							fail(c.name, e);
						}
					},
				}),
			});
		}
	}
}
