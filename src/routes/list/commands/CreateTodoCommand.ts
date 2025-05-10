import type { mutators } from '$lib/replicache/mutators';
import { getTodoById, type Todo } from '$lib/replicache/todo';
import type { Replicache } from 'replicache';

export class CreateTodoCommand {
	public scopeName: string;
	public description: string;
	public reverseDescription: string;
	private payload: { todoToCreate: Todo };
	private replicacheInstance: Replicache<typeof mutators>;
	public isRedo: { value: boolean };
	public sort: { value: number };

	constructor(
		payload: { todoToCreate: Todo },
		replicacheInstance: Replicache<typeof mutators>,
		isRedo: { value: boolean },
		sort: { value: number }
	) {
		this.scopeName = `create_todo:${payload.todoToCreate.id}`;
		this.description = `create todo: '${payload.todoToCreate.text}'`;
		this.reverseDescription = `uncreate todo: '${payload.todoToCreate.text}'`;
		this.payload = payload;
		this.replicacheInstance = replicacheInstance;
		this.isRedo = isRedo;
		this.sort = sort;
	}

	async operation() {
		if (this.isRedo.value) {
			this.replicacheInstance.mutate.unDeleteTodo({
				...this.payload.todoToCreate,
				sort: this.sort.value
			});
		} else {
			this.isRedo.value = true;
			await this.replicacheInstance.mutate.createTodo(this.payload.todoToCreate);
			const createdTodo = await this.replicacheInstance.query((tx) =>
				getTodoById(tx, this.payload.todoToCreate.id)
			);
			if (createdTodo) {
				this.sort.value = createdTodo.sort;
			}
		}
	}
	reverseOperation() {
		this.replicacheInstance.mutate.deleteTodo(this.payload.todoToCreate.id);
	}
	async hasUndoConflict() {
		const currentTodo = await this.replicacheInstance.query((tx) =>
			getTodoById(tx, this.payload.todoToCreate.id)
		);
		if (!currentTodo) return true;
		return currentTodo.updatedBy !== this.payload.todoToCreate.updatedBy;
	}
}
