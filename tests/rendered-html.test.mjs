import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the AI Center Service Hub", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Service Hub \| AI Center UB/i);
  assert.match(html, /One hub\./i);
  assert.match(html, /Remote Printing/i);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("keeps printer execution in the local service", async () => {
  const [client, server, hosting] = await Promise.all([
    readFile(new URL("../app/ServiceHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../printer-server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  assert.match(client, /api\/print/);
  assert.match(server, /pdf-to-printer/);
  assert.match(server, /25 \* 1024 \* 1024/);
  assert.match(server, /SERVICE_HUB_PIN/);
  assert.deepEqual(JSON.parse(hosting), { d1: null, r2: null });
});
