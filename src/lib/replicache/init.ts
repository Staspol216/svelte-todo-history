import { Replicache } from 'replicache';
import { mutators } from '$lib/replicache/mutators';

export function initReplicache(spaceID: string) {
	const licenseKey = import.meta.env.VITE_REPLICACHE_LICENSE_KEY;
	if (!licenseKey) {
		throw new Error('Missing VITE_REPLICACHE_LICENSE_KEY');
	}
	return new Replicache({
		licenseKey,
		pushURL: `/api/replicache/${spaceID}/push`,
		pullURL: `/api/replicache/${spaceID}/pull`,
		name: spaceID,
		mutators
	});
}
