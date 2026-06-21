import { NextResponse } from "next/server";
import { getConfiguredProviders, resolveSelection } from "@/lib/ai-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const providers = getConfiguredProviders();
  const configuredCount = providers.filter((p) => p.configured).length;
  const resolved = resolveSelection();

  return NextResponse.json({
    configured: configuredCount > 0,
    providers,
    // The provider/model the server would use by default (env AI_PROVIDER or first configured).
    defaultProvider: resolved?.provider.id ?? null,
    defaultModel: resolved?.model ?? null,
    hint:
      configuredCount === 0
        ? "Nessun provider AI configurato. Imposta almeno una chiave in .env.local (es. GROQ_API_KEY) e riavvia il server."
        : null,
  });
}
