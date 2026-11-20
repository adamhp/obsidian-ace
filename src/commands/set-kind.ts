import { Notice } from "obsidian";
import { AceCommand } from "./types";
import { askFields, askKindDetails } from "./shared";
import { pick } from "../ui";
import { isEmptyValue } from "../kinds";
import { addLink, firstUrl, linkList, withFirst } from "../rules";

export const setKind: AceCommand = {
	id: "set-kind",
	name: "Set kind",
	run: async (ace) => {
		const file = ace.currentFile();
		if (!file) return;
		const kinds = ace.kinds();
		if (kinds.length === 0) {
			new Notice(`No kind notes in ${ace.settings.kindsFolder}.`);
			return;
		}
		const cur = ace.kindOf(file);
		const order = withFirst(
			kinds.map((k) => k.name),
			cur?.name ?? null,
		);
		const sorted = order.map((n) => kinds.find((k) => k.name === n)!);
		const kind = await pick(ace.app, sorted, (k) => k.name, `Kind for "${file.basename}"`);
		if (kind === null) return;

		const current = ace.fm(file);
		const guess = firstUrl(await ace.app.vault.cachedRead(file));
		const d = await askKindDetails(ace, kind, file.basename, current, guess, file);
		if (d === null) return;
		const answers = await askFields(ace, kind, current);
		if (answers === null) return;

		const p = ace.settings.props;
		await ace.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm[p.kind] = `[[${kind.name}]]`;
			fm[p.up] = d.map ? addLink(fm[p.up], d.map) : linkList(fm[p.up]);
			for (const f of kind.fields) {
				if (f in answers && isEmptyValue(fm[f])) fm[f] = answers[f];
				else if (!(f in fm)) fm[f] = null;
			}
			if (d.url) fm[p.source] = d.url;
		});
		const where = await ace.fileInto(file, kind.folder);
		new Notice(
			`${file.basename}: kind set to ${kind.name}${d.map ? `, added to ${d.map}` : ""}${where}`,
		);
	},
};
