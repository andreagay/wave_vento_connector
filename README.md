# Wave by Vento 2026 per Claude

Guida **non ufficiale** a [Wave by Vento 2026](https://wavebyvento.com/) (ex Italian Tech Week, OGR Torino, 7-9 ottobre 2026) per Claude: è la versione Claude del plugin ChatGPT, pronta da condividere.

Contiene due pezzi, utilizzabili insieme o separatamente:

- **Plugin Claude** `wave-by-vento`: una skill con i dati verificati dell'evento (date, sede, trasporti, pass, accesso e badge, app ufficiale, palchi, servizi, eventi collaterali, festa di chiusura, speaker annunciati, sessioni confermate) e le regole per rispondere bene. Funziona in chat, Cowork e Claude Code senza server.
- **Connettore MCP** (remoto): aggiunge dati live dal sito ufficiale e dal calendario Luma degli eventi collaterali. Si pubblica gratis su Vercel e si condivide con un URL.

## Come si condivide

| Modo | Per chi | Cosa condividi |
| --- | --- | --- |
| Marketplace GitHub | Piani Pro, Max, Team, Enterprise | `andreagay/wave_vento_connector` |
| File plugin | Stessi piani | [`dist/wave-by-vento.plugin`](https://github.com/andreagay/wave_vento_connector/raw/main/dist/wave-by-vento.plugin) |
| Condivisione interna | Team ed Enterprise, se un Owner ha attivato la condivisione dei plugin | Carica il file plugin, poi Personalizza → Plugin → ⋯ → Condividi (crea un link per i colleghi) |
| Connettore personalizzato | Tutti i piani, anche Free (1 connettore) | `https://<tuo-progetto>.vercel.app/mcp`, oppure la pagina `https://<tuo-progetto>.vercel.app/` che spiega i passaggi |

## 1. Installare il plugin

In Claude (web o desktop):

1. **Personalizza → Plugin** (*Customize → Plugins*).
2. **Aggiungi → Aggiungi marketplace** (*Add → Add marketplace*) e inserisci `andreagay/wave_vento_connector`.
3. Installa **wave-by-vento**. Il plugin è salvato nell'account, quindi lo trovi anche in Cowork e Claude Code.

In alternativa carica il file `dist/wave-by-vento.plugin` dalla stessa pagina.

In Claude Code:

```text
/plugin marketplace add andreagay/wave_vento_connector
/plugin install wave-by-vento@wave-vento-connector
```

## 2. Pubblicare il connettore (dati live)

Su Vercel (gratis, nessuna configurazione):

1. Vai su [vercel.com/new](https://vercel.com/new) e importa il repository `andreagay/wave_vento_connector`.
2. Clicca **Deploy**. Ottieni `https://<progetto>.vercel.app`: la pagina principale spiega come aggiungere il connettore, l'endpoint MCP è `https://<progetto>.vercel.app/mcp`.
3. Collega il connettore al plugin, così chi installa il plugin lo trova già nella scheda Connettori:

   ```bash
   npm install
   npm run build:plugin -- --mcp-url https://<progetto>.vercel.app/mcp
   npm test
   git add -A && git commit -m "Collega il connettore al plugin" && git push
   ```

Funziona anche su qualsiasi host Node 20+ (Render, Railway, Fly, Docker): `npm start` espone `/mcp`, `/health` e la pagina su `/` (porta da `PORT`, default 3000).

## 3. Aggiungere solo il connettore

- **Pro e Max**: Personalizza → Connettori → **+** → Aggiungi connettore personalizzato, incolla l'URL `/mcp`. Nessuna autenticazione.
- **Team ed Enterprise**: un Owner va in Impostazioni organizzazione → Connettori → Aggiungi → Personalizzato → Web; poi ognuno clicca **Connetti** in Personalizza → Connettori.
- **Claude Code**: `claude mcp add --transport http wave-by-vento https://<progetto>.vercel.app/mcp`
- **Claude Desktop in locale** (senza deploy): dopo `npm install`, aggiungi alla configurazione MCP

  ```json
  { "mcpServers": { "wave-by-vento": { "command": "node", "args": ["/percorso/wave_vento_connector/src/stdio.js"] } } }
  ```

## Cosa sa fare

Strumenti del connettore (tutti in sola lettura):

| Strumento | Cosa fa |
| --- | --- |
| `get_event_info` | Info pratiche verificate con fonti: date e orari, sede e trasporti, pass e sconti, ingresso e badge, app, palchi, cibo, guardaroba, bagagli, accessibilità, eventi collaterali, festa .WAV, link ufficiali |
| `search_program` | Cerca tra le sessioni confermate da fonti pubbliche, per parola chiave, giorno, formato o speaker |
| `find_speakers` | Speaker annunciati, con ruolo, azienda ed eventuale sessione |
| `get_side_events` | Eventi collaterali live dal calendario Luma ufficiale, filtrabili per giorno e parola chiave |
| `read_official_page` | Testo aggiornato delle pagine ufficiali (agenda, FAQ, info evento, pass, Torino), con filtro per parole chiave |

C'è anche il prompt **plan_my_wave**, che costruisce un programma personale giorno per giorno.

Esempi di domande: "Quando parla Dario Amodei?", "Sono un founder fintech: preparami il 8 e 9 ottobre", "Che eventi collaterali ci sono mercoledì sera?", "Come arrivo alle OGR da Porta Susa e dove stampo il badge?".

## Aggiornare i dati

Tutti i contenuti stanno in `data/` (verificati l'1 ottobre 2026, ognuno con le sue fonti in `data/event.json`):

- `event.json`: informazioni pratiche, link e registro delle fonti;
- `speakers.json`: speaker annunciati;
- `program.json`: sessioni confermate (`date`, `start` e `end` restano `null` finché non sono pubblici).

Dopo una modifica:

```bash
npm run build:plugin   # rigenera i riferimenti della skill e dist/wave-by-vento.plugin
npm test               # 42 test: dati, ricerca, parser live, MCP via HTTP/stdio, plugin
```

Su Vercel il connettore si aggiorna da solo a ogni push. Per il plugin aumenta `version` in `package.json`, `src/version.js`, `plugins/wave-by-vento/.claude-plugin/plugin.json` e `.claude-plugin/marketplace.json` (il build controlla che coincidano), così chi lo ha installato dal marketplace riceve la nuova versione.

## Limiti noti

- Il programma completo (70+ talk, 45 masterclass) non è nei dati curati: c'erano solo 4 sessioni con fonte pubblica. Il connettore lo legge live da `wavebyvento.com/agenda`; senza connettore la skill indica a Claude di cercarlo sul sito ufficiale. Se la pagina dell'agenda è generata via JavaScript, il testo può risultare scarno e Claude rimanda all'app ufficiale.
- La lettura live di Luma e del sito ufficiale è testata con dati di esempio, ma non è stata provata contro i siti veri (non raggiungibili dall'ambiente di sviluppo). Dopo il deploy prova `get_side_events` e `read_official_page`.
- Progetto non ufficiale, non affiliato a Vento o Wave by Vento.

## Struttura

```text
.claude-plugin/marketplace.json   marketplace (un plugin)
plugins/wave-by-vento/            plugin: manifest, skill e riferimenti generati
dist/wave-by-vento.plugin         plugin impacchettato da caricare o condividere
data/                             dati dell'evento con fonti
src/                              server MCP (strumenti, HTTP, stdio, dati live)
api/                              funzioni Vercel (/mcp, /health)
public/index.html                 pagina di presentazione del connettore
scripts/                          build del plugin
test/                             test (node --test)
```

---

## English summary

Unofficial Claude version of the Wave by Vento 2026 ChatGPT plugin (OGR Torino, 7-9 October 2026). It ships a **Claude plugin** (a skill with verified, sourced event data; works in chat, Cowork and Claude Code without any server) and a **remote MCP connector** (live data from the official website and the Luma side-events calendar) that deploys to Vercel as-is.

- Install the plugin: Customize → Plugins → Add → Add marketplace → `andreagay/wave_vento_connector`, or upload `dist/wave-by-vento.plugin`. Claude Code: `/plugin marketplace add andreagay/wave_vento_connector`.
- Deploy the connector: import the repo at [vercel.com/new](https://vercel.com/new); the endpoint is `https://<project>.vercel.app/mcp` and the root page explains how to add it (Customize → Connectors → + → Add custom connector, available on every plan).
- Wire the connector into the plugin: `npm run build:plugin -- --mcp-url https://<project>.vercel.app/mcp`.
- Edit data in `data/*.json`, then `npm run build:plugin && npm test`.
