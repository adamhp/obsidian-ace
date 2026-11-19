import { Notice } from "obsidian";
import { AceCommand } from "./types";
import { linkTarget } from "../rules";

export const fileByKind: AceCommand = {
	id: "file-by-kind",
	name: "File by kind",
	run: async (ace) => {
		const file = ace.currentFile();
		if (!file) return;
		const kind = ace.kindOf(file);
		if (!kind) {
			const name = linkTarget(ace.fm(file).kind);
			new Notice(
				name === null
					? `${file.basename} has no kind.`
					: `No kind note for "${name}" in ${ace.settings.kindsFolder}.`,
			);
			return;
		}
		const where = await ace.fileInto(file, kind.folder);
		new Notice(
			where === ""
				? `${file.basename} stays in ${file.parent?.path ?? "/"}`
				: `${file.basename}${where}`,
		);
	},
};
