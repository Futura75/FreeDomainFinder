import { NextRequest, NextResponse } from "next/server";
import {
  generateNames,
  EmptyPromptError,
  NoProviderConfiguredError,
  clampCount,
} from "@/lib/generate";

export const runtime = "nodejs";

interface GenerateBody {
  prompt?: string;
  count?: number;
  exclusions?: string[];
  avoid?: string[];
  provider?: string;
  model?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateBody;
    const result = await generateNames({
      prompt: body.prompt ?? "",
      count: clampCount(body.count),
      exclusions: body.exclusions,
      avoid: body.avoid,
      provider: body.provider,
      model: body.model,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EmptyPromptError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof NoProviderConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    // Provider/network errors (already labelled by callProvider) or internal.
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
