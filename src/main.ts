import { Notice, Plugin } from "obsidian";
import { Ace } from "./vault";
import { AceSettings, DEFAULT_SETTINGS, normalizeSettings } from "./rules";
import { COMMANDS } from "./commands";
import { AceSettingTab } from "./settings-tab";

export default class AcePlugin extends Plugin {
	settings: AceSettings = { ...DEFAULT_SETTINGS };

	async loadSettings() {
		this.settings = normalizeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onload() {
		await this.loadSettings();
		const ace = new Ace(this.app, this.settings);
		this.addSettingTab(new AceSettingTab(this.app, this, ace));
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
