import { Plugin, Platform, requestUrl } from "obsidian";
import { GeminiProvider } from "@/providers/gemini/GeminiProvider";
import { ProviderRegistry } from "@/providers/base/ProviderRegistry";
import { ToolRegistry } from "@/tools/ToolRegistry";
import { VaultAdapter } from "@/obsidian/VaultAdapter";
import { AgentOrchestrator } from "@/core/AgentOrchestrator";
import { ReadNoteTool } from "@/tools/vault/ReadNote";
import type { PlatformCapabilities } from "@/core/types";

export default class VaultMindPlugin extends Plugin {
  providerRegistry!: ProviderRegistry;
  toolRegistry!: ToolRegistry;
  vaultAdapter!: VaultAdapter;
  orchestrator!: AgentOrchestrator;
  platform!: PlatformCapabilities;

  async onload() {
    this.platform = {
      isMobile: Platform.isMobile,
      canStream: true, // determined per-provider at runtime
      canRunLocalServer: Platform.isDesktop,
    };

    // Core adapters
    this.vaultAdapter = new VaultAdapter(this.app);

    // Registries
    this.providerRegistry = new ProviderRegistry();
    this.toolRegistry = new ToolRegistry();

    // Register built-in tools
    this.toolRegistry.register(ReadNoteTool);

    // Register the Gemini provider. API-key settings are added in Phase 2.
    this.providerRegistry.register(new GeminiProvider(async (model, apiKey, body, signal) => {
      const response = await requestUrl({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        throw: false,
      });
      if (signal?.aborted) throw new Error("Request cancelled");
      if (response.status >= 400) {
        throw new Error(`Gemini API ${response.status}: ${JSON.stringify(response.json)}`);
      }
      const parts = response.json?.candidates?.[0]?.content?.parts ?? [];
      return {
        text: parts.filter((part: any) => typeof part.text === "string").map((part: any) => part.text).join(""),
        functionCalls: parts.filter((part: any) => part.functionCall?.name).map((part: any) => ({
          name: part.functionCall.name, args: part.functionCall.args ?? {},
        })),
      };
    }));

    // TODO: mount UI views

    console.log("Vault Mind loaded");
  }

  onunload() {
    console.log("Vault Mind unloaded");
  }
}
