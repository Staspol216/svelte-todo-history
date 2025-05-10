type Callback<T> = (newVal: T) => void;

export function createPubSub<T>(
	initialValue: T,
	isEqual: (a: T, b: T) => boolean = (a, b) => a === b
) {
	let _val = initialValue;
	const subs = new Set<Callback<T>>();
	return {
		get: () => _val,
		set(newVal: T) {
			if (isEqual(_val, newVal)) return;

			_val = newVal;
			Array.from(subs).forEach((cb) => cb(_val));
		},

		subscribe(cb: Callback<T>) {
			subs.add(cb);
			cb(_val);
			return () => subs.delete(cb);
		}
	};
}
