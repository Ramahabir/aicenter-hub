import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/service-hub/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the AI Center Service Hub below its Nginx base path", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Service Hub \| AI Center UB/i);
  assert.match(html, /One hub\./i);
  assert.match(html, /Remote Printing/i);
  assert.match(html, /service-hub\/_next/i);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("keeps printer execution in the local service", async () => {
  const [client, server, hosting] = await Promise.all([
    readFile(new URL("../app/ServiceHub.tsx", import.meta.url), "utf8"),
    readFile(new URL("../printer-server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  assert.ok(client.includes('const serviceBasePath = "/service-hub";'));
  assert.match(server, /pdf-to-printer/);
  assert.match(server, /25 \* 1024 \* 1024/);
  assert.match(server, /SERVICE_HUB_PIN/);
  assert.ok(server.includes('const BASE_PATH = "/service-hub";'));
  assert.match(server, /express\.static\(clientAssetsDir/);
  assert.match(server, /api\/test-print/);
  await access(new URL("../output/pdf/ai-center-printer-test-page.pdf", import.meta.url));
  assert.deepEqual(JSON.parse(hosting), { d1: null, r2: null });
});
