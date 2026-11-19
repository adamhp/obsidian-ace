import { AceCommand } from "./types";
import { newNote } from "./new-note";
import { newMap } from "./new-map";
import { setKind } from "./set-kind";
import { addToMap } from "./add-to-map";
import { fileByKind } from "./file-by-kind";
import { makeEffort } from "./make-effort";
import { newEffort } from "./new-effort";
import { log } from "./log";

export const COMMANDS: AceCommand[] = [
	newNote,
	newMap,
	setKind,
	addToMap,
	fileByKind,
	makeEffort,
	newEffort,
	log,
];
