export class ChangeFilterCommand {
	public scopeName: string;
	public description: string;
	public reverseDescription: string;
	private payload: { from: string; to: string };

	constructor(payload: { from: string; to: string }) {
		this.scopeName = 'filterChange';
		this.description = `filter change ${payload.from} -> ${payload.to}`;
		this.reverseDescription = `filter change ${payload.to} -> ${payload.from}`;
		this.payload = payload;
	}

	operation() {
		window.location.hash = this.payload.to;
	}
	reverseOperation() {
		window.location.hash = this.payload.from;
	}
}
