type ResRej = (value: unknown) => void;

type Queueable = {
	operation: () => unknown;
	resolvers: { resolve: ResRej; reject: ResRej };
};

// We want to run async operations serially and in order (the promises will resolve in the same order they were queued)
export function createSerialAsyncExecutor() {
	const _queue: Queueable[] = [];
	let isWorking = false;
	async function pullFromQueue() {
		isWorking = true;
		while (true) {
			const next = _queue.pop();
			if (next === undefined) break;

			const {
				operation,
				resolvers: { resolve, reject }
			} = next;
			try {
				const res = await operation();
				resolve(res);
			} catch (e) {
				reject(e);
			}
		}
		isWorking = false;
	}
	return {
		execute(operation: () => unknown) {
			return new Promise((resolve, reject) => {
				_queue.push({ operation, resolvers: { resolve, reject } });
				if (!isWorking) pullFromQueue();
			});
		}
	};
}
