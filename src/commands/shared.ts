import { Notice, TFile } from "obsidian";
import { Ace } from "../vault";
import { ask, pick } from "../ui";
import { KindConfig, cleanName, isTaken, resolveStatus, statusChoices as statusChoicesOf, withFirst } from "../rules";

interface Choice<T> {
	label: string;
	value: T;
}

async function choose<T>(
	ace: Ace,
	items: Choice<T>[],
	placeholder: string,
): Promise<Choice<T> | null> {
	return pick(ace.app, items, (c) => c.label, placeholder);
}

export interface KindDetails {
	map: string | null;
	status: string | null;
	statusAsked: boolean;
	url: string | null;
}

export async function askKindDetails(
	ace: Ace,
	kind: KindConfig,
	noteName: string,
	current: Record<string, unknown>,
	urlGuess: string | null = null,
	exclude?: TFile,
): Promise<KindDetails | null> {
	// Map
	const mapNames = withFirst(
		ace.maps().filter((f) => f !== exclude).map((f) => f.basename),
		kind.defaultUp,
	);
	const mapChoices: Choice<string | null>[] = mapNames.map((n) => ({ label: n, value: n }));
	mapChoices.push({ label: "(no Map)", value: null });
	const mapPick = await choose(ace, mapChoices, `Map for "${noteName}"`);
	if (mapPick === null) return null;

	// Status
	let status: string | null = null;
	let statusAsked = false;
	if (kind.statusOptions.length > 0) {
		const cur = typeof current.status === "string" ? current.status : null;
		const statusChoices = statusChoicesOf(kind.statusOptions, cur, kind.defaultStatus);
		const sp = await choose(ace, statusChoices, `Status for "${noteName}"`);
		if (sp === null) return null;
		status = sp.value;
		statusAsked = true;
	}

	// Link
	let url: string | null = null;
	const src = current.source;
	const hasSource = typeof src === "string" ? src.trim() !== "" : src != null;
	if (kind.isSource && !hasSource) {
		const a = await ask(ace.app, "Link (optional)", urlGuess ?? "");
		if (a === null) return null;
		url = a.trim() === "" ? null : a.trim();
	}

	return { map: mapPick.value, status, statusAsked, url };
}

export function askNewName(ace: Ace, what: string, initial: string): Promise<string | null> {
	const taken = ace.basenames();
	return ask(ace.app, `Name of new ${what}`, initial, (v) => {
		const n = cleanName(v);
		if (n === "") return "Name cannot be empty.";
		if (isTaken(n, taken)) return `A note named "${n}" already exists.`;
		return null;
	}).then((v) => (v === null ? null : cleanName(v)));
}

export async function createOfKind(
	ace: Ace,
	kind: KindConfig,
	fallbackBody = "",
): Promise<void> {
	const name = await askNewName(ace, kind.name, "");
	if (name === null) return;
	const d = await askKindDetails(ace, kind, name, {});
	if (d === null) return;
	const props: Record<string, unknown> = {
		kind: `[[${kind.name}]]`,
		up: d.map ? [`[[${d.map}]]`] : [],
	};
	for (const f of kind.fields) props[f] = null;
	const status = resolveStatus(d.statusAsked, d.status, kind.defaultStatus);
	if (status) props.status = status;
	if (kind.isSource) props.source = d.url;
	const file: TFile = await ace.createNote(
		kind.folder,
		name,
		props,
		(await ace.templateBody(kind)) || fallbackBody,
	);
	await ace.app.workspace.getLeaf(false).openFile(file);
	new Notice(`New ${kind.name}: ${name}${d.map ? ` on ${d.map}` : ""}`);
}
