# FreeDomainFinder

[![CI](https://github.com/Futura75/FreeDomainFinder/actions/workflows/ci.yml/badge.svg)](https://github.com/Futura75/FreeDomainFinder/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/Futura75/FreeDomainFinder/badge.svg?branch=main)](https://coveralls.io/github/Futura75/FreeDomainFinder?branch=main)
[![Release](https://img.shields.io/github/v/release/Futura75/FreeDomainFinder)](https://github.com/Futura75/FreeDomainFinder/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8)](https://tailwindcss.com/)
[![Made in Italy](https://img.shields.io/badge/Made_in-Italy-blue)](https://en.wikipedia.org/wiki/Italy)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/Futura75/FreeDomainFinder/pulls)
[![Last commit](https://img.shields.io/github/last-commit/Futura75/FreeDomainFinder)](https://github.com/Futura75/FreeDomainFinder/commits/develop)
[![Repo size](https://img.shields.io/github/repo-size/Futura75/FreeDomainFinder)](https://github.com/Futura75/FreeDomainFinder)

A local-first web app to check domain name availability and generate brandable alternatives with AI.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS v3**
- Design system: blue/teal palette, Public Sans + JetBrains Mono fonts, Remix Icons
- Notifications: **SweetAlert2** (top-right toasts + completion popups, light/dark themed)
- Availability check: **RDAP** (`rdap.org`) + **DNS-over-HTTPS** fallback (Cloudflare), client-side, no API keys
- AI: multi-provider via server-side API route. Supported: **Groq**, **OpenAI**, **Anthropic**, **OpenRouter**, **OpenCode GO** (self-hosted OpenAI-compatible), **Together AI**, **Mistral**, **xAI (Grok)**, **Ollama** (local, no key). Keys live server-side in env; the client picks provider + model from the configured ones. The AI panel is disabled in the UI until at least one provider is correctly configured.

## Quick start

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and add at least one AI provider key (see below)
npm run dev
```

Open http://localhost:3000

> Without any AI provider configured, direct verification still works; the "Genera con AI" tab is disabled with a setup hint.

### Docker / self-hosting

The repo ships a multi-stage `Dockerfile` (Next.js `output: "standalone"`, non-root user, healthcheck on `/api/ai/status`) and a `docker-compose.yml` that runs the published image `ghcr.io/futura75/freedomainfinder:latest` on the external `proxy` network. Provider keys are **not** baked into the image: they are passed as environment variables at runtime (and `.env*` is excluded from the build context).

Pushing to `develop` triggers `.github/workflows/deploy.yml`, which builds and pushes that image to GHCR; the homelab pulls it through Komodo. To run it by hand:

```bash
GROQ_API_KEY=gsk_... docker compose up -d
docker compose logs -f
```

The app listens on container port `3000` and is reached through the reverse proxy on the `proxy` network — no host port is published. `AI_PROVIDER` selects the default provider when several keys are set.

## AI providers

The AI engine supports multiple providers. **Configure at least one** by setting its env var(s) in `.env.local`, then restart `npm run dev`. The app detects which are configured and shows only those in the UI (provider + model selectors). You can run several at once and switch between them from the UI.

Optionally force the default provider with `AI_PROVIDER=<id>` (e.g. `AI_PROVIDER=groq`); otherwise the first configured one is used.

Below is one clear example per provider. Replace the placeholder values with your own.

### Groq — free, fast

Get a key: https://console.groq.com/keys

```env
GROQ_API_KEY=gsk_your_key_here
# optional override if Groq retires a model id
# GROQ_MODEL=openai/gpt-oss-120b
```

Models offered: `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`. Default: `openai/gpt-oss-120b`. Groq retires model ids often — if you get a `model_not_found` 404, check `GET https://api.groq.com/openai/v1/models` and set `GROQ_MODEL`.

### OpenAI

Get a key: https://platform.openai.com/api-keys

```env
OPENAI_API_KEY=sk-your_key_here
```

Models offered: `gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini`. Default: `gpt-4o-mini`.

### Anthropic

Get a key: https://console.anthropic.com/settings/keys

```env
ANTHROPIC_API_KEY=sk-ant-your_key_here
```

Models offered: `claude-3-5-haiku-latest`, `claude-3-5-sonnet-latest`, `claude-3-7-sonnet-latest`. Default: `claude-3-5-haiku-latest`. Uses the Anthropic Messages API (`x-api-key` + `anthropic-version`).

### OpenRouter — aggregator, free models available

Get a key: https://openrouter.ai/keys

```env
OPENROUTER_API_KEY=sk-or-your_key_here
```

Models offered: `meta-llama/llama-3.3-70b-instruct:free`, `google/gemini-flash-1.5`, `anthropic/claude-3.5-haiku`, `openai/gpt-4o-mini`. Default: `meta-llama/llama-3.3-70b-instruct:free`.

### OpenCode GO — self-hosted OpenAI-compatible endpoint

For any OpenAI-compatible server you host yourself (e.g. an OpenCode GO gateway). **All three values are required.**

```env
OPENCODE_BASE_URL=https://your-endpoint.example.com/v1
OPENCODE_API_KEY=your_key_or_token
OPENCODE_MODEL=your-model-name
```

The model selector becomes a free-text field (since models are unknown to the app).

### Together AI — free tier

Get a key: https://api.together.xyz/settings/api-keys

```env
TOGETHER_API_KEY=your_key_here
```

Models offered: `meta-llama/Llama-3.3-70B-Instruct-Turbo-Free`, `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo`. Default: `meta-llama/Llama-3.3-70B-Instruct-Turbo-Free`.

### Mistral

Get a key: https://console.mistral.ai/api-keys

```env
MISTRAL_API_KEY=your_key_here
```

Models offered: `mistral-small-latest`, `mistral-large-latest`, `open-mistral-nemo`. Default: `mistral-small-latest`.

### xAI (Grok)

Get a key: https://console.x.ai

```env
XAI_API_KEY=xai-your_key_here
```

Models offered: `grok-2-latest`, `grok-2-mini`. Default: `grok-2-latest`.

### Ollama — local, no key

Install Ollama (https://ollama.com), start the server, and pull a model once:

```bash
ollama pull llama3.1
```

Then in `.env.local` (all optional — defaults shown):

```env
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

Models offered: `llama3.1`, `qwen2.5`, `mistral`. No API key needed.

### Choosing the default provider

```env
AI_PROVIDER=groq
```

If omitted, the first configured provider (in the order listed above) is used. The UI selector overrides this per request.

### Disabling the AI panel

If no provider is configured (or the configuration is incomplete, e.g. OpenCode GO missing its base URL), the **"Genera con AI"** tab is disabled and a setup notice is shown in its place. Direct domain checking keeps working.

## Secrets

**This repository is public: no credential may ever be committed.** Provider keys are only read from the process environment at runtime.

| Where the secret lives | What goes there |
|---|---|
| `.env.local` (local dev) | provider keys; gitignored, dockerignored |
| Komodo stack environment (homelab) | `GROQ_API_KEY` (marked as secret) — `docker-compose.yml` reads `${GROQ_API_KEY:?...}` and refuses to start without it |
| GitHub Actions secret `GHCR_TOKEN` | registry push in `deploy.yml` |
| GitHub Actions secrets | nothing else: the CI needs no AI keys, the image carries no credentials |

CI/CD never sees a provider key: `deploy.yml` builds the image, the homelab supplies the environment at run time.

Guardrails in place:

- `.gitignore` ignores `.env` and `.env.*` (only `.env.local.example` with placeholders is tracked).
- `.dockerignore` keeps `.env*` out of the build context, so a local `docker build` cannot bake a key into a layer.
- `.github/workflows/ci.yml` runs **gitleaks over the whole history** (full checkout); the `build` job does not even start if a secret is found. Rules and dummy-value allowlist live in `.gitleaks.toml`.
- GitHub secret scanning and push protection are enabled on the repo.

Scan locally with the same rules:

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest \
  detect --source=/repo --config=/repo/.gitleaks.toml --redact -v
```

### If a key does leak

1. **Revoke it first** at the provider (e.g. https://console.groq.com/keys) — assume it is compromised the moment it is pushed; history rewrites do not undo forks, caches or scrapers.
2. Issue a new key and update every consumer: local `.env.local` and the Komodo stack environment.
3. Only then clean the history (`git filter-repo --path .env.local --invert-paths`) and force-push — this rewrites shared hashes, so coordinate with everyone who has a clone.

## Two modes

1. **Direct check** — two input styles:
   - **Single**: one name, without extension (→ checks all active TLDs) or with extension (→ checks only that TLD)
   - **Bulk list**: one domain per line (or comma-separated), each with or without an extension
2. **Generate with AI** — write a short prompt, pick how many alternatives (1–20, persisted across sessions), generate. The availability check starts automatically as soon as the names come back; you can still edit the list and re-check with "Controlla tutti". You can regenerate as many times as you want.

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
  api/generate/route.ts   AI generation (multi-provider, hides keys, dedupes vs avoid list)
  api/ai/status/route.ts  reports configured providers/models to the client
lib/
  tlds.ts                 normalization, parsing, default TLDs
  check.ts                RDAP + DoH, bounded concurrency pool
  notify.ts               SweetAlert2 helpers (toast/popup/confirm), themed
  session.ts              session file types, validation, download/read
  generate.ts             name-generation pipeline (prompt, parse, sanitize)
  ai-providers.ts         provider registry (metadata, models) — shared
  ai-server.ts            server helpers (env, resolve selection, call provider)
  use-tld-config.ts       TLD active/exclusions/used state + persistence
  use-check-run.ts        check execution + name intake (sanitize/validate/dedupe)
  use-ai-session.ts       prompt/count/suggestions/history + provider selection
  use-pinned.ts           pinned results state + persistence
  use-theme.ts            dark-mode precedence (saved choice vs system) + persistence
  use-view-controls.ts    mode/input/sort/filter state + session serialize/hydrate
tailwind.config.ts        design tokens + dark mode
```

## Git workflow

This repo uses **git-flow**:
- `develop` is the default branch and main working branch
- `main` holds releases (merge from `develop` + tag)
- feature branches: `feature/*` off `develop`

## Notes

- Built for local use. Deploying requires minimal refactoring (the API route already runs on Vercel).
- Availability is indicative (RDAP + DNS). Always confirm with a registrar before purchasing.
# Trigger CI: update deploy workflow
# test ci/cd dom 12 lug 2026, 15:07:47, CEST
