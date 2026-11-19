import { Notice, TFile } from "obsidian";
import { Ace } from "../vault";
import { ask, pick } from "../ui";
import { KindConfig, cleanName, isTaken, withFirst } from "../rules";

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
	url: string | null;
}

export async function askKindDetails(
	ace: Ace,
	kind: KindConfig,
	noteName: string,
	current: Record<string, unknown>,
	urlGuess: string | null = null,
): Promise<KindDetails | null> {
	// Map
	const mapNames = withFirst(
		ace.maps().map((f) => f.basename),
		kind.defaultUp,
	);
	const mapChoices: Choice<string | null>[] = mapNames.map((n) => ({ label: n, value: n }));
	mapChoices.push({ label: "(no Map)", value: null });
	const mapPick = await choose(ace, mapChoices, `Map for "${noteName}"`);
	if (mapPick === null) return null;

	// Status
	let status: string | null = null;
	if (kind.statusOptions.length > 0) {
		const cur = typeof current.status === "string" ? current.status.trim() : "";
		const first = kind.statusOptions.includes(cur) ? cur : kind.defaultStatus;
		const opts = withFirst(kind.statusOptions, first);
		const statusChoices: Choice<string | null>[] = opts.map((s) => ({ label: s, value: s }));
		const none: Choice<string | null> = { label: "(no status)", value: null };
		if (first !== null && opts[0] === first) statusChoices.push(none);
		else statusChoices.unshift(none);
		const sp = await choose(ace, statusChoices, `Status for "${noteName}"`);
		if (sp === null) return null;
		status = sp.value;
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

	return { map: mapPick.value, status, url };
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

export async function createOfKind(ace: Ace, kind: KindConfig): Promise<void> {
	const name = await askNewName(ace, kind.name, "");
	if (name === null) return;
	const d = await askKindDetails(ace, kind, name, {});
	if (d === null) return;
	const props: Record<string, unknown> = {
		kind: `[[${kind.name}]]`,
		up: d.map ? [`[[${d.map}]]`] : [],
	};
	for (const f of kind.fields) props[f] = null;
	if (d.status) props.status = d.status;
	if (kind.isSource) props.source = d.url;
	const file: TFile = await ace.createNote(
		kind.folder,
		name,
		props,
		await ace.templateBody(kind),
	);
	await ace.app.workspace.getLeaf(false).openFile(file);
	new Notice(`New ${kind.name}: ${name}${d.map ? ` on ${d.map}` : ""}`);
}
