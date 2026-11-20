import { Notice } from "obsidian";
import { AceCommand } from "./types";
import { pick } from "../ui";
import { addLink, linkList, linkTarget } from "../rules";

export const addToMap: AceCommand = {
	id: "add-to-map",
	name: "Add to Map",
	run: async (ace) => {
		const file = ace.currentFile();
		if (!file) return;
		const maps = ace.maps().filter((m) => m !== file);
		if (maps.length === 0) {
			new Notice("No Maps found.");
			return;
		}
		const map = await pick(ace.app, maps, (m) => m.basename, `Add "${file.basename}" to Map`);
		if (map === null) return;
		const already = linkList(ace.fm(file)[ace.settings.props.up]).some(
			(l) => linkTarget(l)?.toLowerCase() === map.basename.toLowerCase(),
		);
		if (already) {
			new Notice(`${file.basename} is already on ${map.basename}`);
			return;
		}
		await ace.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			const up = ace.settings.props.up;
			fm[up] = addLink(fm[up], map.basename);
		});
		new Notice(`${file.basename}: added to ${map.basename}`);
	},
};
