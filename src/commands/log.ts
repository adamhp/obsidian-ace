import { AceCommand } from "./types";
import { fillTemplate } from "../rules";

export const log: AceCommand = {
	id: "log",
	name: "Log",
	editor: (ace, editor) => {
		editor.replaceSelection(fillTemplate(ace.settings.logFormat, ace.now()));
	},
};
