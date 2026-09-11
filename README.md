# Tréninkový deník (PWA)

Osobní tréninkový deník pro full-body program A/B/C. Běží jako webová aplikace,
kterou si přidáš na plochu telefonu, data se ukládají do Postgres a jedním
klepnutím vyexportuješ historii pro rozbor v Claudovi.

- **Trénink** – zápis sérií (váha × opakování × zásoba), pauzy, automatická progrese vah
- **Historie / Progres** – odcvičené tréninky, odhad 1RM, objem po týdnech, vliv lezení a capoeiry
- **Plán** – celý program s pokyny ke cvikům
- **Data** – export TXT (rozbor pro Clauda), CSV (řádek na sérii), JSON (záloha), import zálohy
- **Přihlášení** – jedno heslo, cookie na 90 dní, ochrana proti hádání hesla
- **Offline** – aplikace se otevře i bez signálu, změny se uloží na server po připojení

## Nasazení na Railway

1. Na [railway.app](https://railway.app) vytvoř nový projekt → **Deploy from GitHub repo** → vyber tento repozitář.
2. V projektu přidej databázi: **+ New → Database → PostgreSQL**.
3. U služby s aplikací otevři **Variables** a nastav:

   | Proměnná         | Hodnota                                                       |
   |------------------|---------------------------------------------------------------|
   | `DATABASE_URL`   | `${{Postgres.DATABASE_URL}}` (odkaz na Postgres službu)        |
   | `APP_PASSWORD`   | heslo, kterým se budeš přihlašovat                            |
   | `SESSION_SECRET` | dlouhý náhodný řetězec (např. `openssl rand -hex 32`)          |
   | `NODE_ENV`       | `production`                                                  |

4. V **Settings → Networking** klikni **Generate Domain**. Aplikace poběží na `https://…up.railway.app`.
5. Otevři adresu v telefonu, přihlas se a zvol **Přidat na plochu** (Safari: Sdílet → Přidat na plochu; Chrome: menu → Přidat na plochu).

Tabulky si server vytvoří sám při startu. Bez `APP_PASSWORD` nebo `DATABASE_URL` server nenastartuje.

## Export pro Clauda

Záložka **Data** → zvol období (výchozí je posledních 30 dní) nebo **Celá historie**:

- **Rozbor (TXT)** – hotový text s kontextem a otázkami. Nahraj ho do chatu s Claudem nebo použij *Zkopírovat rozbor do schránky*.
- **CSV** – jedna řádka na sérii (`datum, trenink, cvik, serie, vaha_kg, opakovani, zasoba_rir, objem_kg, …`). Vhodné, když chceš hlubší analýzu nebo tabulku.
- **JSON** – kompletní záloha, dá se zpět načíst (i ze staré verze deníku, která ukládala do souboru).

Stejné exporty jsou dostupné i přímo na `/api/export.txt`, `/api/export.csv`, `/api/export.json`
(parametry `?from=YYYY-MM-DD&to=YYYY-MM-DD`), po přihlášení.

## Lokální spuštění

```bash
cp .env.example .env      # doplň DATABASE_URL, APP_PASSWORD, SESSION_SECRET
npm install
set -a; . ./.env; set +a
npm start                 # http://localhost:3000
npm test                  # jednotkové testy exportu a přihlášení
```

## Struktura

```
src/server.js     Express server, API, statické soubory
src/db.js         Postgres – tabulky sessions (tréninky) a kv (váhy, rozpracovaný trénink)
src/auth.js       heslo, podepsaná cookie, limit pokusů
src/export.js     TXT / CSV / JSON export
shared/program.js tréninkový program (sdílený s prohlížečem)
public/           PWA: index.html, app.js, style.css, sw.js, manifest, ikony
```

## API

| Metoda | Cesta                | Popis                                  |
|--------|----------------------|----------------------------------------|
| POST   | `/api/login`         | `{ "password": "…" }` → nastaví cookie |
| POST   | `/api/logout`        | smaže cookie                           |
| GET    | `/api/me`            | `{ "authed": true/false }`             |
| GET    | `/api/state`         | celý stav deníku                       |
| PUT    | `/api/state`         | uloží celý stav deníku                 |
| GET    | `/api/export.{txt,csv,json}` | export, volitelně `from`, `to` |
| GET    | `/api/health`        | kontrola připojení k databázi          |
