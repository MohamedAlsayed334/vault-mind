import { TokenStore } from "@/auth/TokenStore";

export class AuthManager {
	private tokenStore = new TokenStore();

	isAuthenticated(providerId: string): boolean {
		return !!this.tokenStore.get(providerId);
	}

	logout(providerId: string): void {
		this.tokenStore.clear(providerId);
	}
}
