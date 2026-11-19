import { Notice } from "obsidian";
import { AceCommand } from "./types";
import { askNewName } from "./shared";
import { pick } from "../ui";
import { EFFORTS_FOLDER, INTENSITIES, Intensity, addLink, ideaStatus, isUnder } from "../rules";

export const makeEffort: AceCommand = {
	id: "make-effort",
	name: "Make effort",
	run: async (ace) => {
		const file = ace.currentFile();
		if (!file) return;
		const intensity: Intensity | null = await pick(
			ace.app,
			[...INTENSITIES],
			(i) => i,
			`Intensity for "${file.basename}"`,
		);
		if (intensity === null) return;

		if (isUnder(file.path, "Atlas")) {
			const name = await askNewName(ace, "Effort", `${file.basename} (effort)`);
			if (name === null) return;
			const effort = await ace.createNote(
				EFFORTS_FOLDER,
				name,
				{ intensity, from: `[[${file.basename}]]` },
				`Started from [[${file.basename}]].\n\n## Next steps\n\n- [ ] \n`,
			);
			const isIdea = ace.kindOf(file)?.name === "Idea";
			await ace.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				fm.effort = addLink(fm.effort, name);
				if (isIdea) fm.status = ideaStatus(intensity);
			});
			await ace.app.workspace.getLeaf(false).openFile(effort);
			new Notice(`${file.basename}: created Effort "${name}" (${intensity})`);
			return;
		}

		await ace.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm.intensity = intensity;
		});
		let suffix = "";
		if (!isUnder(file.path, EFFORTS_FOLDER)) {
			const target = `${EFFORTS_FOLDER}/${file.name}`;
			if (ace.app.vault.getAbstractFileByPath(target)) {
				suffix = ` (not moved: ${target} already exists)`;
			} else {
				await ace.ensureFolder(EFFORTS_FOLDER);
				await ace.app.fileManager.renameFile(file, target);
				suffix = `, moved to ${EFFORTS_FOLDER}`;
			}
		}
		new Notice(`${file.basename}: now an Effort (${intensity})${suffix}`);
	},
};
