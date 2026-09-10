import { blocksClient } from "./client";
import { withSessionRefresh } from "./auth";
import { toast } from "@/lib/toast-store";

export class BlocksApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Blocks API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

function extractErrorMessage(errors: unknown): string {
  if (Array.isArray(errors)) {
    return errors.filter((e) => typeof e === "string").join("; ");
  }
  if (errors && typeof errors === "object") {
    return Object.entries(errors as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string" && value.length > 0)
      .map(([key, value]) => `${key}: ${value as string}`)
      .join("; ");
  }
  return "";
}

/**
 * Many Blocks responses are HTTP 200 but carry a business-level failure —
 * `{isSuccess:false, errors:{...}}`. `!res.ok` never catches this since the HTTP
 * status is fine. Surface it as a toast and throw so callers see it as a failure too.
 */
function assertBusinessSuccess(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const { isSuccess, errors } = body as { isSuccess?: boolean; errors?: unknown };
  if (isSuccess !== false) return;
  const message = extractErrorMessage(errors) || "Something went wrong.";
  toast.error(message);
  throw new BlocksApiError(200, errors);
}

/**
 * Calls a Blocks gateway route (IAM, etc.) through the shared SDK. The browser carries
 * the HttpOnly IAM cookie; the SDK adds `x-blocks-key` and includes credentials on
 * every request.
 */
export async function blocksFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const body = await withSessionRefresh(() =>
    blocksClient.http.request<T>(path, {
      method: init.method,
      body: init.body ? JSON.parse(init.body as string) : undefined,
      headers: init.headers,
      auth: true,
    })
  );
  assertBusinessSuccess(body);
  return body;
}

/**
 * Wraps a Data Gateway call (via `blocksClient.data.*`) with the same session-refresh
 * and business-error handling as `blocksFetch`. Product/inventory CRUD in
 * `./collections.ts` goes through this — never raw `fetch` against the gateway.
 */
export async function blocksDataCall<T>(fn: () => Promise<T>): Promise<T> {
  const body = await withSessionRefresh(fn);
  assertBusinessSuccess(body);
  return body;
}
