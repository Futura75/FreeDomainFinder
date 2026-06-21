import { NextRequest, NextResponse } from "next/server";
import { callProvider, resolveSelection } from "@/lib/ai-server";

export const runtime = "nodejs";

interface GenerateBody {
  prompt: string;
  count: number;
  exclusions?: string[];
  avoid?: string[];
  provider?: string;
  model?: string;
}

function buildSystemPrompt(count: number, exclusions: string[], avoid: string[]) {
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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateBody;
    const prompt = (body.prompt || "").trim();
    const count = Math.max(1, Math.min(20, Number(body.count) || 8));
    const exclusions = Array.isArray(body.exclusions) ? body.exclusions : [];
    const avoid = Array.isArray(body.avoid) ? body.avoid : [];

    if (!prompt) {
      return NextResponse.json(
        { error: "Il prompt è obbligatorio." },
        { status: 400 }
      );
    }

    const resolved = resolveSelection(body.provider, body.model);
    if (!resolved) {
      return NextResponse.json(
        {
          error:
            "Nessun provider AI configurato. Imposta almeno una chiave in .env.local (es. GROQ_API_KEY) e riavvia il server. Vedi .env.local.example.",
        },
        { status: 500 }
      );
    }

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
        { temperature: 0.9, maxTokens: 1024, jsonMode: supportsJsonMode }
      );
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 502 }
      );
    }

    // Tolerant JSON extraction (model may wrap JSON in prose).
    let names: string[] = [];
    try {
      const match = content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : content);
      names = Array.isArray(parsed.names) ? parsed.names : [];
    } catch {
      names = [];
    }

    const avoidSet = new Set(avoid.map((n) => String(n).toLowerCase()));

    const cleaned = names
      .map((n) =>
        String(n)
          .trim()
          .toLowerCase()
          .replace(/^\./, "")
          .replace(/\s+/g, "")
          .replace(/[^a-z0-9-]/g, "")
      )
      .filter((n) => /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(n))
      .filter((n) => !avoidSet.has(n));
    const unique = Array.from(new Set(cleaned)).slice(0, count);

    if (unique.length === 0) {
      return NextResponse.json(
        { error: "L'AI non ha restituito nomi validi (o solo duplicati). Riprova." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      names: unique,
      provider: resolved.provider.id,
      model: resolved.model,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Errore interno: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
