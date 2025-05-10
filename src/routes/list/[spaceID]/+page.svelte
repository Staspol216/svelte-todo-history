<script lang="ts">
	import { onMount } from 'svelte';
	import { Replicache } from 'replicache';
	import { nanoid } from 'nanoid';
	import { source } from 'sveltekit-sse';
	import { type M } from '$lib/replicache/mutators';
	import { page } from '$app/stores';
	import { listTodos } from '$lib/replicache/todo';
	import type { Todo } from '$lib/replicache/todo';

	import TodoMVC from '$lib/components/TodoMVC.svelte';
	import TestSync from '$lib/components/TestSync.svelte';

	import { CHANGE_REASON, UndoManager, type UndoRedoStatus } from '$lib/undo/UndoManager';
	import UndoRedoBar from '$lib/components/UndoRedoBar.svelte';
	import { createPubSub } from '$lib/undo/simplePubSub';
	import { createSerialAsyncExecutor } from '$lib/undo/serialAsyncExecutor';
	import { UpdateTodoTextCommand } from '../commands/UpdateTodoTextCommand';
	import { SetTodoCompletedCommand } from '../commands/SetTodoCompletedCommand';
	import { SetAllTodoCompletedCommand } from '../commands/SetAllTodoCompletedCommand';
	import { DeleteAllCompletedTodoCommand } from '../commands/DeleteAllCompletedTodoCommand';
	import { CreateTodoCommand } from '../commands/CreateTodoCommand';
	import { DeleteTodoCommand } from '../commands/DeleteTodoCommand';
	import { ChangeFilterCommand } from '../commands/ChangeFilterCommand';
	import { initReplicache } from '$lib/replicache/init';

	const { spaceID } = $page.params;
	let replicacheInstance: Replicache<M>;
	let todos: Todo[] = [];
	let areAllChangesSaved = true;
	let mySessionId = '';

	const undoRedoPubSub = createPubSub<UndoRedoStatus>(
		{
			canUndo: false,
			canRedo: false,
			canUndoChangeReason: CHANGE_REASON.NoChange,
			canRedoChangeReason: CHANGE_REASON.NoChange
		},
		(a, b) =>
			a.canUndo === b.canUndo &&
			a.canRedo === b.canRedo &&
			a.canUndoChangeReason === b.canUndoChangeReason &&
			a.canRedoChangeReason === b.canRedoChangeReason
	);
	const serialAsyncExecutor = createSerialAsyncExecutor();
	const undoRedoManager = new UndoManager(undoRedoPubSub, serialAsyncExecutor);

	function getTodoUpdatedByAnother(todos: Todo[]) {
		return todos.filter((todo) => todo.updatedBy !== mySessionId);
	}

	function getLocalTodoById(id: string) {
		return todos.find((todo) => todo.id === id);
	}

	function isEqualTodos(todo?: Todo, otherTodo?: Todo) {
		return todo?.text === otherTodo?.text && todo?.completed === otherTodo?.completed;
	}

	// I also couldn't find a way to learn whether our changes were overriden by the server (see the magic words in mutators.js)
	function updateCanUndoRedoStatusOnServerOverridingOurChanges(data: Todo[]) {
		/* I haven't implemented this, but keeping it here as a placeholder, 
		it needs to figure out if what we got back is the actual change we tried to make.
		if not, the undo stack might require an update, 
		noticably the "description" (tooltip) the user sees would be wrong without this.
		*/
	}

	/*************************************/

	onMount(() => {
		replicacheInstance = initReplicache(spaceID);
		mySessionId = replicacheInstance.clientID;
		replicacheInstance.subscribe(listTodos, (remoteTodos) => {
			/* Doing this because replicache doesn't expose info about whether incoming changes are self-inflicted or external */
			const remoteTodoIds = remoteTodos.map((todo) => todo.id);
			// Without this filtering, it would call it twice on every change, including changes in the current session, which can mess the change reason field
			const updatedByAnotherLocalTodos = getTodoUpdatedByAnother(todos);
			const updatedByAnotherRemoteTodos = getTodoUpdatedByAnother(remoteTodos);

			const todoDeletedByAnotherSession = todos.some((todo) => !remoteTodoIds.includes(todo.id));

			const remoteTodosByCondition = updatedByAnotherRemoteTodos.filter((todo) => {
				const localTodo = getLocalTodoById(todo.id);
				if (!localTodo) return false; // new item
				const localTodoUpdatedByAnother = updatedByAnotherLocalTodos.find(
					({ id }) => id === todo.id
				);
				if (localTodo && !localTodoUpdatedByAnother) return true; // an existing item that was updated by someone else now
				/* this is not perfect - will be called if the other session creates and items and change it, 
				without this session ever touching it - okay for now but not perfect */
				return !isEqualTodos(localTodoUpdatedByAnother, todo);
			});

			if (todoDeletedByAnotherSession || remoteTodosByCondition.length > 0) {
				undoRedoManager.updateCanUndoRedoStatus();
			}

			// if (!updateTodoUndoStatusOnExternalChanges(data)) {
			// 	updateCanUndoRedoStatusOnServerOverridingOurChanges(data);
			// }
			todos = remoteTodos;
			todos.sort((a: Todo, b: Todo) => a.sort - b.sort);
		});
		// Implements a Replicache poke using Server-Sent Events.
		// If a "poke" message is received, it will pull from the server.
		const connection = source(`/api/replicache/${spaceID}/poke`);
		const sseStore = connection.select('poke').transform(() => {
			// console.log('poked! pulling fresh data for spaceID', spaceID);
			replicacheInstance.pull();
		});
		// The line below is kinda dumb, it prevents Svelte from removing this store at compile time (since it has not subscribers)
		const sseUnsubscribe = sseStore.subscribe(() => {});

		// This allows us to show the user whether all their local data is saved on the server
		replicacheInstance.onSync = async (isSyncing) => {
			areAllChangesSaved = (await replicacheInstance.experimentalPendingMutations()).length === 0;
		};

		// cleanup
		return () => {
			replicacheInstance.close();
			sseUnsubscribe();
			connection.close();
		};
	});
	async function createTodo(text: string) {
		const id = nanoid();
		let isRedo = {
			value: false
		};
		const todoToCreate: Todo = {
			id,
			text,
			completed: false,
			updatedBy: mySessionId,
			sort: -1
		};
		let sort = { value: -1 };

		const payload = { todoToCreate };
		undoRedoManager.record(new CreateTodoCommand(payload, replicacheInstance, isRedo, sort));
	}
	function deleteTodo(id: string) {
		const currentTodo = todos.find((todo) => todo.id === id);
		if (!currentTodo) throw new Error(`Bug! update todo couldn't find todo ${id}`);
		const payload = { id };
		undoRedoManager.record(new DeleteTodoCommand(payload, replicacheInstance, currentTodo));
	}
	function updateTodoText(id: string, newText: string) {
		const currentTodo = todos.find((todo) => todo.id === id);
		if (!currentTodo) throw new Error(`Bug! update todo couldn't find todo ${id}`);

		if (newText === currentTodo.text) return;

		const updated = { id, text: newText, updatedBy: mySessionId };
		undoRedoManager.record(new UpdateTodoTextCommand(updated, replicacheInstance, currentTodo));
	}
	function updateTodoCompleted(id: string, isCompleted: boolean) {
		const currentTodo = todos.find((todo) => todo.id === id);
		if (!currentTodo) throw new Error(`Bug! update todo couldn't find todo ${id}`);
		if (isCompleted === currentTodo.completed) return;

		const updated = { id, completed: isCompleted, updatedBy: mySessionId };
		undoRedoManager.record(new SetTodoCompletedCommand(updated, replicacheInstance, currentTodo));
	}
	function setAllCompletion(isCompleted: boolean) {
		const initialAllIdsList = todos.map((item) => item.id);
		const allIds = new Set(initialAllIdsList);
		const payload = { completed: isCompleted, allIds, updatedBy: mySessionId };
		// It we keep toggling any remaining items that weren't completed/uncompleted individually (by another user), if no items remain the operation will be removed
		undoRedoManager.record(new SetAllTodoCompletedCommand(payload, replicacheInstance));
	}
	function deleteAllCompletedTodos() {
		const completedTodoIds = todos.filter((todo) => todo.completed).map((todo) => todo.id);
		const allIds = new Set(completedTodoIds);
		const payload = { allIds, updatedBy: mySessionId, todos };
		undoRedoManager.record(new DeleteAllCompletedTodoCommand(payload, replicacheInstance));
	}
	function registerNavigation(from: string, to: string) {
		if (from === to) return;
		const payload = { from, to };
		undoRedoManager.record(new ChangeFilterCommand(payload));
	}
</script>

<p>{areAllChangesSaved ? 'All Data Saved' : 'Sync Pending'}</p>

<UndoRedoBar {undoRedoManager} />

<TestSync {undoRedoManager} />

<section class="todoapp">
	<TodoMVC
		items={todos}
		onCreateItem={createTodo}
		onDeleteItem={deleteTodo}
		onUpdateItemText={updateTodoText}
		onUpdateItemCompleted={updateTodoCompleted}
		onSetAllCompletion={setAllCompletion}
		onDeleteAllCompletedTodos={deleteAllCompletedTodos}
		onNavigation={registerNavigation}
	/>
</section>
