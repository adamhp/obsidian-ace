import { AceCommand } from "./types";
import { logStamp } from "../rules";

export const log: AceCommand = {
	id: "log",
	name: "Log",
	editor: (_ace, editor) => {
		editor.replaceSelection(logStamp(new Date()));
	},
};
