import { NextRequest, NextResponse } from "next/server";
import { fetchProviderModels, isProviderConfigured } from "@/lib/ai-server";
import { getProvider } from "@/lib/ai-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/models?provider=<id>
 * Asks the provider which models it exposes right now, so the UI can refresh
 * the model picker without a redeploy when the provider retires/releases ids.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("provider") ?? "";
  const provider = getProvider(id);
  if (!provider) {
    return NextResponse.json(
      { error: `Provider sconosciuto: "${id || "(mancante)"}".` },
      { status: 400 }
    );
  }
  if (!isProviderConfigured(provider)) {
    return NextResponse.json(
      { error: `${provider.label} non è configurato: manca la chiave o la base URL.` },
      { status: 400 }
    );
  }

  try {
    const models = await fetchProviderModels(provider);
    if (models.length === 0) {
      return NextResponse.json(
        { error: `${provider.label} non ha restituito modelli utilizzabili.` },
        { status: 502 }
      );
    }
    return NextResponse.json({ provider: provider.id, models });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
