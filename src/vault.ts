import { App, MarkdownView, Notice, TFile, TFolder, moment, normalizePath } from "obsidian";
import {
	AceSettings,
	KindConfig,
	MAKE_EFFORT_TEXT,
	NEW_EFFORT_TEXT,
	cleanName,
	isTaken,
	fillTemplate,
	linkTarget,
	parseKindConfig,
	renameKey,
	shouldMove,
	templatePath,
} from "./rules";
import { ProblemContext, ProblemFix, isEmptyValue, oldKindKey, parseTypes, usesKind } from "./kinds";
import {
	STARTER_KINDS,
	kindNoteBody,
	mapBody,
	mapKindBody,
	mapKindFrontmatter,
	starterKindFrontmatter,
} from "./starter";

export class Ace {
	constructor(
		public app: App,
		public settings: AceSettings,
	) {}

	fm(file: TFile): Record<string, unknown> {
		const f = this.app.metadataCache.getFileCache(file)?.frontmatter;
		return f ? (f as Record<string, unknown>) : {};
	}

	async propTypes(): Promise<Record<string, string>> {
		try {
			return parseTypes(await this.app.vault.adapter.read(`${this.app.vault.configDir}/types.json`));
		} catch {
			return {};
		}
	}

	// A Kind note's folder and template are typed by the person, so clean them up as paths.
	private withPaths(k: KindConfig): KindConfig {
		return { ...k, folder: normalizePath(k.folder), template: k.template === null ? null : normalizePath(k.template) };
	}

