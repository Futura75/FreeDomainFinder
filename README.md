# FreeDomainFinder

App web locale per verificare la disponibilità di nomi a dominio e generare alternative con AI.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS v3**
- Design system: **WhistleGuard** (palette blu/teal, font Public Sans + JetBrains Mono, Remix Icons)
- Notifiche: **SweetAlert2** (toast in alto a destra + popup di completamento, temati chiaro/scuro)
- Verifica disponibilità: **RDAP** (`rdap.org`) + fallback **DNS-over-HTTPS** (Cloudflare), lato client, niente chiavi
- AI: **Groq** (`llama-3.3-70b-versatile`, free tier) via API route server-side

## Avvio rapido

```bash
npm install
cp .env.local.example .env.local
# inserisci la tua GROQ_API_KEY (gratis su https://console.groq.com/keys)
npm run dev
```

Apri http://localhost:3000

> Senza chiave Groq la verifica diretta funziona comunque; solo la generazione AI restituisce un errore con le istruzioni.

## Due modalità

1. **Verifica diretta** — due modalità di input:
   - **Singolo**: un nome, senza estensione (→ tutti i TLD attivi) o con estensione (→ solo quel TLD)
   - **Lista**: un dominio per riga (o separati da virgola), ognuno con o senza estensione
2. **Genera con AI** — scrivi un breve prompt, scegli quante alternative (1–20), genera, modifica la lista se vuoi, poi "Controlla tutti". Puoi rigenerare più volte: ogni round precedente viene archiviato in un **accordion collassato** ("Round precedenti") e i nomi già proposti vengono inviati all'AI come da evitare, così ogni lista è diversa.

Dopo una ricerca puoi:
- **Nuova ricerca** (intestazione risultati): cancella i risultati ma mantiene il testo digitato (prompt/input) e lo storico AI
- **Azzera** (header): ricomincia da zero, cancellando prompt, input, risultati, alternative e storico

Durante la verifica una **progress bar** mostra l'avanzamento; al completamento arriva una **notifica SweetAlert**.

Nei risultati puoi **ordinare** per alfabetico (A→Z / Z→A) o disponibilità (più/meno TLD liberi) e attivare i filtri **Solo liberi** (almeno un TLD libero) e **Solo tutti liberi** (nome con tutti i TLD verificati liberi, evidenziato con badge trofeo verde).

## Estensioni di dominio

Pannello "TLD" in alto a destra:
- **Attive**: chip blu, cliccabili per rimuovere; campo testo per aggiungere TLD arbitrari
- **Suggerite**: chip pronti da attivare
- **Escluse**: chip rossi, mai usate nei risultati (utile per filtrare l'output AI)
- **Usati di recente**: chip dei TLD personalizzati già aggiunti in passato, per riattivarli senza ridigitarli

La configurazione (attive, escluse, cronologia TLD usati) è persistita in `localStorage`.

## Risultati

Per ogni nome, griglia di badge per TLD:
- 🟢 **Libero** + link "Acquista" (Namecheap)
- 🔴 **Occupato**
- ⚪ **Non verificabile** (TLD senza RDAP e DNS ambiguo)

## Layout

App a tutto schermo, fluida: il contenuto si adatta alla larghezza del viewport (niente `max-width` fisso). La scheda **Nomi** usa una griglia `input | lista` su desktop, impilata su mobile. La scheda **Risultati** ospita la progress bar, i controlli di ordinamento/filtro e la griglia dei risultati.

## Sessioni (save / load)

- **Salva** (header): scarica un file JSON `fdf-session-YYYY-MM-DD.json` con configurazione TLD, input, prompt, suggerimenti e risultati.
- **Carica** (header): seleziona un file JSON precedentemente salvato; ripristina l'intera sessione (con conferma). Il file è interoperabile e leggibile anche fuori dall'app.
- **Ricontrolla** (scheda Risultati o riga nella scheda Nomi): ri-esegue la verifica dei nomi presenti usando i TLD attualmente attivi.

## Struttura

```
app/
  layout.tsx              font + Remix Icons + globals
  page.tsx                UI principale (client)
  api/generate/route.ts   proxy Groq (nasconde la chiave)
lib/
  tlds.ts                 normalizzazione, parsing, default TLD
  check.ts                RDAP + DoH, concorrenza limitata
tailwind.config.ts        token WhistleGuard + dark mode
```

## Note

- Uso in locale. Per deployare: refactor minimo (le API route già girano su Vercel).
- La verifica della disponibilità è indicativa (RDAP + DNS). Prima di acquistare conferma sempre presso un registrar.
