import { Notice, TFile } from "obsidian";
import { Ace } from "../vault";
import { ask, askValue, pick } from "../ui";
import { KindConfig, cleanName, isTaken, withFirst } from "../rules";
import { fillTitle, isEmptyValue, propType } from "../kinds";

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

	// Link
	let url: string | null = null;
	const src = current.source;
	const hasSource = typeof src === "string" ? src.trim() !== "" : src != null;
	if (kind.isSource && !hasSource) {
		const a = await ask(ace.app, "Link (optional)", urlGuess ?? "");
		if (a === null) return null;
		url = a.trim() === "" ? null : a.trim();
	}

	return { map: mapPick.value, url };
}

export async function askFields(
	ace: Ace,
	kind: KindConfig,
	current: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
	const types = await ace.propTypes();
	const out: Record<string, unknown> = {};
	for (const f of kind.fields) {
		if (!isEmptyValue(current[f])) continue;
		const type = propType(types, f);
		const def = kind.fieldDefaults[f] ?? null;
		const initial: string | boolean = type === "checkbox" ? def === "true" : (def ?? "");
		const a = await askValue(ace.app, `${f} for ${kind.name}`, type, initial, kind.fieldOptions[f]);
		if (a === null) return null;
		out[f] = a.value;
	}
	return out;
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
	let name: string | null = null;
	if (kind.titleTemplate === null) {
		name = await askNewName(ace, kind.name, "");
		if (name === null) return;
	}
	const d = await askKindDetails(ace, kind, name ?? `new ${kind.name}`, {});
	if (d === null) return;
	const answers = await askFields(ace, kind, {});
	if (answers === null) return;
	if (name === null) {
		const built = fillTitle(kind.titleTemplate ?? "", answers);
		if (built === "" || isTaken(built, ace.basenames())) {
			name = await askNewName(ace, kind.name, built);
			if (name === null) return;
		} else {
			name = built;
		}
	}
	const props: Record<string, unknown> = {
		kind: `[[${kind.name}]]`,
		up: d.map ? [`[[${d.map}]]`] : [],
	};
	for (const f of kind.fields) props[f] = f in answers ? answers[f] : null;
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
