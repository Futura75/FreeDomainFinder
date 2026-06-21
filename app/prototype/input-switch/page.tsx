"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

/* =========================================================================
   PROTOTYPE — throwaway. Question: how should the single/bulk input switch
   look? Four radically different variants, switchable via ?variant=A|B|C|D.
   Hosted on /prototype/input-switch. Delete after a variant wins.
   ========================================================================= */

type Mode = "single" | "bulk";
const EFFECTIVE_TLDS = 12; // mock count for helper text

/* ----------------------------- shared bits ------------------------------ */

function PrimaryButton({ label, busy }: { label: string; busy?: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      className="h-11 px-5 rounded bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-60 flex items-center justify-center gap-2"
    >
      {busy ? (
        <>
          <i className="ri-loader-4-line animate-spin" /> Verifica…
        </>
      ) : (
        <>
          <i className="ri-search-line" /> {label}
        </>
      )}
    </button>
  );
}

function NewSearchButton() {
  return (
    <button
      type="button"
      title="Nuova ricerca"
      className="h-11 px-4 rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface text-sm font-medium text-ink dark:text-darkink hover:border-accent hover:text-accent transition-colors flex items-center gap-1.5"
    >
      <i className="ri-refresh-line" /> Nuova ricerca
    </button>
  );
}

/* ============================ VARIANT A ==================================
   Refined segmented control. Same idea as current, but polished:
   - right-aligned under a section title
   - active state uses primary fill (not just surface), clearer affordance
   - larger touch targets, full-width on mobile
   ========================================================================= */

