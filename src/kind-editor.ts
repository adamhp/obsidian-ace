import { AbstractInputSuggest, App, Modal, Notice, Setting, TFile, TFolder, getFrontMatterInfo, parseYaml } from "obsidian";
import type { Ace } from "./vault";
import { FieldDraft, KindDraft, applyDraft, draftFromFrontmatter, fieldNameError, kindProblems, propType } from "./kinds";
import { cleanName, isTaken } from "./rules";
import { ask, confirm } from "./ui";

class PathSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		private input: HTMLInputElement,
		private paths: () => string[],
		private onPick: (v: string) => void,
	) {
		super(app, input);
	}

	getSuggestions(q: string): string[] {
		const n = q.toLowerCase();
		return this.paths().filter((p) => p.toLowerCase().includes(n));
	}

	renderSuggestion(p: string, el: HTMLElement): void {
		el.setText(p);
	}

	selectSuggestion(p: string): void {
		this.input.value = p;
		this.onPick(p);
		this.close();
	}
}

function move<T>(list: T[], from: number, to: number): void {
	if (to < 0 || to >= list.length) return;
	const [x] = list.splice(from, 1);
	list.splice(to, 0, x);
}

export class KindEditorModal extends Modal {
	private draft!: KindDraft;
	private fm: Record<string, unknown> = {};
	private initialDraft!: KindDraft;
	private types: Record<string, string> = {};
	private problemsEl!: HTMLElement;

	constructor(
		private ace: Ace,
		private file: TFile,
		private onDone: () => void,
	) {
		super(ace.app);
	}

	async onOpen(): Promise<void> {
		// Read from disk: the metadata cache can lag behind a save or a hand edit.
		try {
			const text = await this.app.vault.read(this.file);
			const parsed: unknown = parseYaml(getFrontMatterInfo(text).frontmatter);
			this.fm = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
		} catch (e) {
			new Notice(`Couldn't read ${this.file.basename}: ${e instanceof Error ? e.message : String(e)}`, 10000);
			this.close();
			return;
		}
		this.draft = draftFromFrontmatter(this.fm);
		this.initialDraft = structuredClone(this.draft);
		this.types = await this.ace.propTypes();
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private dirty(): boolean {
		return JSON.stringify(this.draft) !== JSON.stringify(this.initialDraft);
	}

	private render(): void {
		const el = this.contentEl;
		el.empty();
		this.titleEl.setText(`Edit kind: ${this.file.basename}`);
		const d = this.draft;

		new Setting(el)
			.setName("Folder")
			.setDesc("Where new notes of this kind go. Blank uses the default folder.")
			.addText((t) => {
				t.setPlaceholder(this.ace.settings.defaultFolder).setValue(d.folder).onChange((v) => {
					d.folder = v.trim();
					this.renderProblems();
				});
				new PathSuggest(
					this.app,
					t.inputEl,
					() => this.app.vault.getAllFolders(false).map((f: TFolder) => f.path),
					(v) => {
						d.folder = v;
						this.renderProblems();
					},
				);
			});
		new Setting(el).setName("Is a source").setDesc("Ask for a link and write it to source.").addToggle((t) =>
			t.setValue(d.isSource).onChange((v) => (d.isSource = v)),
		);
		const maps = this.ace.maps().map((m) => m.basename);
		const up = d.defaultUp;
		const mapMatch = up === null || up === "" ? undefined : maps.find((m) => m.toLowerCase() === up.toLowerCase());
		if (up !== null && up !== "" && mapMatch === undefined) maps.unshift(up);
		new Setting(el).setName("Default Map").setDesc("Offered first when picking a Map.").addDropdown((dd) => {
			dd.addOption("", "(none)");
			for (const m of maps) dd.addOption(m, m);
			dd.setValue(mapMatch ?? d.defaultUp ?? "").onChange((v) => {
				d.defaultUp = v === "" ? null : v;
				this.renderProblems();
			});
		});

		this.renderFields(el);

		new Setting(el)
			.setName("Title template")
			.setDesc(`Builds the note name. Fields: ${d.fields.map((f) => `{{${f.name}}}`).join(", ") || "none yet"}.`)
			.addText((t) =>
				t.setValue(d.titleTemplate).onChange((v) => {
					d.titleTemplate = v;
					this.renderProblems();
				}),
			);
		new Setting(el)
			.setName("Template")
			.setDesc("A markdown file whose body is copied into new notes.")
			.addText((t) => {
				t.setValue(d.template).onChange((v) => {
					d.template = v.trim();
					this.renderProblems();
				});
				new PathSuggest(
					this.app,
					t.inputEl,
					() => this.app.vault.getMarkdownFiles().map((f) => f.path),
					(v) => {
						d.template = v;
						this.renderProblems();
					},
				);
			});

		this.problemsEl = el.createDiv({ cls: "ace-problems" });
		this.renderProblems();

		const isMap = this.file.basename.toLowerCase() === "map";
		if (isMap) el.createEl("p", { text: "Map is part of ACE and can't be renamed or deleted.", cls: "setting-item-description" });
		const bar = new Setting(el).addButton((b) => b.setButtonText("Open note").onClick(() => void this.openNote()));
		if (!isMap) {
			bar
				.addButton((b) => b.setButtonText("Rename").onClick(() => void this.rename()))
				.addButton((b) => b.setButtonText("Delete").setWarning().onClick(() => void this.remove()));
		}
		bar
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => b.setButtonText("Save").setCta().onClick(() => void this.save()));
	}

