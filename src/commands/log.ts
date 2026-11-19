import { moment } from "obsidian";
import { AceCommand } from "./types";
import { fillTemplate } from "../rules";

export const log: AceCommand = {
	id: "log",
	name: "Log",
	editor: (ace, editor) => {
		const s = ace.settings;
		editor.replaceSelection(
			fillTemplate(s.logFormat, {
				date: moment().format(s.dateFormat),
				time: moment().format(s.timeFormat),
			}),
		);
	},
};
