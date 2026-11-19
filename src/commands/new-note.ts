import { Notice } from "obsidian";
import { AceCommand } from "./types";
import { createOfKind } from "./shared";
import { pick } from "../ui";

export const newNote: AceCommand = {
	id: "new-note",
	name: "New note…",
	run: async (ace) => {
		const kinds = ace.kinds();
		if (kinds.length === 0) {
			new Notice(`No kind notes in ${ace.settings.kindsFolder}.`);
			return;
		}
		const kind = await pick(ace.app, kinds, (k) => k.name, "Kind");
		if (kind === null) return;
		await createOfKind(ace, kind);
	},
};
