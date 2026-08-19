import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";
import type { WebFetchProvider, WebFetchRequest, WebFetchResult } from "@deepseek-ai/dsh-web";

//#region crw response types
interface CrwScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    raw?: string;
    metadata?: {
      sourceURL?: string;
      statusCode?: number;
      title?: string;
      description?: string;
      language?: string;
    };
    truncated?: boolean;
    creditCost?: number;
  };
  error?: string;
  message?: string;
  warning?: string;
  warnings?: string[];
}
//#endregion

//#region provider
/**
 * Stable id this fetch provider registers under.
 */
const CRW_PROVIDER_ID = "crw";

/**
 * Map a crw scrape response to the seam's normalized `WebFetchResult`.
 * crw returns markdown through `data.markdown` (Firecrawl-compatible API).
 */
function mapCrwResponse(url: string, body: CrwScrapeResponse): WebFetchResult {
  if (!body.success) {
    const message = body.error ?? body.message ?? "crw scrape returned success: false";
    throw new WebError(`crw scrape failed: ${message}`, "WEB_PROVIDER_ERROR");
  }

  const data = body.data ?? {};
  const markdown = data.markdown ?? data.raw ?? "";
  const metadata = data.metadata ?? {};
  const effectiveUrl = metadata.sourceURL ?? url;
  const statusCode = metadata.statusCode ?? 200;
  // crw already returns markdown — send as 'text' to avoid double-conversion
  // through turndown in dsh-tool-web.
  const truncated = data.truncated === true;

  return {
    url: effectiveUrl,
    statusCode,
    body: { kind: "text", content: markdown },
    truncated,
  };
}

/**
 * The crw-backed fetch provider. Each call issues a POST to `/v1/scrape`
 * with the target URL and receives markdown content back.
 *
 * crw is a Firecrawl-compatible crawl/scrape service. No auth, no API key.
 */
class CrwFetchProvider implements WebFetchProvider {
  private readonly resolveOptions: () => CrwFetchProviderOptions;
  readonly id = CRW_PROVIDER_ID;

  constructor(resolveOptions: () => CrwFetchProviderOptions) {
    this.resolveOptions = resolveOptions;
  }

  available(): boolean {
    const options = this.resolveOptions();
    return URL.canParse(options.baseURL);
  }

  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const options = this.resolveOptions();
    throwIfAborted(signal);

    const endpoint = `${options.baseURL}/v1/scrape`;
    throwIfAborted(signal);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "user-agent": "deepseek-harness/0.0.1",
        },
        body: JSON.stringify({ url: request.url, formats: ["markdown"] }),
        ...signal !== void 0 ? { signal } : {},
      });
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error);
      throw new WebError(`crw fetch request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
    }

    if (!response.ok) {
      let message = `crw API error (HTTP ${response.status})`;
      try {
        const parsed = (await response.json()) as { error?: string; message?: string };
        if (parsed.error != null && parsed.error.length > 0) message = parsed.error;
        else if (parsed.message != null && parsed.message.length > 0) message = parsed.message;
      } catch { /* ignore parse failure on error body */ }
      throw new WebError(message, "WEB_PROVIDER_ERROR");
    }

    try {
      return mapCrwResponse(request.url, (await response.json()) as CrwScrapeResponse);
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error);
      if (error instanceof WebError) throw error;
      throw new WebError(`crw returned an unprocessable response: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
    }
  }
}

export interface CrwFetchProviderOptions {
  /** Base URL of the crw (Firecrawl-compatible) service. Must include port. */
  baseURL: string;
}
//#endregion

//#region plugin
/**
 * Register a crw-backed fetch provider in `ctx.web`. crw is a Firecrawl-
 * compatible crawl/scrape service. No auth, no API key.
 *
 * ## Usage
 *
 * ```yaml
 * # cordis.patch.yml
 * - insert:
 *     - id: web-fetch-crw
 *       name: '@jaco-tech/dsh-web-fetch-crw'
 *       config:
 *         baseURL: 'http://your-crw-instance:3000'
 * ```
 * @module @jaco-tech/dsh-web-fetch-crw
 */

/** Cordis plugin name used by loader diagnostics. */
const name = "web-fetch-crw";

/** The web seam this provider registers into. */
const inject = ["web"];

const Config = z.object({
  /**
   * Base URL of the crw service (without /v1/scrape suffix).
   * Required — no default, you must configure your instance URL.
   */
  baseURL: z.string().required(),
});

function apply(ctx: { web: { registerFetchProvider: (p: WebFetchProvider) => void } }, config: typeof Config): void {
  const current = () => config;
  ctx.web.registerFetchProvider(new CrwFetchProvider(() => current()));
}
//#endregion

//#region helpers
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw aborted(signal);
}

function aborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError("crw fetch aborted", "WEB_ABORTED", { cause: signal?.aborted === true ? signal.reason : fallback });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
//#endregion

export { CRW_PROVIDER_ID, CrwFetchProvider, Config, apply, inject, name, mapCrwResponse };