function VariantA() {
  const [mode, setMode] = useState<Mode>("single");
  const [single, setSingle] = useState("");
  const [bulk, setBulk] = useState("");
  return (
    <div className="rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface shadow-card dark:shadow-cardDark p-4 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <i className="ri-search-line text-primary" /> Verifica diretta
        </h3>
        <div
          role="tablist"
          aria-label="Modalità input"
          className="inline-flex rounded-md border border-border dark:border-darkborder bg-background dark:bg-darkbg p-1 w-full sm:w-auto"
        >
          <button
            role="tab"
            aria-selected={mode === "single"}
            onClick={() => setMode("single")}
            className={`flex-1 sm:flex-none px-4 h-9 rounded text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
              mode === "single"
                ? "bg-primary text-white shadow-sm"
                : "text-ink-muted hover:text-ink dark:hover:text-darkink"
            }`}
          >
            <i className="ri-input-method-line" /> Singolo
          </button>
          <button
            role="tab"
            aria-selected={mode === "bulk"}
            onClick={() => setMode("bulk")}
            className={`flex-1 sm:flex-none px-4 h-9 rounded text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
              mode === "bulk"
                ? "bg-primary text-white shadow-sm"
                : "text-ink-muted hover:text-ink dark:hover:text-darkink"
            }`}
          >
            <i className="ri-list-unordered" /> Lista
          </button>
        </div>
      </div>

      {mode === "single" ? (
        <>
          <label htmlFor="a-single" className="block text-sm font-medium mb-2">
            Nome a dominio
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="a-single"
              value={single}
              onChange={(e) => setSingle(e.target.value)}
              placeholder="es. mieodomini  oppure  mieodomini.it"
              className="flex-1 h-11 px-4 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-base font-mono"
            />
            <PrimaryButton label="Controlla" />
            <NewSearchButton />
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Senza estensione verifica su tutti i {EFFECTIVE_TLDS} TLD attivi.
            Con estensione (es. <span className="font-mono">.it</span>) verifica solo quel TLD.
          </p>
        </>
      ) : (
        <>
          <label htmlFor="a-bulk" className="block text-sm font-medium mb-2">
            Lista di domini — uno per riga
          </label>
          <textarea
            id="a-bulk"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={8}
            placeholder={"es.\nmieodomini\nmieodomini.it\naltrosito\nprogetto.app"}
            className="w-full px-4 py-3 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-base font-mono resize-y"
          />
          <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
            <p className="text-xs text-ink-muted">
              Righe con estensione → solo quel TLD; righe senza → tutti i {EFFECTIVE_TLDS} TLD attivi.
            </p>
            <div className="flex gap-2">
              <PrimaryButton label="Controlla lista" />
              <NewSearchButton />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================ VARIANT B ==================================
   Auto-detect unified field. NO toggle at all. One textarea that is always
   present; if one line → single semantics, if multiple → bulk. A live badge
   shows how many names were detected. Button label adapts. Removes the
   switch entirely.
   ========================================================================= */

function countNames(text: string): number {
  return text
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean).length;
}

function VariantB() {
  const [text, setText] = useState("");
  const n = countNames(text);
  const isBulk = n > 1;
  return (
    <div className="rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface shadow-card dark:shadow-cardDark p-4 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <label htmlFor="b-field" className="text-sm font-medium flex items-center gap-2">
          <i className="ri-search-line text-primary" /> Nomi a dominio
        </label>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-mono border ${
            n === 0
              ? "text-ink-muted border-border dark:border-darkborder"
              : isBulk
              ? "text-accent border-accent/40 bg-accent/10"
              : "text-primary border-primary/40 bg-primary/10"
          }`}
        >
          <i className={isBulk ? "ri-list-unordered" : "ri-input-method-line"} />
          {n === 0 ? "0 nomi" : isBulk ? `${n} nomi` : "1 nome"}
        </span>
      </div>
      <textarea
        id="b-field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={text.includes("\n") ? 6 : 2}
        placeholder={
          "Un nome (es. mieodomini) oppure una lista, uno per riga:\nmieodomini\nmieodomini.it\naltrosito"
        }
        className="w-full px-4 py-3 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-base font-mono resize-y transition-all"
      />
      <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
        <p className="text-xs text-ink-muted">
          {isBulk
            ? `Modalità lista: ${n} nomi · righe con estensione → solo quel TLD`
            : `Senza estensione verifica su tutti i ${EFFECTIVE_TLDS} TLD attivi. Con estensione → solo quel TLD.`}
        </p>
        <div className="flex gap-2">
          <PrimaryButton label={isBulk ? `Controlla ${n} nomi` : "Controlla"} />
          <NewSearchButton />
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-muted italic">
        Niente switch: il campo capisce da solo se è un nome solo o una lista.
      </p>
    </div>
  );
}

/* ============================ VARIANT C ==================================
   Choice cards. Two large selectable cards replace the toggle; selecting
   one reveals its input below. Replaces a control with content.
   ========================================================================= */

function ChoiceCard({
  active,
  icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left w-full rounded-md border p-4 transition-all flex items-start gap-3 ${
        active
          ? "border-primary ring-2 ring-primary/30 bg-primary/[0.04]"
          : "border-border dark:border-darkborder bg-background dark:bg-darkbg hover:border-primary/50"
      }`}
    >
      <i className={`${icon} text-2xl ${active ? "text-primary" : "text-ink-muted"}`} />
      <span className="min-w-0">
        <span className={`block text-sm font-semibold ${active ? "text-primary" : ""}`}>
          {title}
        </span>
        <span className="block text-xs text-ink-muted mt-0.5">{desc}</span>
      </span>
    </button>
  );
}

function VariantC() {
  const [mode, setMode] = useState<Mode>("single");
  const [single, setSingle] = useState("");
  const [bulk, setBulk] = useState("");
  return (
    <div className="rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface shadow-card dark:shadow-cardDark p-4 sm:p-6">
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <ChoiceCard
          active={mode === "single"}
          icon="ri-input-method-line"
          title="Singolo dominio"
          desc="Verifica un nome alla volta, con o senza estensione."
          onClick={() => setMode("single")}
        />
        <ChoiceCard
          active={mode === "bulk"}
          icon="ri-list-unordered"
          title="Lista di domini"
          desc="Uno per riga, anche con estensioni diverse."
          onClick={() => setMode("bulk")}
        />
      </div>

      {mode === "single" ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={single}
            onChange={(e) => setSingle(e.target.value)}
            placeholder="es. mieodomini  oppure  mieodomini.it"
            className="flex-1 h-11 px-4 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-base font-mono"
          />
          <PrimaryButton label="Controlla" />
          <NewSearchButton />
        </div>
      ) : (
        <>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={8}
            placeholder={"es.\nmieodomini\nmieodomini.it\naltrosito\nprogetto.app"}
            className="w-full px-4 py-3 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-base font-mono resize-y"
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <PrimaryButton label="Controlla lista" />
            <NewSearchButton />
          </div>
        </>
      )}
    </div>
  );
}

/* ============================ VARIANT D ==================================
   Dropdown mode selector. A native select labeled "Modalità" sits inline
   with the field. Minimal chrome, compact, keyboard-native.
   ========================================================================= */

function VariantD() {
  const [mode, setMode] = useState<Mode>("single");
  const [single, setSingle] = useState("");
  const [bulk, setBulk] = useState("");
  return (
    <div className="rounded border border-border dark:border-darkborder bg-surface dark:bg-darksurface shadow-card dark:shadow-cardDark p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <label htmlFor="d-mode" className="text-sm font-medium flex items-center gap-2 shrink-0">
          <i className="ri-settings-3-line text-primary" /> Modalità
        </label>
        <select
          id="d-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="h-9 px-3 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-sm font-medium"
        >
          <option value="single">Singolo dominio</option>
          <option value="bulk">Lista (uno per riga)</option>
        </select>
      </div>

      {mode === "single" ? (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={single}
              onChange={(e) => setSingle(e.target.value)}
              placeholder="es. mieodomini  oppure  mieodomini.it"
              className="flex-1 h-11 px-4 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-base font-mono"
            />
            <PrimaryButton label="Controlla" />
            <NewSearchButton />
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Senza estensione verifica su tutti i {EFFECTIVE_TLDS} TLD attivi.
            Con estensione (es. <span className="font-mono">.it</span>) verifica solo quel TLD.
          </p>
        </>
      ) : (
        <>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={8}
            placeholder={"es.\nmieodomini\nmieodomini.it\naltrosito\nprogetto.app"}
            className="w-full px-4 py-3 rounded border border-border dark:border-darkborder bg-background dark:bg-darkbg text-base font-mono resize-y"
          />
          <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
            <p className="text-xs text-ink-muted">
              Righe con estensione → solo quel TLD; righe senza → tutti i {EFFECTIVE_TLDS} TLD attivi.
            </p>
            <div className="flex gap-2">
              <PrimaryButton label="Controlla lista" />
              <NewSearchButton />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------- floating switcher --------------------------- */

const VARIANTS: { key: string; name: string; Comp: () => JSX.Element }[] = [
  { key: "A", name: "Segmented control (refined)", Comp: VariantA },
  { key: "B", name: "Auto-detect unified field", Comp: VariantB },
  { key: "C", name: "Choice cards", Comp: VariantC },
  { key: "D", name: "Dropdown mode selector", Comp: VariantD },
];

function Switcher({
  current,
  onChange,
}: {
  current: string;
  onChange: (k: string) => void;
}) {
  const idx = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === current)
  );
  const v = VARIANTS[idx];
  const cycle = (dir: number) => {
    const next = (idx + dir + VARIANTS.length) % VARIANTS.length;
    onChange(VARIANTS[next].key);
  };
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-ink text-white rounded-full shadow-lg px-3 py-2 text-sm">
      <button
        onClick={() => cycle(-1)}
        aria-label="Variante precedente"
        className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/15"
      >
        <i className="ri-arrow-left-line text-lg" />
      </button>
      <span className="font-mono font-semibold px-2 min-w-[230px] text-center">
        {v.key} — {v.name}
      </span>
      <button
        onClick={() => cycle(1)}
        aria-label="Variante successiva"
        className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/15"
      >
        <i className="ri-arrow-right-line text-lg" />
      </button>
    </div>
  );
}

/* -------------------------------- page ---------------------------------- */

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen p-8 text-ink-muted">Caricamento prototipo…</div>}>
      <PrototypeInner />
    </Suspense>
  );
}

function PrototypeInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("variant") ?? "A";
  const valid = VARIANTS.some((v) => v.key === current) ? current : "A";
  const Active = VARIANTS.find((v) => v.key === valid)!.Comp;

  const setVariant = useCallback(
    (k: string) => {
      const qs = new URLSearchParams(params.toString());
      qs.set("variant", k);
      router.replace(`${pathname}?${qs.toString()}`);
    },
    [router, pathname, params]
  );

  // Keyboard arrows (ignore when typing in inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      if (e.key === "ArrowLeft") setVariant(
        VARIANTS[
          (VARIANTS.findIndex((v) => v.key === valid) - 1 + VARIANTS.length) %
            VARIANTS.length
        ].key
      );
      if (e.key === "ArrowRight") setVariant(
        VARIANTS[
          (VARIANTS.findIndex((v) => v.key === valid) + 1) % VARIANTS.length
        ].key
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setVariant, valid]);

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold mb-1 flex items-center gap-2">
          <i className="ri-flask-line text-primary" /> Prototype — input switch
        </h1>
        <p className="text-sm text-ink-muted mb-6">
          Quattro varianti per lo switch singolo/lista. Usa le frecce in basso (o ←/→ sulla tastiera)
          per cambiare. Variante attuale di produzione = simile ad A.
        </p>
        <Active />
        <p className="mt-6 text-xs text-ink-muted italic">
          Prototipo throwaway — niente check reale, solo l&apos;UI dello switch.
        </p>
      </div>
      {process.env.NODE_ENV !== "production" && (
        <Switcher current={valid} onChange={setVariant} />
      )}
    </div>
  );
}
