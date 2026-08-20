# Security

Threat model for Duetto as a **client-only Chrome extension** (no operator-hosted backend).

## Assets

| Asset | Location | Sensitivity |
|-------|----------|-------------|
| Gemini API key | `chrome.storage.local` → `duetto_secret` | **High** — billing / quota |
| User settings | `duetto_settings` | Low |
| Notes + screenshots | `duetto_notes` | Medium (user content) |
| Transcript cache | `duetto_tx_*` | Low–medium (course text) |

## Trust boundaries

```
 Udemy page (untrusted)          Extension (trusted)
 ┌─────────────────────┐         ┌──────────────────────────┐
 │ udemy.com DOM/JS    │  ◄───►  │ Content script           │
 │ (no API key access) │ messages│ getPageSettings() only   │
 └─────────────────────┘         └───────────┬──────────────┘
                                             │
                                 ┌───────────▼──────────────┐
                                 │ Service worker + popup     │
                                 │ reads duetto_secret        │
                                 │ calls Gemini API           │
                                 └──────────────────────────┘
```

### Content script isolation

- `secretsAllowed()` is false on `https://*.udemy.com/*`.
- `getPageSettings()` uses SW message `GET_SETTINGS`; returned object has **empty** `geminiApiKey`.
- `senderMayReadSecrets()` blocks content-originated secret reads in the service worker.
- Udemy page JavaScript cannot read extension storage directly.

### Network

| Destination | Purpose | Initiator |
|-------------|---------|-----------|
| `*.udemy.com` | VTT / page APIs | Content |
| `generativelanguage.googleapis.com` | Translation | Service worker |

No other third-party analytics endpoints in manifest.

## Permissions rationale

| Permission | Why |
|------------|-----|
| `storage` / `unlimitedStorage` | Settings, notes, transcript cache |
| `activeTab` | Target Udemy tab for popup actions |
| Udemy host | Content script + caption fetch |
| Gemini host | Translation only from SW |

## Content Security Policy

Extension pages: `script-src 'self'; object-src 'self'`.

## User responsibilities

- Treat Gemini API keys like passwords; revoke in AI Studio if leaked.
- Notes may contain course screenshots — export/share carefully.
- Only install from [official repo](https://github.com/batu3384/duetto) or builds you audited.

## Known limitations (audit CA-004)

Two settings entry points (`getSettings` vs `getPageSettings`) — content must use the page-safe path. Misuse could leak key-present flags without exposing the key string; code review + self-checks guard this.

## Reporting vulnerabilities

Use [GitHub Security Advisories](https://github.com/batu3384/duetto/security/advisories/new) (preferred) or a private issue if advisories are unavailable.

Do **not** paste live API keys in public issues.

## Dependency surface

Runtime: React, clsx, tailwind-merge, lucide-react. Build: Vite, CRXJS, Tailwind. No npm audit CI gate yet — see [Roadmap](Roadmap) (CA-005).
