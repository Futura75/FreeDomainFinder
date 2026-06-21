# FreeDomainFinder

A local-first web app to check domain name availability and generate brandable alternatives with AI.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS v3**
- Design system: **WhistleGuard** (blue/teal palette, Public Sans + JetBrains Mono fonts, Remix Icons)
- Notifications: **SweetAlert2** (top-right toasts + completion popups, light/dark themed)
- Availability check: **RDAP** (`rdap.org`) + **DNS-over-HTTPS** fallback (Cloudflare), client-side, no API keys
- AI: **Groq** (`llama-3.3-70b-versatile`, free tier) via server-side API route

## Quick start

```bash
npm install
cp .env.local.example .env.local
# add your GROQ_API_KEY (free at https://console.groq.com/keys)
npm run dev
```

Open http://localhost:3000

> Without a Groq key, direct verification still works; only AI generation returns an error with instructions.

## Two modes

1. **Direct check** — two input styles:
   - **Single**: one name, without extension (→ checks all active TLDs) or with extension (→ checks only that TLD)
   - **Bulk list**: one domain per line (or comma-separated), each with or without an extension
2. **Generate with AI** — write a short prompt, pick how many alternatives (1–20, persisted across sessions), generate, edit the list if you want, then "Controlla tutti".

During verification a **progress bar** shows advance; on completion a **SweetAlert notification** appears.

### Generating multiple rounds

You can regenerate as many times as you want. Each previous round is archived in a **collapsed accordion** ("Round precedenti") and previously proposed names are sent to the AI in an `avoid` list, so every new batch is different. The generate button label switches to "Genera un'altra lista" after the first round.

### Starting over

- **Nuova ricerca** (in the results header): clears results, AI suggestions and previous-rounds history, but keeps the typed text (prompt/inputs) so you don't retype it
- **Azzera** (in the header): full reset — clears prompt, inputs, results, suggestions and AI history

## Domain extensions (TLDs)

The "TLD" panel (top right):
- **Attive**: blue chips, click to remove; text field to add arbitrary TLDs
- **Suggerite**: ready-to-activate chips
- **Escluse**: red chips, never shown in results (useful to filter AI output)
- **Usati di recente**: chips for custom TLDs added in the past, to re-activate without retyping

The configuration (active, excluded, used-history) is persisted in `localStorage`.

## Results

For each name, a card with a grid of TLD badges:
- 🟢 **Libero** + "Acquista" link (Namecheap)
- 🔴 **Occupato**
- ⚪ **Non verificabile** (TLD without RDAP and ambiguous DNS)

TLD badges are always sorted alphabetically.

### All-free highlighting

Names where **all checked TLDs are free** get a special positive highlight: green border + ring, green-tinted background, and a **🏆 TUTTI LIBERI** badge. The results header shows a counter "N con tutti i TLD liberi 🏆", and the right-side name list shows a trophy icon next to those names.

### Sorting & filtering

In the results you can **sort** by:
- Alphabetical A→Z / Z→A
- Availability (most free TLDs first / least free TLDs first)

And enable filters:
- **Solo liberi** — only names with at least one free TLD
- **Solo tutti liberi** — only names where every checked TLD is free (complete verifications only, no false positives during checking)

### Pinning results

Each result card has a **pin** button (top-right). Pinned results are stored in a separate **Pinned** tab and persist across new searches and page reloads (saved in `localStorage` and included in exported session JSON files). Use it to keep the names you care about while exploring new batches.

### Click-to-highlight

Clicking a name in the right panel highlights (ring + soft background) and scrolls to its result card on the left. Clicking again deselects it.

## Sessions (save / load)

- **Salva** (header): downloads a JSON file `fdf-session-YYYY-MM-DD….json` with TLD config, inputs, prompt, AI suggestions, previous rounds history, pinned results, full results and view settings.
- **Carica** (header): pick a previously saved JSON file; restores the whole session (with a SweetAlert confirmation). The file is interoperable and human-readable outside the app.
- **Ricontrolla** (in the results header, or per-row in the right panel): re-runs verification of the session's names using the currently active TLDs.

## Layout

Full-width, fluid app: content adapts to the viewport width (no fixed `max-width`). On desktop the main area is a grid `input + results | name list (360px)`; on mobile it stacks. Dark mode toggle in the header, following the OS preference on first visit.

## Project structure

```
app/
  layout.tsx              fonts + Remix Icons + globals
  page.tsx                main UI (client)
  api/generate/route.ts   Groq proxy (hides the API key, dedupes vs avoid list)
lib/
  tlds.ts                 normalization, parsing, default TLDs
  check.ts                RDAP + DoH, bounded concurrency pool
  notify.ts               SweetAlert2 helpers (toast/popup/confirm), themed
  session.ts              session file types, validation, download/read
tailwind.config.ts        WhistleGuard tokens + dark mode
```

## Git workflow

This repo uses **git-flow**:
- `develop` is the default branch and main working branch
- `main` holds releases (merge from `develop` + tag)
- feature branches: `feature/*` off `develop`

## Notes

- Built for local use. Deploying requires minimal refactoring (the API route already runs on Vercel).
- Availability is indicative (RDAP + DNS). Always confirm with a registrar before purchasing.