	kinds(): KindConfig[] {
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.parent?.path === this.settings.kindsFolder)
			.sort((a, b) => a.basename.localeCompare(b.basename))
			.map((f) => this.withPaths(parseKindConfig(f.basename, this.fm(f), this.settings.defaultFolder)));
	}

	kind(name: string | null): KindConfig | null {
		if (name === null) return null;
		const n = name.toLowerCase();
		return this.kinds().find((k) => k.name.toLowerCase() === n) ?? null;
	}

	kindOf(file: TFile): KindConfig | null {
		return this.kind(linkTarget(this.fm(file)[this.settings.props.kind]));
	}

	kindFile(name: string): TFile | null {
		const n = name.toLowerCase();
		return (
			this.app.vault
				.getMarkdownFiles()
				.find((f) => f.parent?.path === this.settings.kindsFolder && f.basename.toLowerCase() === n) ?? null
		);
	}

	problemContext(): ProblemContext {
		return {
			folderExists: (p) => this.app.vault.getAbstractFileByPath(normalizePath(p)) instanceof TFolder,
			fileExists: (p) => this.app.vault.getAbstractFileByPath(normalizePath(p)) instanceof TFile,
			mapNames: this.maps().map((f) => f.basename),
			reserved: Object.values(this.settings.props),
		};
	}

	createKind(name: string): Promise<TFile> {
		return this.createNote(this.settings.kindsFolder, name, { title: name }, kindNoteBody(this.settings));
	}

	notesUsingKind(name: string): TFile[] {
		const own = this.kindFile(name);
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f !== own && usesKind(this.fm(f)[this.settings.props.kind], name));
	}

	// Removes the kind property from every note using it. The Kind note is trashed only if all succeeded.
	async deleteKind(file: TFile): Promise<{ updated: number; failed: string[] }> {
		const users = this.notesUsingKind(file.basename);
		let updated = 0;
		const failed: string[] = [];
		for (const f of users) {
			try {
				await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
					delete fm[this.settings.props.kind];
				});
				updated++;
			} catch {
				failed.push(f.basename);
			}
		}
		if (failed.length === 0) await this.app.fileManager.trashFile(file);
		return { updated, failed };
	}

	// Old keys on Kind notes that have a value, with their current name and the Kind notes that carry them.
	oldKindKeys(): { from: string; to: string; files: TFile[] }[] {
		const out = new Map<string, { from: string; to: string; files: TFile[] }>();
		for (const f of this.app.vault.getMarkdownFiles()) {
			if (f.parent?.path !== this.settings.kindsFolder) continue;
			for (const [key, value] of Object.entries(this.fm(f))) {
				const to = oldKindKey(key);
				if (to === null || isEmptyValue(value)) continue;
				const item = out.get(key) ?? { from: key, to, files: [] };
				item.files.push(f);
				out.set(key, item);
			}
		}
		return [...out.values()];
	}

	// Removes property `old` from each note. With `keep`, only where that property is also on the note.
	async removeOldProperty(files: TFile[], old: string, keep?: string): Promise<{ removed: number; failed: string[] }> {
		let removed = 0;
		const failed: string[] = [];
		for (const f of files) {
			try {
				await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
					if (keep !== undefined && !Object.prototype.hasOwnProperty.call(fm, keep)) return;
					if (!Object.prototype.hasOwnProperty.call(fm, old)) return;
					delete fm[old];
					removed++;
				});
			} catch {
				failed.push(f.basename);
			}
		}
		return { removed, failed };
	}

	notesWithProperty(name: string): TFile[] {
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => Object.prototype.hasOwnProperty.call(this.fm(f), name));
	}

	// Renames a property in every note that has it. A note that already has the new name is skipped, never overwritten.
	async renameProperty(
		from: string,
		to: string,
		files: TFile[] = this.notesWithProperty(from),
	): Promise<{ renamed: number; skipped: string[]; failed: string[] }> {
		let renamed = 0;
		const skipped: string[] = [];
		const failed: string[] = [];
		for (const f of files) {
			try {
				let result = "absent";
				await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
					result = renameKey(fm, from, to);
				});
				if (result === "renamed") renamed++;
				else if (result === "taken") skipped.push(f.basename);
			} catch {
				failed.push(f.basename);
			}
		}
		return { renamed, skipped, failed };
	}

	maps(): TFile[] {
		const folder = this.kind("Map")?.folder ?? this.settings.mapsFolder;
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(folder + "/"))
			.sort((a, b) => a.basename.localeCompare(b.basename));
	}

	basenames(except?: TFile): string[] {
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f !== except)
			.map((f) => f.basename);
	}

	async ensureFolder(path: string): Promise<void> {
		let cur = "";
		for (const part of path.split("/").filter((p) => p !== "")) {
			cur = cur === "" ? part : `${cur}/${part}`;
			if (!this.app.vault.getAbstractFileByPath(cur)) {
				await this.app.vault.createFolder(cur);
			}
		}
	}

	async fileInto(file: TFile, folder: string): Promise<string> {
		if (!shouldMove(file.path, folder, this.settings.effortsFolder)) return "";
		const target = `${folder}/${file.name}`;
		if (this.app.vault.getAbstractFileByPath(target)) {
			return ` (not moved: ${target} already exists)`;
		}
		await this.ensureFolder(folder);
		await this.app.fileManager.renameFile(file, target);
		return `, moved to ${folder}`;
	}

	async createNote(
		folder: string,
		name: string,
		props: Record<string, unknown>,
		body: string,
	): Promise<TFile> {
		const path = `${folder}/${name}.md`;
		if (this.app.vault.getAbstractFileByPath(path)) {
			throw new Error(`Cannot create "${path}": it already exists.`);
		}
		await this.ensureFolder(folder);
		const file = await this.app.vault.create(path, body);
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			for (const [k, v] of Object.entries(props)) {
				if (v !== undefined) fm[k] = v;
			}
		});
		return file;
	}

	// The Map kind, creating its Kind note first if it's missing.
	async mapKind(): Promise<{ kind: KindConfig; made: boolean }> {
		const s = this.settings;
		const made = await this.ensureMapKind();
		// The metadata cache lags a just-created note, so build the kind from the known frontmatter.
		const kind = (made ? null : this.kind("Map")) ?? this.withPaths(parseKindConfig("Map", mapKindFrontmatter(s), s.defaultFolder));
		return { kind, made };
	}

	// Creates every kind's folder that doesn't exist yet. Returns the folders created.
	missingKindFolders(): string[] {
		return [...new Set(this.kinds().map((k) => k.folder))].filter(
			(f) => f !== "" && !(this.app.vault.getAbstractFileByPath(f) instanceof TFolder),
		);
	}

	async createMissingKindFolders(): Promise<string[]> {
		const missing = this.missingKindFolders();
		for (const f of missing) await this.ensureFolder(f);
		return missing;
	}

	// Creates what a Kind problem says is missing. Never overwrites; returns the Notice text.
	async fixProblem(fix: ProblemFix): Promise<string> {
		const vault = this.app.vault;
		if (fix.type === "folder") {
			const target = normalizePath(fix.target);
			if (vault.getAbstractFileByPath(target)) return `"${target}" already exists.`;
			await this.ensureFolder(target);
			return `Created folder ${target}`;
		}
		if (fix.type === "file") {
			const target = normalizePath(fix.target);
			if (vault.getAbstractFileByPath(target)) return `"${target}" already exists.`;
			const slash = target.lastIndexOf("/");
			if (slash > 0) await this.ensureFolder(target.slice(0, slash));
			await vault.create(target, "");
			return `Created ${target}`;
		}
		if (cleanName(fix.target) !== fix.target) return `"${fix.target}" can't be used as a note name.`;
		if (isTaken(fix.target, this.basenames())) return `A note named "${fix.target}" already exists.`;
		const { kind } = await this.mapKind();
		const p = this.settings.props;
		const props: Record<string, unknown> = { [p.kind]: "[[Map]]", [p.up]: [] };
		for (const f of kind.fields) props[f] = null;
		await this.createNote(kind.folder, fix.target, props, (await this.templateBody(kind)) || mapBody(this.settings));
		return `Created the Map ${fix.target} in ${kind.folder}`;
	}

	async ensureMapKind(): Promise<boolean> {
		if (this.kind("Map")) return false;
		const s = this.settings;
		if (this.app.vault.getAbstractFileByPath(`${s.kindsFolder}/Map.md`)) return false;
		await this.createNote(s.kindsFolder, "Map", mapKindFrontmatter(s), mapKindBody(s));
		return true;
	}

	// The starter kinds that have no Kind note yet: what Create starter kinds would create.
	missingStarterKinds(): string[] {
		const s = this.settings;
		return STARTER_KINDS.filter(
			(name) => !this.kind(name) && !this.app.vault.getAbstractFileByPath(`${s.kindsFolder}/${name}.md`),
		);
	}

	// Map is not a starter kind: the plugin creates it by itself (see ensureMapKind).
	async createStarterKinds(): Promise<{ created: string[]; skipped: string[] }> {
		const s = this.settings;
		const created = this.missingStarterKinds();
		const skipped = STARTER_KINDS.filter((name) => !created.includes(name));
		for (const name of created) {
			await this.createNote(s.kindsFolder, name, starterKindFrontmatter(name, s), kindNoteBody(s));
		}
		return { created, skipped };
	}

	async templateBody(kind: KindConfig): Promise<string> {
		return kind.template ? ((await this.readBody(kind.template)) ?? "") : "";
	}

	// A markdown file's text without its properties, or null if it isn't there.
	async readBody(path: string): Promise<string | null> {
		const f = this.app.vault.getAbstractFileByPath(path);
		if (!(f instanceof TFile)) return null;
		const text = await this.app.vault.read(f);
		return text.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "");
	}

	// The template path a setting points at (".md" added), or null when blank.
	effortTemplatePath(which: "new" | "make"): string | null {
		const p = templatePath(which === "new" ? this.settings.newEffortTemplate : this.settings.makeEffortTemplate);
		return p === null ? null : normalizePath(p);
	}

	// Body for a new effort: the template file's body, or the built-in text when it's unset or missing.
	async effortBody(which: "new" | "make", vars: Record<string, string> = {}): Promise<string> {
		const path = this.effortTemplatePath(which);
		const body = (path ? await this.readBody(path) : null) ?? (which === "new" ? NEW_EFFORT_TEXT : MAKE_EFFORT_TEXT);
		const s = this.settings;
		return fillTemplate(body, { date: moment().format(s.dateFormat), time: moment().format(s.timeFormat), ...vars });
	}

	// Creates a missing effort template, filled with the built-in text. Never overwrites.
	async createEffortTemplate(which: "new" | "make"): Promise<string> {
		const path = this.effortTemplatePath(which);
		if (path === null) return "Set a template file first.";
		if (this.app.vault.getAbstractFileByPath(path)) return `"${path}" already exists.`;
		const slash = path.lastIndexOf("/");
		if (slash > 0) await this.ensureFolder(path.slice(0, slash));
		await this.app.vault.create(path, which === "new" ? NEW_EFFORT_TEXT : MAKE_EFFORT_TEXT);
		return `Created ${path}`;
	}

	currentFile(): TFile | null {
		const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
		if (!file) new Notice("Open a note first.");
		return file;
	}
}
