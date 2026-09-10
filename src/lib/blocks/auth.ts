import { blocksClient } from "./client";

const RETURN_TO_KEY = "ecommerce-return-to";
export const SESSION_EXPIRED_EVENT = "blocks:session-expired";

export function startLogin(returnTo = "/") {
  sessionStorage.setItem(RETURN_TO_KEY, returnTo);
  return blocksClient.auth.idp.redirectToProvider();
}

export async function completeLogin(callbackUrl: string) {
  const returnTo = sessionStorage.getItem(RETURN_TO_KEY) || "/";
  sessionStorage.removeItem(RETURN_TO_KEY);
  const result = await blocksClient.auth.idp.callback(callbackUrl);
  if (result?.error) return { ok: false, returnTo, message: result.error_description || result.error };
  return { ok: true, returnTo };
}

/** Retry once for a transient cookie propagation failure, then report an expired session. */
export async function withSessionRefresh<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof Error && "status" in error && error.status === 401)) throw error;
    try {
      return await fn();
    } catch (retryError) {
      if (retryError instanceof Error && "status" in retryError && retryError.status === 401) {
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
      throw retryError;
    }
  }
}

export async function endSession() {
  await blocksClient.auth.logout();
}
