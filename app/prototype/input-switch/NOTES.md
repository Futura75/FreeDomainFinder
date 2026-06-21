# Prototype — input switch (single vs bulk)

**Question:** how should the switch between single-line and multi-line (bulk) domain input look?

**Route:** `/prototype/input-switch` — variants gated by `?variant=A|B|C|D`, floating bottom bar to flip.

## Variants

- **A — Segmented control (refined):** polished version of the current toggle. Right-aligned under a section title, active state uses primary fill, full-width on mobile. Closest to production today.
- **B — Auto-detect unified field:** no toggle at all. One textarea; if one line → single, if multiple → bulk. Live badge "1 nome" / "N nomi", button label adapts. Removes the switch entirely.
- **C — Choice cards:** two large selectable cards ("Singolo dominio" / "Lista di domini") replace the toggle; selecting one reveals its input. Replaces a control with content.
- **D — Dropdown mode selector:** a native `<select>` labeled "Modalità" inline with the field. Minimal chrome, compact, keyboard-native.

## Verdict

_(to fill in once a variant wins — which one and why)_

## Cleanup

When done: delete `app/prototype/input-switch/` and this NOTES.md, fold the winning variant into `app/page.tsx` (rewritten properly under non-prototype constraints).
