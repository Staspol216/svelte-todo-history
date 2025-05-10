import type { mutators } from '$lib/replicache/mutators';
import type { Todo } from '$lib/replicache/todo';
import type { Replicache } from 'replicache';
import { listTodos } from '$lib/replicache/todo';

export class DeleteAllCompletedTodoCommand {
	public scopeName: string;
	public description: string;
	public reverseDescription: string;
	private payload: { allIds: Set<string>; updatedBy: string; todos: Todo[] };
	private replicacheInstance: Replicache<typeof mutators>;

	constructor(
		payload: { allIds: Set<string>; updatedBy: string; todos: Todo[] },
		replicacheInstance: Replicache<typeof mutators>
	) {
		this.scopeName = `deleteAllCompleted:${[...payload.allIds].join(',')}`;
		this.description = 'delete completed todos';
		this.reverseDescription = 'undelete completed todos';
		this.payload = payload;
		this.replicacheInstance = replicacheInstance;
	}

	public async operation() {
		let currentList = await this.replicacheInstance.query(listTodos);
		// if the another session adds or deletes items that's fine, even if they are completed they won't be deleted by a redo
		currentList = currentList.filter((todo) => this.payload.allIds.has(todo.id));
		currentList.forEach((todo) => this.replicacheInstance.mutate.deleteTodo(todo.id));
	}
	public reverseOperation() {
		this.payload.todos
			.filter((todo) => this.payload.allIds.has(todo.id))
			.forEach((todo) => this.replicacheInstance.mutate.unDeleteTodo(todo));
	}
	public async hasRedoConflict() {
		const currentList = await this.replicacheInstance.query(listTodos);
		return !!currentList
			.filter((todo) => this.payload.allIds.has(todo.id))
			.find((todo) => todo.updatedBy !== this.payload.updatedBy);
	}
}
