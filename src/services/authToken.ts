/**
 * In-memory-only auth token store.
 *
 * Deliberately *not* backed by localStorage/sessionStorage/cookies: those
 * are readable by any script on the page (including an XSS payload), so a
 * token that only ever lives in a module-scoped variable is safer against
 * exfiltration. It resets on full page reload by design — an app that
 * needs persistence across reloads should re-authenticate through a
 * proper auth flow, not by stashing a token in storage.
 *
 * Never log or `console.log` the token, and never place it in a URL/query
 * string (it would end up in browser history and server access logs).
 */
let currentToken: string | undefined;

export function setAuthToken(token: string | undefined): void {
  currentToken = token;
}

export function getAuthToken(): string | undefined {
  return currentToken;
}
