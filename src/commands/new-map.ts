import { Notice } from "obsidian";
import { AceCommand } from "./types";
import { createOfKind } from "./shared";
import { mapBody, mapKindFrontmatter } from "../starter";
import { parseKindConfig } from "../rules";

export const newMap: AceCommand = {
	id: "new-map",
	name: "New Map",
	run: async (ace) => {
		const s = ace.settings;
		const made = await ace.ensureMapKind();
		if (made) new Notice(`Created the Map kind note in ${s.kindsFolder}`);
		// The metadata cache lags a just-created note, so build the kind from the known frontmatter.
		const kind =
			(made ? null : ace.kind("Map")) ??
			parseKindConfig("Map", mapKindFrontmatter(s), s.defaultFolder);
		await createOfKind(ace, kind, mapBody(ace.settings.atlasFolder));
	},
};
