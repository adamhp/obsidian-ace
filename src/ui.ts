import { App, FuzzySuggestModal, Modal, Setting } from "obsidian";
import { PropType, numberError, toValue } from "./kinds";
import { withFirst } from "./rules";

class PickModal<T> extends FuzzySuggestModal<T> {
	private chosen = false;

	constructor(
		app: App,
		private items: T[],
		private labelOf: (t: T) => string,
		placeholder: string,
		private done: (v: T | null) => void,
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): T[] {
		return this.items;
	}

	getItemText(item: T): string {
		return this.labelOf(item);
	}

	onChooseItem(item: T): void {
		this.chosen = true;
		this.done(item);
	}

	onClose(): void {
		super.onClose();
		// onChooseItem fires after onClose, so defer the cancel result.
		setTimeout(() => {
			if (!this.chosen) this.done(null);
		}, 0);
	}
}

export function pick<T>(
	app: App,
	items: T[],
	label: (t: T) => string,
	placeholder: string,
): Promise<T | null> {
	return new Promise((resolve) => {
		new PickModal(app, items, label, placeholder, resolve).open();
	});
}

class AskModal extends Modal {
	private value: string;
	private submitted = false;

	constructor(
		app: App,
		private title: string,
		initial: string,
		private check: ((v: string) => string | null) | undefined,
		private done: (v: string | null) => void,
	) {
		super(app);
		this.value = initial;
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		const err = this.contentEl.createDiv({ cls: "mod-warning" });
		const validate = (): boolean => {
			const msg = this.check ? this.check(this.value) : null;
			err.setText(msg ?? "");
			return msg === null;
		};
		const submit = () => {
			if (!validate()) return;
			this.submitted = true;
			this.done(this.value);
			this.close();
		};
		new Setting(this.contentEl).addText((t) => {
			t.setValue(this.value).onChange((v) => {
				this.value = v;
				validate();
			});
			t.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" && !e.isComposing) {
					e.preventDefault();
					submit();
				}
			});
			t.inputEl.focus();
			t.inputEl.select();
		});
		this.contentEl.appendChild(err);
		validate();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) this.done(null);
	}
}

export function ask(
	app: App,
	title: string,
	initial: string,
	check?: (v: string) => string | null,
): Promise<string | null> {
	return new Promise((resolve) => {
		new AskModal(app, title, initial, check, resolve).open();
	});
}

class ValueModal extends Modal {
	private raw: string | boolean;
	private submitted = false;

	constructor(
		app: App,
		private title: string,
		private type: PropType,
		initial: string | boolean,
		private done: (v: { value: unknown } | null) => void,
	) {
		super(app);
		this.raw = initial;
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		const err = this.contentEl.createDiv({ cls: "mod-warning" });
		const validate = (): boolean => {
			const msg = this.type === "number" ? numberError(String(this.raw)) : null;
			err.setText(msg ?? "");
			return msg === null;
		};
		const submit = () => {
			if (!validate()) return;
			this.submitted = true;
			this.done({ value: toValue(this.type, this.raw) });
			this.close();
		};
		const onEnter = (el: HTMLElement) => {
			el.addEventListener("keydown", (e: KeyboardEvent) => {
				if (e.key === "Enter" && !e.isComposing) {
					e.preventDefault();
					submit();
				}
			});
		};
		const setting = new Setting(this.contentEl);
		if (this.type === "checkbox") {
			setting.addToggle((t) => {
				t.setValue(this.raw === true).onChange((v) => {
					this.raw = v;
				});
				onEnter(t.toggleEl);
				t.toggleEl.focus();
			});
		} else {
			setting.addText((t) => {
				const input = t.inputEl;
				if (this.type === "date") input.type = "date";
				else if (this.type === "datetime") input.type = "datetime-local";
				else if (this.type === "number") input.inputMode = "decimal";
				t.setValue(String(this.raw)).onChange((v) => {
					this.raw = v;
					validate();
				});
				onEnter(input);
				input.focus();
				if (this.type === "text" || this.type === "list") input.select();
			});
		}
		this.contentEl.appendChild(err);
		validate();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) this.done(null);
	}
}

export async function askValue(
	app: App,
	title: string,
	type: PropType,
	initial: string | boolean,
	options?: string[],
): Promise<{ value: unknown } | null> {
	if (options && options.length > 0) {
		const names = withFirst(options, typeof initial === "string" && initial !== "" ? initial : null);
		const items: { label: string; value: string | null }[] = names.map((n) => ({ label: n, value: n }));
		items.push({ label: "(none)", value: null });
		const chosen = await pick(app, items, (i) => i.label, title);
		if (chosen === null) return null;
		if (chosen.value === null) return { value: null };
		return { value: type === "list" ? [chosen.value] : chosen.value };
	}
	return new Promise((resolve) => {
		new ValueModal(app, title, type, initial, resolve).open();
	});
}

class ConfirmModal extends Modal {
	private answered = false;

	constructor(
		app: App,
		private title: string,
		private message: string,
		private button: string,
		private done: (v: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		this.contentEl.createEl("p", { text: this.message });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText(this.button)
					.setWarning()
					.onClick(() => {
						this.answered = true;
						this.done(true);
						this.close();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.done(false);
	}
}

export function confirm(app: App, title: string, message: string, button: string): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, title, message, button, resolve).open();
	});
}
