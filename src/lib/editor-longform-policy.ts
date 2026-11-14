/**
 * Encoding a full-film 480p proxy in WebView allocates another decoder,
 * encoder and unbounded in-memory recorder pieces for the film's entire
 * duration. For long originals play and scrub the original media instead.
 * Never shorten the source or export; short-clip scrubbing proxies remain.
 */
export const MAX_AUTO_PROXY_SECONDS=90;
export function shouldAutoEncodeFullProxy(seconds:number):boolean {
  return Number.isFinite(seconds)&&seconds>0&&seconds<=MAX_AUTO_PROXY_SECONDS;
}
