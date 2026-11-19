import { Notice } from "obsidian";
import { AceCommand } from "./types";
import { createOfKind } from "./shared";
import { mapBody } from "../starter";

export const newMap: AceCommand = {
	id: "new-map",
	name: "New Map",
	run: async (ace) => {
		if (await ace.ensureMapKind()) {
			new Notice(`Created the Map kind note in ${ace.settings.kindsFolder}`);
		}
		const kind = ace.kind("Map")!;
		await createOfKind(ace, kind, mapBody(ace.settings.atlasFolder));
	},
};
