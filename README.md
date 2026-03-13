# Clash Connect

A Chrome extension that routes browser traffic through a SOCKS5 proxy with hardened fingerprint resistance. Works out of the box with ClashX Meta, Clash Verge, and other Clash-based clients — or any SOCKS5 proxy you point it at.

简体中文翻译已内置，浏览器语言设为中文时自动切换。

## Features

### Proxy Control
- One-click toggle to route all browser traffic through a SOCKS5 proxy
- Default configuration targets `127.0.0.1:7890` (ClashX Meta / Clash Verge default)
- Fully configurable host, port, and bypass rules for any local or remote SOCKS5 proxy
- Bypass list for hostnames, IPs, and patterns (e.g. `*.example.com`)
- Proxy state persists across browser restarts

### Hardened Timezone & Locale Spoofing
Timezone spoofing goes far beyond basic `Intl.DateTimeFormat` overrides. The injection script patches every known detection vector:

- **`Date` constructor** — all argument variants (0-arg, 1-arg number, 1-arg string, 2+ args) are intercepted and reinterpreted in the spoofed timezone, with DST boundary refinement
- **`Date.parse`** — string parsing adjusted for spoofed timezone
- **`Date.prototype` getters** — `getFullYear`, `getMonth`, `getDate`, `getDay`, `getHours`, `getMinutes`, `getSeconds` all return values in the spoofed timezone
- **`getTimezoneOffset`** — returns the correct offset for the spoofed timezone
- **`toString` / `toTimeString` / `toDateString`** — formatted output reflects spoofed timezone with correct GMT offset and abbreviation
- **`toLocaleString` / `toLocaleDateString` / `toLocaleTimeString`** — locale and timezone injected
- **`Intl.DateTimeFormat`** — constructor and `resolvedOptions()` patched
- **`Intl.NumberFormat` / `Intl.PluralRules`** — default locale injected
- **`navigator.language` / `navigator.languages`** — spoofed to match proxy exit country

Tested against [webbrowsertools.com/timezone](https://webbrowsertools.com/timezone/) and similar fingerprinting sites with zero leaks.

### WebRTC Leak Prevention
WebRTC is configured to `disable_non_proxied_udp`, which forces all WebRTC traffic through the proxy without outright disabling it — avoiding the fingerprint signal that a fully disabled WebRTC stack would produce.

### Geolocation Blocking
`navigator.geolocation.getCurrentPosition` and `watchPosition` return a natural `PERMISSION_DENIED` error, indistinguishable from a user who simply denied the permission prompt.

### IP Detection & Country Display
- Automatic exit IP lookup on connect via ip-api.com
- Country flag emoji displayed as extension badge and in the popup
- Timezone and locale auto-detected from exit country
- Refresh button to re-detect after switching proxy nodes

### UI
- Dark themed popup with proxy and timezone spoof toggles
- Connection status panel (IP, location, timezone, locale)
- Collapsible settings for host, port, bypass list, and icon color (dark/light)
- Icon states: default (disconnected), green (connected), red (proxy error)

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project directory

## Usage

1. Start your SOCKS5 proxy (ClashX Meta, Clash Verge, or any proxy on a configurable host/port)
2. Click the extension icon and toggle **Proxy** on
3. The extension detects your exit IP, country, timezone, and locale automatically
4. Toggle **Timezone Spoof** to mask your real timezone and locale to match the proxy location
5. Use **Settings** to change host/port, add bypass rules, or switch icon color

## Permissions

| Permission | Reason |
|---|---|
| `proxy` | Configure browser proxy settings |
| `storage` | Persist settings and connection state |
| `privacy` | Set WebRTC IP handling policy |
| `http://ip-api.com/*` | Fetch exit IP geolocation data |

## License

MIT
