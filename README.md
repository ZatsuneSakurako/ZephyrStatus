# Zephyr Status

**Zephyr Status** is a lightweight [Manifest V3](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json) browser extension that whispers every page's HTTP status straight into the toolbar badge — color-coded `2xx`, `3xx`, `4xx` and `5xx` at a glance.

No popups, no dashboard, no noise. You navigate, the badge speaks.

## ✨ Features

- **Live status badge** — displays the final HTTP status code of the active tab's top-level document (e.g. `200`, `404`, `503`), resolved *after* every redirect hop.
- **Color-coded severity** — the badge background reflects the response class, so you can diagnose a broken link from across the room:

| Class | Meaning | Badge color |
|-------|-------------------|-------------|
| `2xx` | Success | 🟢 Green `#16a34a` |
| `3xx` | Redirection | 🔵 Blue `#2563eb` |
| `4xx` | Client error | 🟠 Amber `#f59e0b` |
| `5xx` | Server error | 🔴 Red `#dc2626` |
| other | Network error / unknown / exotic (`1xx`) | ⚪ Gray `#6b7280` |

- **`ERR` on failure** — DNS failures, refused connections, TLS errors and timeouts show `ERR` in gray instead of scaring you with a raw error code.
- **Per-tab, per-navigation** — every tab carries its own status; switching tabs instantly repaints the badge for the newly focused one.
- **Survives service-worker sleep** — MV3 workers are ephemeral, so live state is mirrored into `storage.session` and restored when the worker wakes up.

## 🧠 Design notes (the fun parts)

- **Prerender-safe.** Chrome pre-renders pages flagged as likely navigations (Speculation Rules / NoState Prefetch). Those hidden requests carry the *real* tab id and never "complete", which would blink or overwrite the visible badge. Zephyr filters on `documentLifecycle` and only counts `active` documents.
- **Abort-tolerant.** `net::ERR_ABORTED` (Chromium) and `NS_BINDING_ABORTED` (Firefox) are treated as benign — triggered by downloads, discarded prerenders or user cancellations — so the last known status stays put instead of flashing `ERR`.
- **Redirect-aware.** Since each redirect hop fires its own request lifecycle events, the badge naturally settles on the *final* status code of the chain.
- **Closed-tab-proof.** Tabs closed between the request event and the badge render are handled gracefully; removing a tab cleans up its state.

## 🔐 Permissions

| Permission | Why it's needed |
|----------------------|---------------------------------------------------------------|
| `webRequest` | Observe the final status of top-level document requests |
| `webNavigation` | Detect commits/reloads and re-sync the badge |
| `storage` | Session-scoped persistence so state survives worker restarts |
| Host: `<all_urls>` | Required to observe navigations to *any* site |

**Privacy:** Zephyr only reads HTTP status codes of navigations you make. Nothing is transmitted, logged, or stored anywhere beyond your browser's own session storage — there is no server, no analytics, no telemetry.

## 🚀 Installation

### Load unpacked (development)

```bash
# Chromium
# chrome://extensions → enable Developer mode → "Load unpacked" → select the project folder

# Firefox
# about:debugging#/runtime/this-firefox → "Load Temporary Add-on…" → select manifest.json
```

## 🧩 Browser compatibility

| Browser|
|------------------------|
| Chrome/Chromium ≥ 146|
| Firefox ≥ 153|

Firefox-specific manifest keys live under `browser_specific_settings.gecko` (add-on id, strict min version, data-collection declaration) and are ignored by Chromium.

## 🎨 Credits

- Project logo generated with [Lumo](https://lumo.proton.me) (Proton).
- Created by Zatsune Sakurako.

## 📜 License

Copyright © 2026 Zatsune Sakurako.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3 of the License.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

Full text: [LICENSE](./LICENSE) · [gnu.org/licenses/gpl-3.0](https://www.gnu.org/licenses/gpl-3.0.html) · SPDX: `GPL-3.0-or-later`
