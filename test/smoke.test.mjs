// Hermetic smoke test: load the BUILT package the way DSH's loader does (an
// ESM import of the package entry) and run `apply` against a minimal fake ctx.
// No network beyond a loopback server this test starts itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { updateVolatile } from "@deepseek-ai/cosmokit";

const BASE_URL = "http://crawler01.work.int.steen-ops.net:3000";

/** Import by package name (self-reference via "exports"), as DSH resolves plugins. */
async function load() {
  return await import("@jaco-tech/dsh-web-fetch-crw");
}

/** A ctx carrying only the `web` seam the plugin injects. */
function fakeContext() {
  const providers = [];
  return { providers, ctx: { web: { registerFetchProvider: (provider) => { providers.push(provider); } } } };
}

test("the built module imports against the installed DSH", async () => {
  const mod = await load();
  assert.equal(mod.name, "web-fetch-crw");
  assert.deepEqual(mod.inject, ["web"]);
  assert.equal(typeof mod.apply, "function");
  assert.equal(typeof mod.Config, "function");
  assert.equal(mod.CRW_PROVIDER_ID, "crw");
});

test("Config resolves baseURL as a volatile setting and requires it", async () => {
  const { Config } = await load();
  const config = Config({ baseURL: BASE_URL });
  assert.equal(config.baseURL.get(), BASE_URL);
  assert.throws(() => Config({}));
});

test("apply registers the crw fetch provider into ctx.web", async () => {
  const { Config, apply } = await load();
  const { ctx, providers } = fakeContext();
  apply(ctx, Config({ baseURL: BASE_URL }));
  assert.equal(providers.length, 1);
  assert.equal(providers[0].id, "crw");
  assert.equal(providers[0].available(), true);
});

test("the provider reads baseURL live, so a settings change applies without a reload", async () => {
  const { Config, apply } = await load();
  const { ctx, providers } = fakeContext();
  const config = Config({ baseURL: "not a url" });
  apply(ctx, config);
  assert.equal(providers[0].available(), false);
  updateVolatile(config.baseURL, Config({ baseURL: BASE_URL }).baseURL);
  assert.equal(providers[0].available(), true);
});

test("fetch POSTs /v1/scrape and maps the markdown", async () => {
  const { Config, apply } = await load();
  const seen = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, body: JSON.parse(body) });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        success: true,
        data: { markdown: "# Hello", metadata: { sourceURL: "https://example.com/final", statusCode: 200 } },
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { ctx, providers } = fakeContext();
    apply(ctx, Config({ baseURL: `http://127.0.0.1:${server.address().port}` }));
    const result = await providers[0].fetch({ url: "https://example.com/" });
    assert.deepEqual(seen, [{ method: "POST", url: "/v1/scrape", body: { url: "https://example.com/", formats: ["markdown"] } }]);
    assert.deepEqual(result, {
      url: "https://example.com/final",
      statusCode: 200,
      body: { kind: "text", content: "# Hello" },
      truncated: false,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
