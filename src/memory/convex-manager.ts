import fs from "node:fs/promises";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type {
  MemoryEmbeddingProbeResult,
  MemoryProviderStatus,
  MemorySearchManager,
  MemorySearchResult,
} from "./types.js";

const log = createSubsystemLogger("memory:convex");

const publicSearch = anyApi.publicApi.search.search;
const publicHealth = anyApi.publicApi.status.health;

const SEARCH_TIMEOUT_MS = 15_000;

export class ConvexMemoryBackend implements MemorySearchManager {
  private readonly client: ConvexHttpClient;
  readonly agentId: string;
  private readonly workspaceDir?: string;

  constructor(params: { convexUrl: string; agentId: string; workspaceDir?: string }) {
    this.client = new ConvexHttpClient(params.convexUrl, {
      skipConvexDeploymentUrlCheck: true,
    });
    this.agentId = params.agentId;
    this.workspaceDir = params.workspaceDir;
  }

  async search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const response = await Promise.race([
      this.client.action(publicSearch, {
        agentId: this.agentId,
        query: trimmed,
        limit: opts?.maxResults,
        minScore: opts?.minScore,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("convex search timed out")), SEARCH_TIMEOUT_MS),
      ),
    ]);

    const results = (
      response as {
        results: Array<{
          content: string;
          sourceType: string;
          sourcePath: string;
          score: number;
          title?: string;
        }>;
      }
    ).results;

    return results.map((r) => ({
      path: r.sourcePath,
      startLine: 1,
      endLine: r.content.split("\n").length,
      score: r.score,
      snippet: r.content,
      source: r.sourceType === "session" ? ("sessions" as const) : ("memory" as const),
    }));
  }

  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    const relPath = params.relPath?.trim();
    if (!relPath) {
      throw new Error("path required");
    }
    if (!this.workspaceDir) {
      throw new Error("workspace dir not configured for convex memory backend");
    }
    const absPath = path.resolve(this.workspaceDir, relPath);
    if (!absPath.startsWith(this.workspaceDir)) {
      throw new Error("path escapes workspace");
    }
    let text: string;
    try {
      text = await fs.readFile(absPath, "utf-8");
    } catch {
      throw new Error("file not found: " + relPath);
    }
    const allLines = text.split("\n");
    const start = params.from ?? 0;
    const count = params.lines ?? allLines.length;
    const sliced = allLines.slice(start, start + count);
    return { text: sliced.join("\n"), path: relPath };
  }

  status(): MemoryProviderStatus {
    return {
      backend: "convex",
      provider: "convex",
      model: "text-embedding-3-small",
      vector: { enabled: true, available: true, dims: 1536 },
      batch: {
        enabled: false,
        failures: 0,
        limit: 0,
        wait: false,
        concurrency: 0,
        pollIntervalMs: 0,
        timeoutMs: 0,
      },
    };
  }

  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    try {
      await this.client.query(publicHealth, {});
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`convex embedding probe failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  async probeVectorAvailability(): Promise<boolean> {
    try {
      await this.client.query(publicHealth, {});
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`convex vector probe failed: ${message}`);
      return false;
    }
  }

  async close(): Promise<void> {
    // ConvexHttpClient is stateless HTTP -- no cleanup needed
  }
}
