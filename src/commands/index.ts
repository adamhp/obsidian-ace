import { AceCommand } from "./types";
import { newNote } from "./new-note";
import { newMap } from "./new-map";
import { setKind } from "./set-kind";
import { addToMap } from "./add-to-map";
import { fileByKind } from "./file-by-kind";

export const COMMANDS: AceCommand[] = [newNote, newMap, setKind, addToMap, fileByKind];
