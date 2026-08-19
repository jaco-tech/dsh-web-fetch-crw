# dsh-web-fetch-crw

[![dsh-plugin](https://img.shields.io/badge/dsh-plugin-blue)](https://github.com/topics/dsh-plugin)

crw (Firecrawl-compatible) fetch provider plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Registers a `WebFetchProvider` into `ctx.web` so that the existing `web_fetch` model tool retrieves page content through your crw instance — which converts HTML to clean markdown. No auth, no API key.

## Install

```bash
npm install @jaco-tech/dsh-web-fetch-crw
```

## Configure

Add to your DSH profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: web-fetch-crw
      name: '@jaco-tech/dsh-web-fetch-crw'
      config:
        baseURL: 'http://your-crw-instance:3000'
```

Optionally pin `ctx.web` to use this provider explicitly:

```yaml
- replace:
    - id: web
      config:
        fetchProvider: crw
```

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

## Development

```bash
npm install
npm run build
```

Published to npm as `@jaco-tech/dsh-web-fetch-crw`.

## License

MIT