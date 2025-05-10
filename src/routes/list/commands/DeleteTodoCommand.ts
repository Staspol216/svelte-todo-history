import type { mutators } from '$lib/replicache/mutators';
import { type Todo } from '$lib/replicache/todo';
import type { Replicache } from 'replicache';

export class DeleteTodoCommand {
	public scopeName: string;
	public description: string;
	public reverseDescription: string;
	private payload: { id: string };
	private replicacheInstance: Replicache<typeof mutators>;
	public currentTodo: Todo;

	constructor(
		payload: { id: string },
		replicacheInstance: Replicache<typeof mutators>,
		currentTodo: Todo
	) {
		this.scopeName = `delete_todo:${payload.id}`;
		this.description = `delete todo: '${currentTodo.text}'`;
		this.reverseDescription = `undelete_todo:${payload.id}`;
		this.payload = payload;
		this.replicacheInstance = replicacheInstance;
		this.currentTodo = currentTodo;
	}

	operation() {
		this.replicacheInstance.mutate.deleteTodo(this.payload.id);
	}

	reverseOperation() {
		this.replicacheInstance.mutate.unDeleteTodo(this.currentTodo);
	}
}
