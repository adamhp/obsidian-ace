import { Notice } from "obsidian";
import { AceCommand } from "./types";
import { createOfKind } from "./shared";
import { mapBody } from "../starter";

export const newMap: AceCommand = {
	id: "new-map",
	name: "New Map",
	run: async (ace) => {
		const { kind, made } = await ace.mapKind();
		if (made) new Notice(`Created the Map kind note in ${ace.settings.kindsFolder}`);
		await createOfKind(ace, kind, mapBody(ace.settings.atlasFolder));
	},
};
