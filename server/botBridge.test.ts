import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Verifies the bot bridge client:
 *  - reads the shared secret from BRIDGE_SHARED_SECRET and sends it as a header
 *  - correctly parses a healthy response
 *  - surfaces auth failures from the bridge
 *
 * We spin up a tiny local HTTP server that mimics the bot's bridge.js so the
 * test exercises the real fetch path without depending on a running bot.
 */

const SHARED_SECRET = "test-bridge-secret-123";

let server: http.Server;
let baseUrl: string;
let receivedSecret: string | undefined;

beforeEach(async () => {
  vi.resetModules();
  process.env.BRIDGE_SHARED_SECRET = SHARED_SECRET;

  server = http.createServer((req, res) => {
    receivedSecret = req.headers["x-bridge-secret"] as string | undefined;
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") {
      if (receivedSecret !== SHARED_SECRET) {
        res.writeHead(401);
        res.end(JSON.stringify({ ok: false, error: "Geçersiz köprü sırrı." }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, botTag: "Patrick#9332", guildCount: 2 }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Bulunamadı." }));
  });

  await new Promise<void>(resolve => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe("botBridge client", () => {
  it("sends the shared secret and parses a healthy bridge response", async () => {
    const { pingBridge } = await import("./_core/botBridge");
    const result = await pingBridge(baseUrl);
    expect(result.ok).toBe(true);
    expect(result.botTag).toBe("Patrick#9332");
    expect(receivedSecret).toBe(SHARED_SECRET);
  });

  it("throws when the bridge rejects an invalid secret", async () => {
    // Force a mismatched secret on the client side.
    process.env.BRIDGE_SHARED_SECRET = "wrong-secret";
    vi.resetModules();
    const { pingBridge } = await import("./_core/botBridge");
    await expect(pingBridge(baseUrl)).rejects.toThrowError(/sır|secret|UNAUTHORIZED/i);
  });
});
