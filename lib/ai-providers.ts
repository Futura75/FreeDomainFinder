// Provider registry for the AI generation engine.
// Pure metadata — safe to import from both client and server code.

export type AuthScheme = "bearer" | "x-api-key" | "none";
export type ApiShape = "openai-chat" | "anthropic-messages";

export interface ProviderModel {
  id: string;
  label: string;
}

export interface ProviderDef {
  id: string;
  label: string;
  docsUrl: string;
  /** Default base URL for the provider's API. Can be overridden via envBaseUrl. */
  baseUrl: string;
  apiShape: ApiShape;
  authScheme: AuthScheme;
  /** Env var holding the API key, or null when no key is needed (e.g. local). */
  envKey: string | null;
  /** Optional env var that overrides the base URL (for custom/self-hosted endpoints). */
  envBaseUrl?: string;
  /** Optional env var that sets the default model. */
  envModel?: string;
  defaultModel: string;
  models: ProviderModel[];
  /** True when a valid config requires the base URL to be set (e.g. self-hosted). */
  requiresBaseUrl?: boolean;
  freeTierNote?: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "groq",
    label: "Groq",
    docsUrl: "https://console.groq.com/keys",
    baseUrl: "https://api.groq.com/openai/v1",
    apiShape: "openai-chat",
    authScheme: "bearer",
    envKey: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (fast)" },
      { id: "llama-3.2-3b-preview", label: "Llama 3.2 3B (fast)" },
    ],
    freeTierNote: "Free tier generoso, ottima velocità.",
  },
  {
    id: "openai",
    label: "OpenAI",
    docsUrl: "https://platform.openai.com/api-keys",
    baseUrl: "https://api.openai.com/v1",
    apiShape: "openai-chat",
    authScheme: "bearer",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    docsUrl: "https://console.anthropic.com/settings/keys",
    baseUrl: "https://api.anthropic.com/v1",
    apiShape: "anthropic-messages",
    authScheme: "x-api-key",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-3-5-haiku-latest",
    models: [
      { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
      { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
      { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    docsUrl: "https://openrouter.ai/keys",
    baseUrl: "https://openrouter.ai/api/v1",
    apiShape: "openai-chat",
    authScheme: "bearer",
    envKey: "OPENROUTER_API_KEY",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
      { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5" },
      { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku" },
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
    ],
    freeTierNote: "Aggregatore: molti modelli, anche gratuiti.",
  },
  {
    id: "opencode",
    label: "OpenCode GO",
    docsUrl: "https://opencode.ai",
    baseUrl: "", // self-hosted / custom endpoint — must be set via OPENCODE_BASE_URL
    apiShape: "openai-chat",
    authScheme: "bearer",
    envKey: "OPENCODE_API_KEY",
    envBaseUrl: "OPENCODE_BASE_URL",
    envModel: "OPENCODE_MODEL",
    defaultModel: "",
    models: [],
    requiresBaseUrl: true,
    freeTierNote: "Endpoint OpenAI-compatibile self-hosted. Configura base URL, chiave e modello via env.",
  },
  {
    id: "together",
    label: "Together AI",
    docsUrl: "https://api.together.xyz/settings/api-keys",
    baseUrl: "https://api.together.xyz/v1",
    apiShape: "openai-chat",
    authScheme: "bearer",
    envKey: "TOGETHER_API_KEY",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", label: "Llama 3.3 70B Turbo (free)" },
      { id: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", label: "Llama 3.1 8B Turbo" },
    ],
    freeTierNote: "Free tier disponibile.",
  },
  {
    id: "mistral",
    label: "Mistral",
    docsUrl: "https://console.mistral.ai/api-keys",
    baseUrl: "https://api.mistral.ai/v1",
    apiShape: "openai-chat",
    authScheme: "bearer",
    envKey: "MISTRAL_API_KEY",
    defaultModel: "mistral-small-latest",
    models: [
      { id: "mistral-small-latest", label: "Mistral Small" },
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "open-mistral-nemo", label: "Mistral Nemo" },
    ],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    docsUrl: "https://console.x.ai",
    baseUrl: "https://api.x.ai/v1",
    apiShape: "openai-chat",
    authScheme: "bearer",
    envKey: "XAI_API_KEY",
    defaultModel: "grok-2-latest",
    models: [
      { id: "grok-2-latest", label: "Grok 2" },
      { id: "grok-2-mini", label: "Grok 2 Mini" },
    ],
  },
  {
    id: "ollama",
    label: "Ollama (locale)",
    docsUrl: "https://ollama.com",
    baseUrl: "http://localhost:11434/v1",
    apiShape: "openai-chat",
    authScheme: "none",
    envKey: null,
    envBaseUrl: "OLLAMA_BASE_URL",
    envModel: "OLLAMA_MODEL",
    requiresBaseUrl: true,
    defaultModel: "llama3.1",
    models: [
      { id: "llama3.1", label: "Llama 3.1" },
      { id: "qwen2.5", label: "Qwen 2.5" },
      { id: "mistral", label: "Mistral" },
    ],
    freeTierNote: "Modello locale, nessuna chiave. Imposta OLLAMA_BASE_URL, avvia Ollama e `ollama pull <model>`.",
  },
];

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
