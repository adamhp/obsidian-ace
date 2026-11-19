import { App, MarkdownView, Notice, TFile } from "obsidian";
import {
	KINDS_FOLDER,
	MAPS_FOLDER,
	KindConfig,
	linkTarget,
	parseKindConfig,
	shouldMove,
} from "./rules";

export class Ace {
	constructor(public app: App) {}

	fm(file: TFile): Record<string, unknown> {
		const f = this.app.metadataCache.getFileCache(file)?.frontmatter;
		return f ? (f as Record<string, unknown>) : {};
	}

	kinds(): KindConfig[] {
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.parent?.path === KINDS_FOLDER)
			.sort((a, b) => a.basename.localeCompare(b.basename))
			.map((f) => parseKindConfig(f.basename, this.fm(f)));
	}

	kind(name: string | null): KindConfig | null {
		if (name === null) return null;
		const n = name.toLowerCase();
		return this.kinds().find((k) => k.name.toLowerCase() === n) ?? null;
	}

	kindOf(file: TFile): KindConfig | null {
		return this.kind(linkTarget(this.fm(file).kind));
	}

	maps(): TFile[] {
		const folder = this.kind("Map")?.folder ?? MAPS_FOLDER;
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
		if (!shouldMove(file.path, folder)) return "";
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

	async templateBody(kind: KindConfig): Promise<string> {
		if (!kind.template) return "";
		const f = this.app.vault.getAbstractFileByPath(kind.template);
		if (!(f instanceof TFile)) return "";
		const text = await this.app.vault.read(f);
		return text.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "");
	}

	currentFile(): TFile | null {
		const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
		if (!file) new Notice("Open a note first.");
		return file;
	}
}
