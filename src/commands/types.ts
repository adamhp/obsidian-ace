import { Editor } from "obsidian";
import { Ace } from "../vault";

export interface AceCommand {
	id: string;
	name: string;
	run?: (ace: Ace) => Promise<void>;
	editor?: (ace: Ace, editor: Editor) => void;
}
