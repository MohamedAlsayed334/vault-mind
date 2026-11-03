import type { AIProvider } from "./AIProvider";

export class ProviderRegistry {
  private providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AIProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`Provider "${id}" not registered`);
    return p;
  }

  list(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }
}
