import type { mutators } from '$lib/replicache/mutators';
import type { Todo } from '$lib/replicache/todo';
import { getTodoById } from '$lib/replicache/todo';
import type { Replicache } from 'replicache';

export class UpdateTodoTextCommand {
	public scopeName: string;
	public description: string;
	public reverseDescription: string;
	private payload: { id: string; text: string; updatedBy: string };
	private replicacheInstance: Replicache<typeof mutators>;
	private currentTodo: Todo;

	constructor(
		payload: { id: string; text: string; updatedBy: string },
		replicacheInstance: Replicache<typeof mutators>,
		currentTodo: Todo
	) {
		this.scopeName = `update_todo_text:${payload.id}`;
		this.description = `update todo text: '${currentTodo.text}' -> '${payload.text}'`;
		this.reverseDescription = `update todo text: '${payload.text}' -> '${currentTodo.text}'`;
		this.payload = payload;
		this.replicacheInstance = replicacheInstance;
		this.currentTodo = currentTodo;
	}

	public operation() {
		this.replicacheInstance.mutate.updateTodo(this.payload);
	}
	public reverseOperation() {
		this.replicacheInstance.mutate.updateTodo(this.currentTodo);
	}
	public async hasUndoConflict() {
		const todoNow = await this.replicacheInstance.query((tx) => getTodoById(tx, this.payload.id));
		if (!todoNow) return true;
		return todoNow.updatedBy !== this.payload.updatedBy && todoNow.text !== this.payload.text;
	}
	public async hasRedoConflict() {
		const todoNow = await this.replicacheInstance.query((tx) => getTodoById(tx, this.payload.id));
		if (!todoNow) return true;
		return todoNow.updatedBy !== this.payload.updatedBy && todoNow.text !== this.currentTodo.text;
	}
}
