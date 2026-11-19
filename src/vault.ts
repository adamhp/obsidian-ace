import { App, MarkdownView, Notice, TFile, TFolder, moment } from "obsidian";
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
	shouldMove,
	templatePath,
} from "./rules";
import { ProblemContext, ProblemFix, parseTypes, usesKind } from "./kinds";
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

	kinds(): KindConfig[] {
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.parent?.path === this.settings.kindsFolder)
			.sort((a, b) => a.basename.localeCompare(b.basename))
			.map((f) => parseKindConfig(f.basename, this.fm(f), this.settings.defaultFolder));
	}

	kind(name: string | null): KindConfig | null {
		if (name === null) return null;
		const n = name.toLowerCase();
		return this.kinds().find((k) => k.name.toLowerCase() === n) ?? null;
	}

	kindOf(file: TFile): KindConfig | null {
		return this.kind(linkTarget(this.fm(file).kind));
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
			folderExists: (p) => this.app.vault.getAbstractFileByPath(p) instanceof TFolder,
			fileExists: (p) => this.app.vault.getAbstractFileByPath(p) instanceof TFile,
			mapNames: this.maps().map((f) => f.basename),
		};
	}

	createKind(name: string): Promise<TFile> {
		return this.createNote(this.settings.kindsFolder, name, { title: name }, kindNoteBody(this.settings));
	}

	notesUsingKind(name: string): TFile[] {
		const own = this.kindFile(name);
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f !== own && usesKind(this.fm(f).kind, name));
	}

	// Removes `kind` from every note using it. The Kind note is trashed only if all succeeded.
	async deleteKind(file: TFile): Promise<{ updated: number; failed: string[] }> {
		const users = this.notesUsingKind(file.basename);
		let updated = 0;
		const failed: string[] = [];
		for (const f of users) {
			try {
				await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
					delete fm.kind;
				});
				updated++;
			} catch {
				failed.push(f.basename);
			}
		}
		if (failed.length === 0) await this.app.fileManager.trashFile(file);
		return { updated, failed };
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
		const kind = (made ? null : this.kind("Map")) ?? parseKindConfig("Map", mapKindFrontmatter(s), s.defaultFolder);
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
			if (vault.getAbstractFileByPath(fix.target)) return `"${fix.target}" already exists.`;
			await this.ensureFolder(fix.target);
			return `Created folder ${fix.target}`;
		}
		if (fix.type === "file") {
			if (vault.getAbstractFileByPath(fix.target)) return `"${fix.target}" already exists.`;
			const slash = fix.target.lastIndexOf("/");
			if (slash > 0) await this.ensureFolder(fix.target.slice(0, slash));
			await vault.create(fix.target, "");
			return `Created ${fix.target}`;
		}
		if (cleanName(fix.target) !== fix.target) return `"${fix.target}" can't be used as a note name.`;
		if (isTaken(fix.target, this.basenames())) return `A note named "${fix.target}" already exists.`;
		const { kind } = await this.mapKind();
		const props: Record<string, unknown> = { kind: "[[Map]]", up: [] };
		for (const f of kind.fields) props[f] = null;
		await this.createNote(kind.folder, fix.target, props, (await this.templateBody(kind)) || mapBody(this.settings.atlasFolder));
		return `Created the Map ${fix.target} in ${kind.folder}`;
	}

	async ensureMapKind(): Promise<boolean> {
		if (this.kind("Map")) return false;
		const s = this.settings;
		if (this.app.vault.getAbstractFileByPath(`${s.kindsFolder}/Map.md`)) return false;
		await this.createNote(s.kindsFolder, "Map", mapKindFrontmatter(s), mapKindBody(s));
		return true;
	}

	async createStarterKinds(): Promise<{ created: string[]; skipped: string[] }> {
		const s = this.settings;
		const created: string[] = [];
		const skipped: string[] = [];
		for (const name of STARTER_KINDS) {
			if (this.kind(name) || this.app.vault.getAbstractFileByPath(`${s.kindsFolder}/${name}.md`)) {
				skipped.push(name);
				continue;
			}
			await this.createNote(s.kindsFolder, name, starterKindFrontmatter(name, s), kindNoteBody(s));
			created.push(name);
		}
		(await this.ensureMapKind() ? created : skipped).push("Map");
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
		return templatePath(which === "new" ? this.settings.newEffortTemplate : this.settings.makeEffortTemplate);
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
