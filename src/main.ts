import { Plugin, Platform } from "obsidian";
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

    // TODO: register providers (Gemini, OpenAI) after loading settings

    // TODO: mount UI views

    console.log("Vault Mind loaded");
  }

  onunload() {
    console.log("Vault Mind unloaded");
  }
}
