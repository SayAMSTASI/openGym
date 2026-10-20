// Browsers also treat loopback HTTP as trustworthy; never extend that exception to LAN HTTP.
export function notificationOrigin(loc = globalThis.location, secure = globalThis.isSecureContext) {
  return !!loc && secure !== false && (loc.protocol === 'https:' ||
    (loc.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(loc.hostname)));
}
