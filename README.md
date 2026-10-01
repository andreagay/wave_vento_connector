# Wave by Vento 2026 per Claude

Guida **non ufficiale** a [Wave by Vento 2026](https://wavebyvento.com/) (ex Italian Tech Week, OGR Torino, 7-9 ottobre 2026) per Claude: è la versione Claude del plugin ChatGPT, pronta da condividere.

Contiene due pezzi, utilizzabili insieme o separatamente:

- **Plugin Claude** `wave-by-vento`: una skill con il programma ufficiale completo (sessioni e speaker, giorno per giorno), le informazioni pratiche verificate sul sito ufficiale (pass e prezzi, accesso e badge, trasporti, app, servizi, streaming, eventi collaterali, festa di chiusura) e le regole per rispondere bene. Funziona in chat, Cowork e Claude Code senza server.
- **Connettore MCP** (remoto): legge in tempo reale l'agenda ufficiale, il calendario Luma degli eventi collaterali e le pagine del sito ufficiale. Si pubblica gratis su Vercel e si condivide con un URL.

## Come si condivide

| Modo | Per chi | Cosa condividi |
| --- | --- | --- |
| Marketplace GitHub | Piani Pro, Max, Team, Enterprise | `andreagay/wave_vento_connector` |
| File plugin | Stessi piani | [`dist/wave-by-vento.plugin`](https://github.com/andreagay/wave_vento_connector/raw/main/dist/wave-by-vento.plugin) |
| Condivisione interna | Team ed Enterprise, se un Owner ha attivato la condivisione dei plugin | Carica il file plugin, poi Personalizza → Plugin → ⋯ → Condividi (crea un link per i colleghi) |
| Connettore personalizzato | Tutti i piani, anche Free (1 connettore) | `https://wave-vento-connector.vercel.app/mcp`, oppure la pagina [wave-vento-connector.vercel.app](https://wave-vento-connector.vercel.app/) che spiega i passaggi |

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

Il connettore è pubblicato su **https://wave-vento-connector.vercel.app/mcp** ed è già collegato al plugin (`plugins/wave-by-vento/.mcp.json`). Chi installa il plugin lo trova nella scheda Connettori del plugin.

Per pubblicarne un'altra copia su Vercel (gratis, nessuna configurazione):

1. Vai su [vercel.com/new](https://vercel.com/new) e importa il repository `andreagay/wave_vento_connector`.
2. Clicca **Deploy**. Usa il dominio di produzione (`https://<progetto>.vercel.app`, in Settings → Domains): la pagina principale spiega come aggiungere il connettore, l'endpoint MCP è `/mcp`. Gli indirizzi dei singoli deploy (`<progetto>-<codice>-<team>.vercel.app`) sono protetti da Vercel Authentication e cambiano a ogni deploy, quindi Claude non può usarli.
3. Collega il connettore al plugin, così chi installa il plugin lo trova già nella scheda Connettori:

   ```bash
   npm install
   npm run build:plugin -- --mcp-url https://<progetto>.vercel.app/mcp
   npm test
   git add -A && git commit -m "Collega il connettore al plugin" && git push
   ```

`vercel.json` imposta `"framework": null`: senza, Vercel scambierebbe il progetto per un server Node e risponderebbe 500 a ogni richiesta. Per lo stesso motivo nessun file deve chiamarsi `server.js` (né in radice né in `src/`); un test lo controlla.

Funziona anche su qualsiasi host Node 18+ (Render, Railway, Fly, Docker): `npm start` espone `/mcp`, `/health` e la pagina su `/` (porta da `PORT`, default 3000).

## 3. Aggiungere solo il connettore

- **Pro e Max**: Personalizza → Connettori → **+** → Aggiungi connettore personalizzato, incolla `https://wave-vento-connector.vercel.app/mcp`. Nessuna autenticazione.
- **Team ed Enterprise**: un Owner va in Impostazioni organizzazione → Connettori → Aggiungi → Personalizzato → Web; poi ognuno clicca **Connetti** in Personalizza → Connettori.
- **Claude Code**: `claude mcp add --transport http wave-by-vento https://wave-vento-connector.vercel.app/mcp`
- **Claude Desktop in locale** (senza deploy): dopo `npm install`, aggiungi alla configurazione MCP

  ```json
  { "mcpServers": { "wave-by-vento": { "command": "node", "args": ["/percorso/wave_vento_connector/src/stdio.js"] } } }
  ```

## Cosa sa fare

Strumenti del connettore (tutti in sola lettura):

| Strumento | Cosa fa |
| --- | --- |
| `search_program` | Cerca nell'agenda ufficiale (talk sui palchi Fucine e Binario 3, masterclass, live podcast, pitch, più VCunder35 e la festa .WAV) per parola chiave, giorno, formato, sala, speaker e orario |
| `get_session` | Scheda completa di una sessione: orario, sala, capienza, prenotazione, descrizione e bio degli speaker |
| `find_speakers` | Speaker dell'agenda ufficiale con ruolo, azienda e sessioni; segnala chi era stato annunciato ma non è in agenda |
| `get_event_info` | Info pratiche verificate con fonti: pass e prezzi, ingresso e badge, trasporti, app, palchi, networking, cibo e servizi, streaming, eventi collaterali, festa .WAV, Torino, contatti, link |
| `get_side_events` | Eventi collaterali live dal calendario Luma ufficiale, filtrabili per giorno e parola chiave |
| `read_official_page` | Testo aggiornato delle pagine ufficiali (FAQ, info evento, pass, Torino), con filtro per parole chiave |

L'agenda arriva dalle stesse API pubbliche di Brella usate dal widget su wavebyvento.com/agenda. Se non risponde, il connettore usa l'ultimo snapshot salvato in `data/agenda.json` e lo dice.

C'è anche il prompt **plan_my_wave**, che costruisce un programma personale giorno per giorno.

Esempi di domande: "Quando parlano Jony Ive e John Elkann?", "Quali masterclass sull'AI ci sono giovedì mattina?", "Sono un founder fintech: preparami l'8 e il 9 ottobre", "Che eventi collaterali ci sono mercoledì sera?", "Come arrivo alle OGR da Porta Susa e dove stampo il badge?".

## Aggiornare i dati

Tutti i contenuti stanno in `data/` (verificati sulle fonti ufficiali l'1 ottobre 2026):

- `event.json`: informazioni pratiche per sezioni, ognuna con le sue fonti, più link e registro delle fonti;
- `agenda.json`: snapshot dell'agenda ufficiale (sessioni e speaker), da cui nascono anche i riferimenti della skill;
- `extras.json`: eventi collegati che non sono nell'agenda (VCunder35 alle OGR, festa .WAV), con fonti.

Per aggiornare:

```bash
npm run sync:agenda    # nuovo snapshot dell'agenda ufficiale
npm run build:plugin   # rigenera i riferimenti della skill e dist/wave-by-vento.plugin
npm test               # test offline: dati, agenda, ricerca, parser live, MCP via HTTP/stdio, plugin
npm run test:live      # verifica contro Brella, Luma e il sito ufficiale
```

Dietro un proxy HTTP usa `NODE_USE_ENV_PROXY=1` (Node 22.21+). Con `WAVE_OFFLINE=1` il connettore non usa la rete e risponde dallo snapshot.

Su Vercel il connettore si aggiorna da solo a ogni push. Per il plugin aumenta `version` in `package.json`, `src/version.js`, `plugins/wave-by-vento/.claude-plugin/plugin.json` e `.claude-plugin/marketplace.json` (il build controlla che coincidano), così chi lo ha installato dal marketplace riceve la nuova versione.

## Limiti noti

- Lo snapshot dell'agenda nel plugin è fermo alla data in cima ai file di programma: se l'agenda cambia, rilancia `npm run sync:agenda` e `npm run build:plugin`. Il connettore invece legge sempre l'agenda live.
- Dario Amodei era stato annunciato a febbraio 2026, ma all'1 ottobre non è nell'agenda ufficiale: il plugin lo dice invece di inventare un orario.
- Le API di Brella e Luma usate sono quelle pubbliche dei rispettivi widget e pagine, non documentate: se cambiano formato, `npm run test:live` lo segnala e il connettore ripiega su snapshot e link ufficiali.
- Non ho potuto confrontare questa versione con il plugin ChatGPT originale: la pagina di chatgpt.com è protetta da una verifica anti-bot.
- Progetto non ufficiale, non affiliato a Vento o Wave by Vento.

## Struttura

```text
.claude-plugin/marketplace.json   marketplace (un plugin)
plugins/wave-by-vento/            plugin: manifest, skill e riferimenti generati
dist/wave-by-vento.plugin         plugin impacchettato da caricare o condividere
data/                             info pratiche con fonti, snapshot dell'agenda, eventi extra
src/                              server MCP (strumenti, agenda, HTTP, stdio, dati live)
api/                              funzioni Vercel (/mcp, /health)
public/index.html                 pagina di presentazione del connettore
scripts/                          sync dell'agenda e build del plugin
test/                             test (node --test)
```

---

## English summary

Unofficial Claude version of the Wave by Vento 2026 ChatGPT plugin (OGR Torino, 7-9 October 2026). It ships a **Claude plugin** (a skill with the full official program by day, all speakers and practical info checked against the official website; works in chat, Cowork and Claude Code without any server) and a **remote MCP connector** (live official agenda, Luma side events and official pages, with a saved snapshot as fallback) that deploys to Vercel as-is.

- Install the plugin: Customize → Plugins → Add → Add marketplace → `andreagay/wave_vento_connector`, or upload `dist/wave-by-vento.plugin`. Claude Code: `/plugin marketplace add andreagay/wave_vento_connector`.
- Connector: https://wave-vento-connector.vercel.app/mcp (already wired into the plugin); the root page explains how to add it (Customize → Connectors → + → Add custom connector, available on every plan). To deploy your own copy, import the repo at [vercel.com/new](https://vercel.com/new) and use the production domain: deployment-specific URLs are behind Vercel Authentication. `vercel.json` sets `"framework": null` so Vercel doesn't treat the project as a Node server.
- Point the plugin at another connector: `npm run build:plugin -- --mcp-url https://<project>.vercel.app/mcp`.
- Refresh the agenda snapshot with `npm run sync:agenda`, edit practical info in `data/event.json`, then `npm run build:plugin && npm test` (`npm run test:live` checks the real services).
