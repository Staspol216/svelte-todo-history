import type { mutators } from '$lib/replicache/mutators';
import type { Todo } from '$lib/replicache/todo';
import { getTodoById } from '$lib/replicache/todo';
import type { Replicache } from 'replicache';

export class SetTodoCompletedCommand {
	public scopeName: string;
	public description: string;
	public reverseDescription: string;
	private payload: { id: string; completed: boolean; updatedBy: string };
	private replicacheInstance: Replicache<typeof mutators>;
	private currentTodo: Todo;

	constructor(
		payload: { id: string; completed: boolean; updatedBy: string },
		replicacheInstance: Replicache<typeof mutators>,
		currentTodo: Todo
	) {
		this.scopeName = `update_todo_completion:${payload.id}`;
		this.description = `mark todo ${currentTodo.text} ${payload.completed ? 'complete' : 'incomplete'}`;
		this.reverseDescription = `mark todo ${currentTodo.text} ${payload.completed ? 'incomplete' : 'complete'}`;
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
		return (
			todoNow.updatedBy !== this.payload.updatedBy && todoNow.completed !== this.payload.completed
		);
	}
	public async hasRedoConflict() {
		const todoNow = await this.replicacheInstance.query((tx) => getTodoById(tx, this.payload.id));
		if (!todoNow) return true;
		return (
			todoNow.updatedBy !== this.payload.updatedBy && todoNow.completed === this.payload.completed
		);
	}
}
