# Tréninkový deník (PWA)

Osobní tréninkový deník pro full-body program A/B/C. Běží jako webová aplikace,
kterou si přidáš na plochu telefonu, data se ukládají do Postgres a jedním
klepnutím vyexportuješ historii pro rozbor v Claudovi.

- **Cyklus** – čtyři týdny, poslední je lehký (deload). Na konci vyexportuješ data, Claude napíše nový plán a ty ho nahraješ.
- **Plán jako data** – cviky, série, přírůstky i pokyny jdou nahrát jako JSON. Kód se kvůli novému plánu nemění.
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

## Měsíční cyklus a lehký týden

Cyklus trvá čtyři týdny a deník si pamatuje, kdy začal.

| Týden | Co dělá deník |
|-------|---------------|
| 1 – 3 | Běžná progrese. Když dáš všechny série na horní hranici opakování a zbude ti zásoba, příště sám přidá váhu. |
| 4 | Lehký týden. Váhy předvyplní o 10 % níž, ubere jednu sérii a progresi ten týden nepočítá. |
| po konci | Vyzve tě k exportu a k založení dalšího cyklu. |

Lehký týden **nepřepisuje pracovní váhy**. Když před ním dřepuješ 102,5 kg, deník ti nabídne 92,5 kg,
ale jako pracovní váhu si dál drží 102,5 a další cyklus staví na ní. Bez toho by ses každý měsíc
posouval o desetinu dolů.

Lehké tréninky jsou označené v historii, v CSV sloupcem `lehky_tyden` a v textovém exportu značkou
`[LEHKÝ TÝDEN]` i s vysvětlením, aby je Claude nečetl jako propad výkonu.

Tlačítkem v pruhu nad tréninkem se dá lehký týden přeskočit, nebo naopak zapnout mimo pořadí,
když jsi třeba půlku cyklu prostonal.

## Nový plán od Clauda

Plán není v kódu, je to záznam v databázi. Měsíční kolečko vypadá takhle:

1. Na konci cyklu v záložce **Data** stáhneš **Rozbor (TXT)**. Končí návodem, v jakém
   tvaru má Claude plán poslat, takže mu stačí předat ten soubor.
2. Claude odpoví JSONem. Ten vložíš do pole **Nový plán od Clauda** nebo nahraješ jako soubor.
3. **Zkontrolovat plán** ukáže náhled: kolik cviků přibylo, kolik odchází, které pracovní
   váhy se přenesou a které určuje plán sám. Když je v JSONu chyba, vypíše se po řádcích
   a nenasadí se nic.
4. **Nasadit plán** ho uloží, přenese váhy a založí nový cyklus.

Tvar plánu:

```json
{
  "format": "trenink-plan/1",
  "name": "Cyklus 3, důraz na tlak nad hlavou",
  "note": "Jedna věta, co je záměr.",
  "order": ["A", "B", "C"],
  "days": {
    "A": {
      "title": "Dřep & bench",
      "ex": [
        { "id": "squat", "name": "Dřep s velkou činkou",
          "sets": 4, "lo": 4, "hi": 6,
          "inc": 2.5, "step": 2.5, "bar": 20, "rest": 210,
          "group": "Nohy", "track": true,
          "cue": "Pokyny ke cviku." }
      ]
    }
  },
  "startWeights": { "A:squat": 100 }
}
```

| Položka | Význam |
|---------|--------|
| `id` | Krátký kód cviku. Když zůstane stejný jako minule, přenese se pracovní váha a naváže historie. |
| `sets`, `lo`, `hi` | Počet pracovních sérií a rozsah opakování. |
| `inc` | O kolik kg přidat, když všechny série vyjdou na horní hranici. |
| `step`, `bar` | Nejmenší přírůstek (kotouč) a váha osy, 0 když se nepoužívá. |
| `rest` | Pauza mezi sériemi v sekundách. |
| `group` | Svalová skupina, podle ní se počítá týdenní objem. |
| `track` | `true` u cviků, které chceš vidět v grafu síly. |
| `startWeights` | Nepovinné. Co nevyplníš, přenese se z minula. |

Staré tréninky zůstávají čitelné. Každý si pamatuje plán, podle kterého se cvičil, takže
cvik zrušený novým plánem se v historii i v exportu pořád jmenuje svým jménem.

## Export pro Clauda

Záložka **Data** → zvol období (výchozí je běžící cyklus), **Tenhle cyklus** nebo **Celá historie**:

- **Rozbor (TXT)** – hotový text s kontextem a otázkami. Nahraj ho do chatu s Claudem nebo použij *Zkopírovat rozbor do schránky*.
- **CSV** – jedna řádka na sérii (`datum, plan, trenink, lehky_tyden, cvik, serie, vaha_kg, opakovani, zasoba_rir, objem_kg, …`). Vhodné, když chceš hlubší analýzu nebo tabulku.
- **JSON** – kompletní záloha, dá se zpět načíst (i ze staré verze deníku, která ukládala do souboru).

Stejné exporty jsou dostupné i přímo na `/api/export.txt`, `/api/export.csv`, `/api/export.json`
(parametry `?from=YYYY-MM-DD&to=YYYY-MM-DD`), po přihlášení.

## Lokální spuštění

```bash
cp .env.example .env      # doplň DATABASE_URL, APP_PASSWORD, SESSION_SECRET
npm install
set -a; . ./.env; set +a
npm start                 # http://localhost:3000
npm test                  # jednotkové testy plánu, cyklu, exportu a přihlášení
```

## Struktura

```
src/server.js     Express server, API, statické soubory
src/db.js         Postgres – tabulky sessions (tréninky), plans (nahrané plány) a kv (váhy, cyklus, rozpracovaný trénink)
src/auth.js       heslo, podepsaná cookie, limit pokusů
src/export.js     TXT / CSV / JSON export
shared/program.js tréninkový program (sdílený s prohlížečem)
shared/cycle.js   čtyřtýdenní cyklus a výpočet lehkého týdne
shared/plan.js    kontrola nahraného plánu, porovnání se stávajícím, přenos vah
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
| POST   | `/api/plan`          | nasadí nahraný plán a založí nový cyklus |
| GET    | `/api/export.{txt,csv,json}` | export, volitelně `from`, `to` |
| GET    | `/api/health`        | kontrola připojení k databázi          |
