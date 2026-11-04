export class OAuthFlow {
	async generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
		const array = new Uint8Array(32);
		window.crypto.getRandomValues(array);
		const codeVerifier = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");

		const encoder = new TextEncoder();
		const data = encoder.encode(codeVerifier);
		const digest = await window.crypto.subtle.digest("SHA-256", data);
		const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");

		return { codeVerifier, codeChallenge };
	}

	buildAuthUrl(providerId: string, clientId: string, redirectUri: string, codeChallenge: string): string {
		if (providerId === "google") {
			const params = new URLSearchParams({
				client_id: clientId,
				redirect_uri: redirectUri,
				response_type: "code",
				scope: "https://www.googleapis.com/auth/generative-language",
				code_challenge: codeChallenge,
				code_challenge_method: "S256",
			});
			return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
		} else if (providerId === "openai") {
			const params = new URLSearchParams({
				client_id: clientId,
				redirect_uri: redirectUri,
				response_type: "code",
				scope: "openid profile email",
				code_challenge: codeChallenge,
				code_challenge_method: "S256",
			});
			return `https://auth.openai.com/authorize?${params.toString()}`;
		}
		throw new Error(`Unknown OAuth provider: ${providerId}`);
	}
}
