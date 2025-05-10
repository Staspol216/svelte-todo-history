import { createPubSub } from './simplePubSub';
import { createSerialAsyncExecutor } from './serialAsyncExecutor';

export type UndoEntry = {
	operation: () => void;
	reverseOperation: () => void;
	hasUndoConflict?: () => boolean | Promise<boolean>;
	hasRedoConflict?: () => boolean | Promise<boolean>;
	// determines what gets removed when there are conflicts
	scopeName: string;
	// will be returned from subscribeToCanUndoRedoChange so you can display it in a tooltip next to the buttons (e.g "un-create item")
	description: string;
	reverseDescription: string;
};

export type UndoRedoStatus = {
	canUndo: false | string;
	canRedo: false | string;
	canUndoChangeReason: CHANGE_REASON;
	canRedoChangeReason: CHANGE_REASON;
};

type CallbackFunction = (newStatus: UndoRedoStatus) => unknown;

export enum CHANGE_REASON {
	Do = 'Do',
	Undo = 'Undo',
	Redo = 'Redo',
	Conflict = 'Conflict',
	NoChange = 'NoChange'
}

/**
 * If history mode is off, if we do a squence like A -> B  -> (via Undo) A -> C, we the ability to restore C, undoing again goes back to A
 * If history mode is on, undoing in the final state C will go back to A then B then A, maintaining the entire edit history
 */
const IS_HISTORY_MODE = true;

/****
 * This a POC implementation of an undo-redo manager that can deal with async or sync operations.
 * It makes sure async operations are executed serially to avoid race conditions (later operation finishing before a previous one)
 * It supports conflicts checks and in case of a conflicting entry at the head of the undo or redo queue it removes
 * all the entries with the same scopeName from the stack.
 * It exposes the next action to unde/redo and the change reason when it changes.
 * ****
 * The consumer is expected to call `updateCanUndoRedoStatus` when external changes that can create conflicts are executed
 ******/
export class UndoManager {
	past: UndoEntry[] = [];
	future: UndoEntry[] = [];
	constructor(
		public pubsub: ReturnType<typeof createPubSub<UndoRedoStatus>>,
		public serialAsyncExecutor: ReturnType<typeof createSerialAsyncExecutor>
	) {}

	private isLastIfConflictingInPast() {
		const lastIndex = this.past.length - 1;
		if (lastIndex < 0) return false;
		const entry = this.past[lastIndex];
		const check = entry.hasUndoConflict?.bind(entry);
		if (check === undefined) return false;
		return this.serialAsyncExecutor.execute(check);
	}
	private isLastIfConflictingInFuture() {
		const lastIndex = this.future.length - 1;
		if (lastIndex < 0) return false;
		const entry = this.future[lastIndex];
		const check = entry.hasRedoConflict?.bind(entry);
		if (check === undefined) return false;
		return this.serialAsyncExecutor.execute(check);
	}
	private async removeConflictingEntries() {
		let isUndoConflict = false;
		let isRedoConflict = false;

		while (await this.isLastIfConflictingInPast()) {
			const conflictingEntry = this.past.pop();
			isUndoConflict = true;
			this.past = this.past.filter((entry) => entry.scopeName !== conflictingEntry?.scopeName);
		}
		while (await this.isLastIfConflictingInFuture()) {
			const conflictingEntry = this.future.pop();
			isRedoConflict = true;
			this.future = this.future.filter((entry) => entry.scopeName !== conflictingEntry?.scopeName);
		}
		return { isUndoConflict, isRedoConflict };
	}

	async updateCanUndoRedoStatus(changeReason = CHANGE_REASON.NoChange) {
		const { isUndoConflict, isRedoConflict } = await this.removeConflictingEntries();
		this.pubsub.set({
			canUndo: this.past.length > 0 ? this.past[this.past.length - 1].reverseDescription : false,
			canRedo: this.future.length > 0 ? this.future[this.future.length - 1].description : false,
			canUndoChangeReason: isUndoConflict ? CHANGE_REASON.Conflict : changeReason,
			canRedoChangeReason: isRedoConflict ? CHANGE_REASON.Conflict : changeReason
		});
	}
	async record(undoEntry: UndoEntry) {
		if (IS_HISTORY_MODE && this.future.length > 0) {
			// push the entries in revese order and then the opposite operations in the normal order

			console.log(this.future, 'this.future');
			for (let i = this.future.length - 1; i >= 0; i--) {
				const entry = this.future[i];
				this.past.push({
					...entry,
					operation: entry.operation.bind(entry),
					reverseOperation: entry.reverseOperation.bind(entry),
					hasUndoConflict: entry.hasUndoConflict?.bind(entry),
					hasRedoConflict: entry.hasRedoConflict?.bind(entry)
				});
			}
			console.log(this.past, 'this.past');

			for (let i = 0; i < this.future.length; i++) {
				const entry = this.future[i];
				console.log(entry, 'entry');
				const reversedOperation = {
					...entry,
					operation: entry.reverseOperation.bind(entry),
					reverseOperation: entry.operation.bind(entry),
					hasUndoConflict: entry.hasRedoConflict?.bind(entry),
					hasRedoConflict: entry.hasUndoConflict?.bind(entry),
					description: entry.reverseDescription,
					reverseDescription: entry.description
				};
				console.log(reversedOperation, 'reversedOperation');
				this.past.push(reversedOperation);
			}
		}

		console.log(this.past);
		console.log(undoEntry);
		this.future = [];
		try {
			await this.serialAsyncExecutor.execute(undoEntry.operation.bind(undoEntry));
			this.past.push(undoEntry);
		} catch {
			console.error(`Faulty do operation: ${undoEntry.scopeName}`);
		}

		console.log(this.past, 'this.pastthis.pastthis.pastthis.past');
		this.updateCanUndoRedoStatus(CHANGE_REASON.Do);
	}
	async undo() {
		console.log(this);
		const entry = this.past.pop();
		if (entry === undefined) return;
		console.log(entry);
		console.log(entry.reverseOperation);
		try {
			await this.serialAsyncExecutor.execute(entry.reverseOperation.bind(entry));
			this.future.push(entry);
		} catch (e) {
			console.error(`Faulty reverse operation: ${entry.scopeName}`);
			console.error(e);
		}
		this.updateCanUndoRedoStatus(CHANGE_REASON.Undo);
	}
	async redo() {
		console.log(JSON.parse(JSON.stringify(this.future)));
		const entry = this.future.pop();
		console.log(entry, 'entry');
		if (entry === undefined) return;
		try {
			await this.serialAsyncExecutor.execute(entry.operation.bind(entry));
			this.past.push(entry);
		} catch (e) {
			console.error(`Faulty redo operation: ${entry.scopeName}`);
			console.error(e);
		}
		this.updateCanUndoRedoStatus(CHANGE_REASON.Redo);
	}

	subscribeToCanUndoRedoChange(callback: CallbackFunction) {
		return this.pubsub.subscribe(callback);
	}

	getUndoRedoStatus(): UndoRedoStatus {
		return { ...this.pubsub.get() };
	}
}
