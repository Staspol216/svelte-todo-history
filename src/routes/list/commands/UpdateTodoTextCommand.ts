import type { mutators } from '$lib/replicache/mutators';
import type { Todo } from '$lib/replicache/todo';
import { getTodoById } from '$lib/replicache/todo';
import type { Replicache } from 'replicache';

export class UpdateTodoTextCommand {
	scopeName: string;
	description: string;
	reverseDescription: string;
	payload: { id: string; text: string; updatedBy: string };
	replicacheInstance: Replicache<typeof mutators>;
	currentTodo: Todo;
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

	operation() {
		this.replicacheInstance.mutate.updateTodo(this.payload);
	}
	reverseOperation() {
		this.replicacheInstance.mutate.updateTodo(this.currentTodo);
	}
	async hasUndoConflict() {
		const todoNow = await this.replicacheInstance.query((tx) => getTodoById(tx, this.payload.id));
		if (!todoNow) return true;
		return todoNow.updatedBy !== this.payload.updatedBy && todoNow.text !== this.payload.text;
	}
	async hasRedoConflict() {
		const todoNow = await this.replicacheInstance.query((tx) => getTodoById(tx, this.payload.id));
		if (!todoNow) return true;
		return todoNow.updatedBy !== this.payload.updatedBy && todoNow.text !== this.currentTodo.text;
	}
}
