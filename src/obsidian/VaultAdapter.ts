import { App, TFile, normalizePath } from "obsidian";

/**
 * All vault I/O goes through this adapter.
 * Core modules (agent, tools, context) never import from "obsidian" directly.
 * This makes the engine testable without a live Obsidian instance.
 */
export class VaultAdapter {
  constructor(private app: App) {}

  async read(path: string): Promise<string> {
    const file = this.getFile(path);
    return this.app.vault.cachedRead(file);
  }

  async write(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(normalized, content);
    }
  }

  /**
   * Atomic read-modify-write. Safer than read + write for concurrent edits.
   */
  async process(path: string, fn: (content: string) => string): Promise<void> {
    const file = this.getFile(path);
    await this.app.vault.process(file, fn);
  }

  async create(path: string, content = ""): Promise<TFile> {
    return this.app.vault.create(normalizePath(path), content);
  }

  async delete(path: string): Promise<void> {
    const file = this.getFile(path);
    await this.app.vault.delete(file);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const file = this.getFile(oldPath);
    await this.app.fileManager.renameFile(file, normalizePath(newPath));
  }

  async createFolder(path: string): Promise<void> {
    await this.app.vault.createFolder(normalizePath(path));
  }

  exists(path: string): boolean {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  listFiles(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getActiveFile(): TFile | null {
    return this.app.workspace.getActiveFile();
  }

  getActiveEditor() {
    return this.app.workspace.activeEditor?.editor ?? null;
  }

  getSelection(): string {
    const editor = this.getActiveEditor();
    return editor?.getSelection() ?? "";
  }

  private getFile(path: string): TFile {
    const normalized = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${normalized}`);
    }
    return file;
  }
}
