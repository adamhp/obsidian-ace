import { Notice } from "obsidian";
import { AceCommand } from "./types";
import { askNewName } from "./shared";
import { pick } from "../ui";
import { addLink, effortStatus, fillTemplate, isUnder } from "../rules";

export const makeEffort: AceCommand = {
	id: "make-effort",
	name: "Make effort",
	run: async (ace) => {
		const file = ace.currentFile();
		if (!file) return;
		const s = ace.settings;
		const intensity = await pick(
			ace.app,
			s.intensities,
			(i) => i,
			`Intensity for "${file.basename}"`,
		);
		if (intensity === null) return;

		if (!isUnder(file.path, s.effortsFolder) && isUnder(file.path, s.atlasFolder)) {
			const name = await askNewName(ace, "Effort", `${file.basename} (effort)`);
			if (name === null) return;
			const effort = await ace.createNote(
				s.effortsFolder,
				name,
				{ intensity, from: `[[${file.basename}]]` },
				fillTemplate(s.makeEffortText, { note: `[[${file.basename}]]` }),
			);
			const st = effortStatus(ace.kindOf(file), intensity, s.intensities);
			await ace.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				fm.effort = addLink(fm.effort, name);
				if (st) fm.status = st;
			});
			await ace.app.workspace.getLeaf(false).openFile(effort);
			new Notice(`${file.basename}: created Effort "${name}" (${intensity})`);
			return;
		}

		await ace.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm.intensity = intensity;
		});
		let suffix = "";
		if (!isUnder(file.path, s.effortsFolder)) {
			const target = `${s.effortsFolder}/${file.name}`;
			if (ace.app.vault.getAbstractFileByPath(target)) {
				suffix = ` (not moved: ${target} already exists)`;
			} else {
				await ace.ensureFolder(s.effortsFolder);
				await ace.app.fileManager.renameFile(file, target);
				suffix = `, moved to ${s.effortsFolder}`;
			}
		}
		new Notice(`${file.basename}: now an Effort (${intensity})${suffix}`);
	},
};
