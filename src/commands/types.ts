import { Editor } from "obsidian";
import { Ace } from "../vault";

export interface AceCommand {
	id: string;
	name: string;
	run?: (ace: Ace) => Promise<void>;
	// The command acts on the open note, so it is only offered while one is open.
	needsNote?: boolean;
	editor?: (ace: Ace, editor: Editor) => void;
}
