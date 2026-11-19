import { App, FuzzySuggestModal, Modal, Setting } from "obsidian";

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
