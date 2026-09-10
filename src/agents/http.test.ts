import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { httpFetch } from "./http.ts";

test("timeout also covers a stalled JSON response body", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.flushHeaders();
    res.write('{"pending":');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const result = await httpFetch({ url: `http://127.0.0.1:${address.port}`, timeoutMs: 100 });
    assert.equal(result.error?.type, "network_error");
    assert.match(result.error!.message, /timeout/i);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
