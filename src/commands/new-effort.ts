import { Notice } from "obsidian";
import { AceCommand } from "./types";
import { askNewName } from "./shared";
import { pick } from "../ui";
import { EFFORTS_FOLDER, INTENSITIES, Intensity } from "../rules";

export const newEffort: AceCommand = {
	id: "new-effort",
	name: "New effort",
	run: async (ace) => {
		const name = await askNewName(ace, "Effort", "");
		if (name === null) return;
		const intensity: Intensity | null = await pick(
			ace.app,
			[...INTENSITIES],
			(i) => i,
			`Intensity for "${name}"`,
		);
		if (intensity === null) return;
		const shape = await pick(
			ace.app,
			["Single note", "Folder (with folder note)"],
			(s) => s,
			"Shape",
		);
		if (shape === null) return;
		const dir = shape === "Single note" ? EFFORTS_FOLDER : `${EFFORTS_FOLDER}/${name}`;
		const file = await ace.createNote(
			dir,
			name,
			{ intensity },
			"## Goal\n\n\n\n## Next steps\n\n- [ ] \n\n## Log\n\n",
		);
		await ace.app.workspace.getLeaf(false).openFile(file);
		new Notice(`New Effort "${name}" (${intensity})`);
	},
};