	private renderFields(el: HTMLElement): void {
		const fields = this.draft.fields;
		new Setting(el)
			.setHeading()
			.setName("Fields")
			.addButton((b) => b.setButtonText("Add field").onClick(() => void this.addField()));
		fields.forEach((f, i) => {
			const box = el.createDiv({ cls: "ace-field" });
			new Setting(box)
				.setName(f.name)
				.setDesc(`Type: ${propType(this.types, f.name)}`)
				.addExtraButton((b) => b.setIcon("arrow-up").setTooltip("Move up").onClick(() => this.change(() => move(fields, i, i - 1))))
				.addExtraButton((b) => b.setIcon("arrow-down").setTooltip("Move down").onClick(() => this.change(() => move(fields, i, i + 1))))
				.addExtraButton((b) => b.setIcon("trash").setTooltip("Remove field").onClick(() => this.change(() => fields.splice(i, 1))));
			this.renderOptions(box, f);
		});
	}

	private renderOptions(box: HTMLElement, f: FieldDraft): void {
		new Setting(box)
			.setName("Options")
			.setDesc("Choices offered for this field. None means free entry.")
			.addButton((b) => b.setButtonText("Add option").onClick(() => void this.addOption(f)));
		f.options.forEach((o, i) => {
			new Setting(box)
				.setName(o)
				.addExtraButton((b) => b.setIcon("arrow-up").setTooltip("Move up").onClick(() => this.change(() => move(f.options, i, i - 1))))
				.addExtraButton((b) => b.setIcon("arrow-down").setTooltip("Move down").onClick(() => this.change(() => move(f.options, i, i + 1))))
				.addExtraButton((b) => b.setIcon("trash").setTooltip("Remove option").onClick(() => this.change(() => f.options.splice(i, 1))));
		});
		const def = new Setting(box).setName("Default");
		if (propType(this.types, f.name) === "checkbox") def.setDesc("true or false");
		if (f.options.length === 0) {
			def.addText((t) =>
				t.setValue(f.default ?? "").onChange((v) => {
					f.default = v.trim() === "" ? null : v;
					this.renderProblems();
				}),
			);
			return;
		}
		def.addDropdown((dd) => {
			dd.addOption("", "(none)");
			const opts = f.default !== null && f.default !== "" && !f.options.includes(f.default) ? [f.default, ...f.options] : f.options;
			for (const o of opts) dd.addOption(o, o);
			dd.setValue(f.default ?? "").onChange((v) => {
				f.default = v === "" ? null : v;
				this.renderProblems();
			});
		});
	}

