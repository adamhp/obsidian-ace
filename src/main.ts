import { Notice, Plugin } from "obsidian";
import { Ace } from "./vault";
import { COMMANDS } from "./commands";

export default class AcePlugin extends Plugin {
	async onload() {
		const ace = new Ace(this.app);
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
