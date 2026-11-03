import { z } from "zod";
import type { Tool } from "../ToolRegistry";
import type { VaultAdapter } from "@/obsidian/VaultAdapter";

const schema = z.object({
  path: z.string().min(1, "Path is required"),
});

export const ReadNoteTool: Tool = {
  name: "read_note",
  description: "Read the full content of a note from the vault by its path.",
  permissionLevel: "read",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Vault-relative path to the note, e.g. 'folder/note.md'" },
    },
    required: ["path"],
  },

  async execute(args: unknown, vault: VaultAdapter) {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: parsed.error.message };
    }

    try {
      const content = await vault.read(parsed.data.path);
      return { success: true, data: content };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};
