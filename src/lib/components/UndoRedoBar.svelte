<script lang="ts">
	import { UndoManager } from '$lib/undo/UndoManager';
	import { onMount } from 'svelte';

	export let undoRedoManager: UndoManager;

	let canUndoRedo = undoRedoManager.getUndoRedoStatus();
	console.log(canUndoRedo);

	onMount(() => {
		const undoUnsubscribe = undoRedoManager.subscribeToCanUndoRedoChange((newStatus) => {
			console.log('undoRedo sub fired', { ...newStatus });
			canUndoRedo = newStatus;
		});

		return () => {
			undoUnsubscribe();
		};
	});
</script>

<section class="undo-redo-bar">
	<button
		on:click={() => undoRedoManager.undo()}
		title={canUndoRedo.canUndo ? canUndoRedo.canUndo : ''}
		disabled={!canUndoRedo.canUndo}
	>
		<img src="/undo.svg" alt="Undo Icon" />
	</button>
	<button
		on:click={() => undoRedoManager.redo()}
		title={canUndoRedo.canRedo ? canUndoRedo.canRedo : ''}
		disabled={!canUndoRedo.canRedo}
	>
		<img src="/redo.svg" alt="Redo Icon" />
	</button>
</section>

<style>
	.undo-redo-bar {
		display: flex;
		justify-content: center;
	}
	.undo-redo-bar button {
		opacity: 1;
		transition: opacity 150ms ease-in-out;
		border-radius: 15%;
		border: 1px solid rgba(0, 0, 0, 0.4);
		padding: 0.4em;
		margin: 0 0.2em;
	}
	.undo-redo-bar button:disabled {
		opacity: 0.3;
	}
</style>