	private change(fn: () => void): void {
		fn();
		this.render();
	}

	private async addField(): Promise<void> {
		const names = this.draft.fields.map((f) => f.name);
		const v = await ask(this.app, "New field", "", (x) => fieldNameError(x, names));
		if (v === null) return;
		this.change(() => this.draft.fields.push({ name: v.trim(), options: [], default: null }));
	}

	private async addOption(f: FieldDraft): Promise<void> {
		const v = await ask(this.app, `New option for ${f.name}`, "", (x) =>
			x.trim() === "" ? "Enter a value." : f.options.some((o) => o.toLowerCase() === x.trim().toLowerCase()) ? "Already an option." : null,
		);
		if (v === null) return;
		this.change(() => f.options.push(v.trim()));
	}

	private renderProblems(): void {
		const el = this.problemsEl;
		el.empty();
		// Check what Save would write, so a field just removed doesn't still warn.
		const result = structuredClone(this.fm);
		applyDraft(result, this.draft, this.initialDraft);
		const list = kindProblems(this.draft, result, this.ace.problemContext());
		if (list.length === 0) return;
		new Setting(el).setHeading().setName("Problems");
		const ul = el.createEl("ul", { cls: "mod-warning" });
		for (const p of list) ul.createEl("li", { text: p });
	}

	private async save(): Promise<void> {
		if (!this.dirty()) {
			this.close();
			return;
		}
		try {
			await this.app.fileManager.processFrontMatter(this.file, (fm: Record<string, unknown>) =>
				applyDraft(fm, this.draft, this.initialDraft),
			);
		} catch (e) {
			new Notice(`Save failed: ${e instanceof Error ? e.message : String(e)}`, 10000);
			return;
		}
		this.close();
		this.onDone();
	}

	private async openNote(): Promise<void> {
		this.close();
		await this.app.workspace.getLeaf(false).openFile(this.file);
	}

	private async rename(): Promise<void> {
		if (this.dirty()) {
			new Notice("Save or cancel your changes first.");
			return;
		}
		const taken = this.ace.basenames(this.file);
		const v = await ask(this.app, `Rename ${this.file.basename}`, this.file.basename, (x) => {
			const n = cleanName(x);
			if (n === "") return "Name cannot be empty.";
			if (isTaken(n, taken)) return `A note named "${n}" already exists.`;
			return null;
		});
		if (v === null) return;
		const name = cleanName(v);
		try {
			await this.app.fileManager.renameFile(this.file, `${this.ace.settings.kindsFolder}/${name}.md`);
		} catch (e) {
			new Notice(`Rename failed: ${e instanceof Error ? e.message : String(e)}`, 10000);
			return;
		}
		this.close();
		this.onDone();
	}

	private async remove(): Promise<void> {
		const name = this.file.basename;
		const n = this.ace.notesUsingKind(name).length;
		const uses = n === 1 ? "1 note uses it" : `${n} notes use it`;
		const ok = await confirm(
			this.app,
			`Delete the ${name} kind?`,
			`Delete the ${name} kind? ${uses}. Their kind property will be removed, which leaves them without a kind. Nothing else in those notes changes.`,
			"Delete",
		);
		if (!ok) return;
		try {
			const r = await this.ace.deleteKind(this.file);
			if (r.failed.length > 0) {
				new Notice(
					`Updated ${r.updated} of ${r.updated + r.failed.length} notes; ${r.failed.length} failed (${r.failed.join(", ")}). The ${name} kind was kept.`,
					10000,
				);
				this.close();
				this.onDone();
				return;
			}
			new Notice(`Deleted the ${name} kind; ${r.updated} ${r.updated === 1 ? "note now has" : "notes now have"} no kind.`);
		} catch (e) {
			new Notice(`Delete failed: ${e instanceof Error ? e.message : String(e)}`, 10000);
			return;
		}
		this.close();
		this.onDone();
	}
}
