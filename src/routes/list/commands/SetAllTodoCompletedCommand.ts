import type { mutators } from '$lib/replicache/mutators';
import type { Replicache } from 'replicache';
import { listTodos } from '$lib/replicache/todo';

export class SetAllTodoCompletedCommand {
	public scopeName: string;
	public description: string;
	public reverseDescription: string;
	private payload: { completed: boolean; allIds: Set<string>; updatedBy: string };
	private replicacheInstance: Replicache<typeof mutators>;

	constructor(
		payload: { completed: boolean; allIds: Set<string>; updatedBy: string },
		replicacheInstance: Replicache<typeof mutators>
	) {
		this.scopeName = `setAllCompleted:${[...payload.allIds].join(',')}`;
		this.description = `set all todos ${payload.completed ? 'completed' : 'inccompleted'}`;
		this.reverseDescription = `set all todos ${payload.completed ? 'incompleted' : 'ccompleted'}`;
		this.payload = payload;
		this.replicacheInstance = replicacheInstance;
	}

	async operation() {
		const currentList = await this.replicacheInstance.query(listTodos);
		const remainingItems = currentList
			.filter((todo) => this.payload.allIds.has(todo.id))
			.filter((todo) => todo.completed === !this.payload.completed);
		this.payload.allIds.forEach((id) => this.payload.allIds.delete(id));
		remainingItems.forEach((todo) => this.payload.allIds.add(todo.id));
		remainingItems.forEach((todo) => {
			this.replicacheInstance.mutate.updateTodo({
				...todo,
				updatedBy: this.payload.updatedBy,
				completed: this.payload.completed
			});
		});
	}
	async reverseOperation() {
		const currentList = await this.replicacheInstance.query(listTodos);
		const remainingItems = currentList
			.filter((todo) => this.payload.allIds.has(todo.id))
			.filter((todo) => todo.completed === this.payload.completed);
		this.payload.allIds.forEach((id) => this.payload.allIds.delete(id));
		remainingItems.forEach((todo) => this.payload.allIds.add(todo.id));
		remainingItems.forEach((todo) => {
			this.replicacheInstance.mutate.updateTodo({ ...todo, completed: !this.payload.completed });
		});
	}
	async hasUndoConflict() {
		const currentList = await this.replicacheInstance.query(listTodos);
		return (
			currentList
				.filter((todo) => this.payload.allIds.has(todo.id))
				.filter((todo) => todo.completed === this.payload.completed).length === 0
		);
	}
	async hasRedoConflict() {
		const currentList = await this.replicacheInstance.query(listTodos);
		return (
			currentList
				.filter((todo) => this.payload.allIds.has(todo.id))
				.filter((todo) => todo.completed === !this.payload.completed).length === 0
		);
	}
}
