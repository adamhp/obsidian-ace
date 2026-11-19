import { AceCommand } from "./types";
import { createOfKind } from "./shared";
import { MAPS_FOLDER, parseKindConfig } from "../rules";

export const newMap: AceCommand = {
	id: "new-map",
	name: "New Map",
	run: async (ace) => {
		const kind = ace.kind("Map") ?? parseKindConfig("Map", { folder: MAPS_FOLDER });
		await createOfKind(ace, kind);
	},
};
