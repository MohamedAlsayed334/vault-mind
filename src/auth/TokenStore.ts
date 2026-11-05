export class TokenStore {
	private storageKeyPrefix = "vault-compass-token-";
	private memoryStore: Map<string, string> = new Map();

	get(providerId: string): string | null {
		if (typeof window !== "undefined" && window.localStorage) {
			return window.localStorage.getItem(this.storageKeyPrefix + providerId);
		}
		return this.memoryStore.get(providerId) || null;
	}

	set(providerId: string, token: string): void {
		if (typeof window !== "undefined" && window.localStorage) {
			window.localStorage.setItem(this.storageKeyPrefix + providerId, token);
		}
		this.memoryStore.set(providerId, token);
	}

	clear(providerId: string): void {
		if (typeof window !== "undefined" && window.localStorage) {
			window.localStorage.removeItem(this.storageKeyPrefix + providerId);
		}
		this.memoryStore.delete(providerId);
	}
}
