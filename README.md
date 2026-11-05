# dsh-web-fetch-crw

[![dsh-plugin](https://img.shields.io/badge/dsh-plugin-blue)](https://github.com/topics/dsh-plugin)
[![CI/CD](https://github.com/jaco-tech/dsh-web-fetch-crw/actions/workflows/ci.yml/badge.svg)](https://github.com/jaco-tech/dsh-web-fetch-crw/actions/workflows/ci.yml)

[crw](https://github.com/us/crw) (Firecrawl-compatible) fetch provider plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Registers a `WebFetchProvider` into `ctx.web` so that the existing `web_fetch` model tool retrieves page content through your [crw](https://github.com/us/crw) instance — which converts HTML to clean markdown. No auth, no API key.

crw is a self-hosted web scraping and crawling service that implements the [Firecrawl](https://github.com/nicknisi/firecrawl) API. It provides a drop-in replacement for the Firecrawl `/v1/scrape` endpoint.

## Install

```bash
npm install @jaco-tech/dsh-web-fetch-crw
```

Requires DeepSeek Harness 0.2.1-rc.5. The peers are pinned exactly (`@deepseek-ai/dsh-web`
`0.2.1-rc.5`, `@deepseek-ai/cordis` `~4.0.5`), like the first-party DSH web plugins: a range
would let npm install a second dsh-web/cordis beside DSH's own, which shadows the framework.
Every DSH bump therefore needs a release of this package with the peers re-pinned
(`test/peer-pins.test.mjs` enforces the rule). DSH 0.1.x is no longer supported; use
`@jaco-tech/dsh-web-fetch-crw@0.1` there.

## Configure

### 1. Install the package

```bash
npm install @jaco-tech/dsh-web-fetch-crw
```

### 2. Add it to your DSH profile

Edit `~/.dsh/profiles/web/cordis.patch.yml` (create it if it doesn't exist) and add:

```yaml
- insert:
    - id: web-fetch-crw
      name: '@jaco-tech/dsh-web-fetch-crw'
      config:
        # Required: point at your crw (Firecrawl-compatible) instance
        baseURL: 'http://your-crw-instance:3000'
```

If you have multiple fetch providers registered, pin `ctx.web` to use this one:

```yaml
- replace:
    - id: web
      config:
        fetchProvider: crw
```

### 3. Restart DSH

Stop your running `dsh` process and start it again:

```bash
npx @deepseek-ai/dsh web
```

The plugin will be loaded automatically. The `web_fetch` tool in your agent will now use your crw instance.

### 4. (Optional) Configure via the Web UI

Once DSH is running, go to **Settings → Plugins** in the Web UI. You'll see a "web-fetch-crw" card where you can edit the `baseURL` without editing YAML files. `baseURL` is a volatile setting: the provider reads it on every fetch, so an edit applies without restarting DSH.

## How it works

This is a [Cordis](https://github.com/cordiverse/cordis) plugin that implements the `WebFetchProvider` interface from `@deepseek-ai/dsh-web`:

```typescript
export const name = "web-fetch-crw"
export const inject = ["web"]

export function apply(ctx, config) {
  ctx.web.registerFetchProvider({
    id: "crw",
    available() { /* URL.canParse(config.baseURL) */ },
    async fetch(request, signal) {
      // POST /v1/scrape { url, formats: ["markdown"] }
      // maps response to WebFetchResult (body as markdown text)
    }
  })
}
```

The existing `@deepseek-ai/dsh-tool-web` consumer calls `ctx.web.fetch()` — your crw instance serves the content automatically.

## Provider interface

| Method | Behavior |
|---|---|
| `available()` | Returns `true` when `baseURL` is a valid URL |
| `fetch(request, signal?)` | `POST /v1/scrape` with `{ url, formats: ["markdown"] }`. Returns the scraped markdown as `kind: "text"` body (no double-conversion through turndown). |

## Upstream

This plugin communicates with [crw](https://github.com/us/crw) via its Firecrawl-compatible API (`POST /v1/scrape`). crw is a self-hosted web scraping and crawling service that renders pages (via Lightpanda or Chromium) and produces clean markdown. You need a running crw instance to use this plugin.

## Release process

```bash
# Tag and push — the CI workflow builds and publishes to npm automatically
git tag v0.2.2
git push origin v0.2.2
```

Requires the `NPM_TOKEN` secret to be set in the repository.

## Development

```bash
npm install
npm run build
npm test    # builds, then imports the built package against the installed DSH (hermetic)
```

## License

MIT