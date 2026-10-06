/**
 * Whether the app is served from an origin it shares with other sites (§3, Authentication; §10.7): a
 * `*.github.io` address, which every Pages site of that account or organisation shares. Browser storage is kept
 * per origin, so any of those sites could read a token remembered here — Remember me is unavailable on one.
 */
export function isSharedOrigin(hostname: string = window.location.hostname): boolean {
  // A trailing dot (`user.github.io.`) names the same host.
  return hostname.toLowerCase().replace(/\.$/, '').endsWith('.github.io');
}
