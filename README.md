# Tréninkový deník (PWA)

Osobní tréninkový deník pro full-body program A/B/C. Běží jako webová aplikace,
kterou si přidáš na plochu telefonu, data se ukládají do Postgres a jedním
klepnutím vyexportuješ historii pro rozbor v Claudovi.

- **Cyklus** – čtyři týdny, poslední je lehký (deload). Na konci vyexportuješ data, Claude napíše nový plán a ty ho nahraješ.
- **Plán jako data** – cviky, série, přírůstky i pokyny jdou nahrát jako JSON. Kód se kvůli novému plánu nemění.
- **Trénink** – zápis sérií (váha × opakování × zásoba), pauzy, automatická progrese vah
- **Historie / Progres** – odcvičené tréninky a devět pohledů na to, jak trénink jde
- **Plán** – celý program s pokyny ke cvikům
- **Data** – nastavení, export TXT (rozbor pro Clauda), CSV (řádek na sérii), JSON (záloha), import zálohy
- **Vážení** – nepovinné, zapíná se v nastavení. Váha před tréninkem, v Progresu graf s klouzavým průměrem
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

## Co ukazuje Progres

| Oddíl | Na co odpovídá |
|-------|----------------|
| Souhrn cyklu | Jak jde tenhle cyklus proti předchozím čtyřem týdnům. Protože cyklus zatím běží, srovnává se tempo na týden, ne součty. |
| Odhad maxima | Vývoj síly u sledovaných cviků, včetně tempa v kg za týden a počtu měření. |
| Co se hýbe a co stojí | Každý cvik se stavem *roste / drží / stagnuje / couvá*. Stagnace = tři a víc tréninků bez přidání váhy i opakování. |
| Objem po týdnech | Náběh zátěže a upozornění na skok přes třetinu. |
| Série podle svalových skupin | Kolik sérií týdně padne na kterou skupinu, s ryskou předchozího období. |
| Zásoba a únava | Vývoj průměrné zásoby opakování a slovní výklad, jestli přituhuje. |
| Co ti bere lezení a capoeira | Srovnání zásoby podle toho, co bylo v posledních 48 hodinách. |
| Docházka | Obvyklá mezera mezi tréninky, nejdelší pauza, rozložení po dnech. |
| Tělesná váha | Jen se zapnutým vážením. Klouzavý průměr za 14 dní, tempo v kg za týden a výklad spolu se silou. |
| Osobní rekordy | Nejlepší odhad maxima u sledovaných cviků a jak je starý. |

Statistiky jsou schválně opatrné:

- Lehké týdny se nepočítají do síly, rekordů ani do trendu zásoby. Do objemu a docházky ano.
- U každého srovnání je vidět, z kolika tréninků vzniklo.
- Rozdíl mezi skupinami (třeba „po lezení“ proti „bez lezení“) se vysloví, teprve když
  přesáhne kolísání mezi tréninky, a k tomu jsou potřeba aspoň čtyři tréninky na každé straně.
  Jinak tam stojí „zatím málo dat“ nebo „nerozeznatelné od běžného kolísání“.
- Grafy mají jednu barvu na řadu, hodnoty jdou přečíst i v přiložené tabulce a stavy
  mají vždy slovo, ne jen barvu.

Stejný souhrn jde i do textového exportu, takže Claude dostane hotové signály
(co stagnuje, jaké je tempo síly, co dělá lezení) a nemusí je dopočítávat.

## Vážení před tréninkem

Vypnuté. Zapíná se v záložce **Data → Nastavení**, protože má smysl jen tehdy,
když se vážíš pokaždé za podobných podmínek.

Jednotlivé vážení kolísá o kilo až dvě podle vody, glykogenu a obsahu střev,
zatímco skutečná změna je nanejvýš půl kila za týden. Deník proto nikde
neukazuje holé číslo jako novinku:

- Graf kreslí jednotlivá vážení jako světlé body a klouzavý průměr za 14 dní jako čáru. Čte se čára.
- Tempo v kg za týden se vysloví od osmi vážení rozložených aspoň do dvou týdnů. Pod tím napíše, že je málo dat.
- Deník si hlídá hodinu tréninků. Když se rozcházejí nebo se systematicky posouvají, upozorní, že trend ohýbá rozvrh, ne tělo, a doporučí vážit se ráno po probuzení.
- Odskok od vlastního průměru po lezení nebo capoeiře se počítá z odchylky, ne z absolutní váhy, takže do něj nemluví dlouhodobý trend.
- Váha se vykládá společně se silou. Samotné číslo nerozliší sval od tuku, dvojice váha a odhad maxima ano.

Vypnutí přepínače jen schová pole a graf. Zapsaná vážení zůstávají v databázi i v exportu.

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
npm test                  # jednotkové testy statistik, plánu, cyklu, exportu a přihlášení
```

## Struktura

```
src/server.js     Express server, API, statické soubory
src/db.js         Postgres – tabulky sessions (tréninky, tělesná váha), plans (nahrané plány) a kv (váhy, cyklus, nastavení)
src/auth.js       heslo, podepsaná cookie, limit pokusů
src/export.js     TXT / CSV / JSON export
shared/program.js tréninkový program (sdílený s prohlížečem)
shared/cycle.js   čtyřtýdenní cyklus a výpočet lehkého týdne
shared/plan.js    kontrola nahraného plánu, porovnání se stávajícím, přenos vah
shared/stats.js   výpočty pro Progres a pro souhrn v exportu
public/charts.js  malé SVG grafy (čára, sloupce, vodorovné pruhy, bublina s hodnotou)
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
