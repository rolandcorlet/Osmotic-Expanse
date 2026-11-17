// Shared plumbing for every AI provider: one way to call out, one kind of error
// with a message a host can act on.

export class ProviderError extends Error {}

// Returns { status, ok, data }. Throws ProviderError only when nothing came back.
export async function request({ url, method, headers = {}, body, fetchImpl = fetch, who = 'The AI', timeoutMs = 90000, local = false }) {
  let res;
  try {
    res = await fetchImpl(url, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new ProviderError(`${who} did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    throw new ProviderError(local
      ? `Could not reach ${who} at ${new URL(url).origin}. Is it running, and is the address right?`
      : `Could not reach ${who}: ${e.message}. Is this computer online?`);
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON: the caller reports the status */ }
  return { status: res.status, ok: res.ok, data };
}

// The message inside an error body, whatever shape the provider uses.
export function errorText(data, status) {
  if (!data) return `HTTP ${status}`;
  const e = data.error;
  if (typeof e === 'string') return e;
  if (e && typeof e.message === 'string') return e.message;
  if (typeof data.message === 'string') return data.message;
  return `HTTP ${status}`;
}

// The usual refusals, in plain words. `who` is the provider's name.
export function refusal(who, status, msg) {
  if (status === 401 || (status === 400 && /api.?key/i.test(msg))) return new ProviderError(`${who} says the API key is not valid.`);
  if (status === 402) return new ProviderError(`${who} says the account has no credit left (402): ${msg}`);
  if (status === 403) return new ProviderError(`${who} refused the request (403): ${msg}`);
  if (status === 404) return new ProviderError(`${who} does not know that model or address (404): ${msg}`);
  if (status === 429) return new ProviderError(`${who} says the quota or rate limit is used up (429): ${msg}`);
  return new ProviderError(`${who} error ${status}: ${msg}`);
}

export const trimUrl = (u) => String(u || '').trim().replace(/\/+$/, '');
