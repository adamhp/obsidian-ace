import { AceCommand } from "./types";
import { createOfKind } from "./shared";
import { parseKindConfig } from "../rules";

export const newMap: AceCommand = {
	id: "new-map",
	name: "New Map",
	run: async (ace) => {
		const kind = ace.kind("Map") ??
			parseKindConfig("Map", { folder: ace.settings.mapsFolder }, ace.settings.defaultFolder);
		await createOfKind(ace, kind);
	},
};
