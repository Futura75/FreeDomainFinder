// The name-generation domain module.
//
// Owns the whole pipeline that turns a user brief into a list of valid,
// deduplicated domain-name candidates:
//   - build the system prompt
//   - call the resolved AI provider (via lib/ai-server)
//   - extract JSON tolerantly (models may wrap it in prose)
//   - sanitize each candidate (reusing lib/tlds, not duplicating it)
//   - drop repeats already seen in `avoid`, dedupe, cap to `count`
//
// The HTTP route in app/api/generate is now a thin adapter: it parses the
// request body, resolves the provider, calls generateNames(), and shapes
// the response. The interface here is the test surface — you can call
// generateNames() directly without an HTTP server.

import { isValidSld, sanitizeSld } from "./tlds";
import { callProvider, resolveSelection } from "./ai-server";

export interface GenerateArgs {
  prompt: string;
  count: number;
  exclusions?: string[];
  avoid?: string[];
  provider?: string;
  model?: string;
}

export interface GenerateResult {
  names: string[];
  provider: string;
  model: string;
}

export class NoProviderConfiguredError extends Error {
  constructor() {
    super(
      "Nessun provider AI configurato. Imposta almeno una chiave in .env.local (es. GROQ_API_KEY) e riavvia il server. Vedi .env.local.example."
    );
    this.name = "NoProviderConfiguredError";
  }
}

export class EmptyPromptError extends Error {
  constructor() {
    super("Il prompt è obbligatorio.");
    this.name = "EmptyPromptError";
  }
}

/** Clamp the requested count to the supported 1..20 range. */
export function clampCount(n: unknown): number {
  const num = Number(n);
  if (!Number.isFinite(num)) return 8;
  return Math.max(1, Math.min(20, Math.trunc(num)));
}

/** Build the Italian system prompt that constrains the model's output. */
export function buildSystemPrompt(count: number, exclusions: string[], avoid: string[]): string {
  const exclusionLine =
    exclusions.length > 0
      ? `Non usare queste parole come base: ${exclusions.join(", ")}.`
      : "";

  const avoidLine =
    avoid.length > 0
      ? `Sono già stati proposti questi nomi in round precedenti: ${avoid.join(
          ", "
        )}. Non ripeterli e proponi alternative completamente diverse per stile e approccio.`
      : "";

  return `Sei un assistente esperto di naming e brand. Genera ${count} idee di nome a dominio brevi, brandizzabili, memorabili e pronunciabili, ispirate al brief dell'utente.
Regole:
- Restituisci SOLO la parte prima del punto (il nome, senza TLD).
- Niente spazi, niente accenti, niente punteggiatura oltre al trattino (-).
- Lunghezza ideale 5-14 caratteri.
- Varia lo stile: parole composte, fusioni, metafore, suggestive nonsense.
- Evita marchi noti e termini generics già saturi.
${exclusionLine}
${avoidLine}
Rispondi in JSON: {"names": ["nome1","nome2",...]} con esattamente ${count} elementi.`;
}

/** Tolerantly extract a `names` array from a model's text response.
 * Accepts raw JSON, JSON embedded in prose (first {...} block wins), or — when
 * the JSON is truncated/invalid (e.g. a model hit max_tokens, or Groq rejected
 * strict json mode and returned a partial `failed_generation`) — salvages the
 * quoted strings that follow the "names" key. */
export function extractNames(content: string): string[] {
  if (!content) return [];
  // 1) Strict parse: the whole string, or the first {...} block in prose.
  try {
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : content);
    if (Array.isArray(parsed?.names)) return parsed.names.map((n: unknown) => String(n));
  } catch {
    /* fall through to salvage */
  }
  // 2) Salvage from a truncated/invalid array. An unterminated trailing token
  //    simply won't match, so we keep every complete name produced so far.
  const namesIdx = content.search(/"names"\s*:\s*\[/);
  if (namesIdx === -1) return [];
  const matches = content.slice(namesIdx).match(/"(?:[^"\\]|\\.)*"/g);
  if (!matches) return [];
  // Drop the "names" key token itself; unescape each value defensively.
  return matches.slice(1).map((s) => {
    try {
      return String(JSON.parse(s));
    } catch {
      return s.slice(1, -1);
    }
  });
}

/** Sanitize, validate, drop avoid-repeats, dedupe (order-preserving), cap. */
export function cleanNames(
  raw: string[],
  avoid: string[] = [],
  count: number
): string[] {
  const avoidSet = new Set(avoid.map((n) => String(n).toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const n = sanitizeSld(r);
    if (!n || !isValidSld(n)) continue;
    if (avoidSet.has(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= count) break;
  }
  return out;
}

/** Run the full generation pipeline. Throws NoProviderConfiguredError /
 * EmptyPromptError for the two known preconditions; rethrows provider
 * errors wrapped with a label. */
export async function generateNames(args: GenerateArgs): Promise<GenerateResult> {
  const prompt = (args.prompt || "").trim();
  if (!prompt) throw new EmptyPromptError();

  const count = clampCount(args.count);
  const exclusions = Array.isArray(args.exclusions) ? args.exclusions : [];
  const avoid = Array.isArray(args.avoid) ? args.avoid : [];

  const resolved = resolveSelection(args.provider, args.model);
  if (!resolved) throw new NoProviderConfiguredError();

  // Anthropic and some providers don't support response_format json_object.
  // We still ask for JSON in the prompt; parsing tolerates prose-wrapped JSON.
  const supportsJsonMode = resolved.provider.apiShape === "openai-chat";
  const systemPrompt = buildSystemPrompt(count, exclusions, avoid);

  let content: string;
  try {
    content = await callProvider(
      resolved,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      { temperature: 0.9, maxTokens: 2048, jsonMode: supportsJsonMode }
    );
  } catch (e) {
    throw e; // already labelled by callProvider
  }

  const names = cleanNames(extractNames(content), avoid, count);
  if (names.length === 0) {
    throw new Error("L'AI non ha restituito nomi validi (o solo duplicati). Riprova.");
  }

  return { names, provider: resolved.provider.id, model: resolved.model };
}
