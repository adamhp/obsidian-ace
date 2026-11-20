import { Notice } from "obsidian";
import { AceCommand } from "./types";
import { askNewName } from "./shared";
import { pick } from "../ui";

export const newEffort: AceCommand = {
	id: "new-effort",
	name: "New effort",
	run: async (ace) => {
		const s = ace.settings;
		const name = await askNewName(ace, "Effort", "");
		if (name === null) return;
		const intensity: string | null = await pick(
			ace.app,
			s.intensities,
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
		const dir = shape === "Single note" ? s.effortsFolder : `${s.effortsFolder}/${name}`;
		const file = await ace.createNote(
			dir,
			name,
			{ [s.props.intensity]: intensity },
			await ace.effortBody("new"),
		);
		await ace.app.workspace.getLeaf(false).openFile(file);
		new Notice(`New Effort "${name}" (${intensity})`);
	},
};
