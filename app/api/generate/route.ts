import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface GenerateBody {
  prompt: string;
  count: number;
  exclusions?: string[];
  avoid?: string[];
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

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GROQ_API_KEY non configurata. Copia .env.local.example in .env.local e inserisci la tua chiave (gratis su console.groq.com).",
        },
        { status: 500 }
      );
    }

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

    const systemPrompt = `Sei un assistente esperto di naming e brand. Genera ${count} idee di nome a dominio brevi, brandizzabili, memorabili e pronunciabili, ispirate al brief dell'utente.
Regole:
- Restituisci SOLO la parte prima del punto (il nome, senza TLD).
- Niente spazi, niente accenti, niente punteggiatura oltre al trattino (-).
- Lunghezza ideale 5-14 caratteri.
- Varia lo stile: parole composte, fusioni, metafore, suggestive nonsense.
- Evita marchi noti e termini generics già saturi.
${exclusionLine}
${avoidLine}
Rispondi in JSON: {"names": ["nome1","nome2",...]} con esattamente ${count} elementi.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.9,
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json(
        { error: `Errore Groq (${res.status}): ${txt.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let names: string[] = [];
    try {
      const parsed = JSON.parse(content);
      names = Array.isArray(parsed.names) ? parsed.names : [];
    } catch {
      names = [];
    }

    // Build the avoid set (lowercased) to filter repeats.
    const avoidSet = new Set(avoid.map((n) => String(n).toLowerCase()));

    // Sanitize: lowercase, strip dots/spaces, dedupe, drop avoid repeats, cap to count.
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

    return NextResponse.json({ names: unique });
  } catch (err) {
    return NextResponse.json(
      { error: `Errore interno: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
