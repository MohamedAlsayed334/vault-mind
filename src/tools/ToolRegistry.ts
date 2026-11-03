import type { ToolDefinition, ToolResult, PermissionLevel } from "@/core/types";
import type { VaultAdapter } from "@/obsidian/VaultAdapter";

export interface Tool {
  name: string;
  description: string;
  permissionLevel: PermissionLevel;
  inputSchema: Record<string, unknown>;
  execute(args: unknown, vault: VaultAdapter): Promise<ToolResult>;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool {
    const t = this.tools.get(name);
    if (!t) throw new Error(`Tool "${name}" not registered`);
    return t;
  }

  /** Returns definitions in the format providers send to the model */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }
}
