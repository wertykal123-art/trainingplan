/* Tréninkový program – sdílené mezi prohlížečem a serverem (export). */
export const PROGRAM = {
  A:{title:"Dřep & bench", ex:[
    {id:"squat", name:"Dřep s velkou činkou", sets:4, lo:4, hi:6, inc:2.5, step:2.5, bar:20, rest:210,
     cue:"Těžký, ale ne na doraz — pořád 2 opakování v zásobě. Kolena ven, hrudník nahoru. Náběh: 3 lehčí série. Nízká opakování schválně: sílu chceš, unavené nohy na večerní capoeiru ne."},
    {id:"bench", name:"Bench press", sets:4, lo:5, hi:8, inc:2.5, step:2.5, bar:20, rest:150,
     cue:"Lopatky stažené k sobě a dolů, tyč k dolní části hrudníku. V kleci s pojistkami nebo s dopomocí."},
    {id:"row", name:"Přítah jednoručky v předklonu", sets:3, lo:8, hi:12, inc:2, step:1, bar:0, rest:90,
     cue:"Váha = jedna jednoručka. Jediný těžší tah v tomhle dni — horizontální, protože ten ti sezení i lezení bere. Loktem k pasu, bez švihu."},
    {id:"nordic", name:"Zakopávání / nordic curl", sets:3, lo:6, hi:10, inc:2.5, step:2.5, bar:0, rest:90,
     cue:"Excentrická síla hamstringů = pojistka proti nataženému stehnu při vysokém kopu. Spouštěj se pomalu, 3 s dolů. U nordic curlu zapiš váhu 0."},
    {id:"tri", name:"Tricepsové stahování kladky", sets:3, lo:10, hi:12, inc:2.5, step:2.5, bar:0, rest:75,
     cue:"Lokty u těla, plný rozsah. Silný triceps drží zámek na benchi i na tlaku nad hlavou."},
    {id:"face", name:"Face pull", sets:2, lo:12, hi:15, inc:2.5, step:1.25, bar:0, rest:60,
     cue:"Lehce, tah k obličeji, lokty vysoko, nahoře krátká výdrž. Tohle není doplněk — je to protiváha k celodennímu sezení u kódu."},
    {id:"pallof", name:"Pallof press", sets:3, lo:10, hi:12, inc:2.5, step:1.25, bar:0, rest:60,
     cue:"Antirotace — bráníš se otočení trupu. Přenos do capoeiry je přímý: ginga i kopy stojí na tom, že trup nepovolí, když se tělo točí. Opakování na obě strany."}
  ]},
  B:{title:"Mrtvý tah & tlak nad hlavu", ex:[
    {id:"dead", name:"Mrtvý tah (trhačky / trap bar)", sets:3, lo:3, hi:5, inc:5, step:2.5, bar:20, rest:210,
     cue:"Zůstávají tři série schválně — tenhle cvik stojí nejvíc regenerace ze všech. Trhačky nebo trap bar, ať neutahneš prsty den před lezením."},
    {id:"ohp", name:"Tlak nad hlavu ve stoji", sets:4, lo:5, hi:8, inc:2.5, step:1.25, bar:20, rest:150,
     cue:"Nejcennější cvik plánu pro rameno lezce. Hýždě a břicho zpevněné, žebra dolů, žádný záklon. Nahoře hlava lehce protlačí pod činku."},
    {id:"cablerow", name:"Přítah kladky vsedě", sets:4, lo:10, hi:12, inc:2.5, step:2.5, bar:0, rest:90,
     cue:"Trup vzpřímený, lopatky nejdřív dozadu, pak táhnou paže. Když máš loket po lezení podrážděný, uber váhu a přidej opakování."},
    {id:"split", name:"Bulharský výpad", sets:3, lo:8, hi:10, inc:2, step:1, bar:0, rest:90,
     cue:"Váha = jedna jednoručka (držíš dvě). Opakování na jednu nohu. Stabilita v jedné noze se do capoeiry přenáší líp než cokoli obounohého."},
    {id:"lat", name:"Upažování s jednoručkami", sets:3, lo:12, hi:15, inc:1, step:0.5, bar:0, rest:60,
     cue:"Váha = jedna jednoručka. Střední hlava deltu, kterou tlaky samy o sobě nezasáhnou. Lehce, bez švihu, do vodorovné."},
    {id:"extrot", name:"Vnější rotace (kladka / guma)", sets:2, lo:12, hi:15, inc:1.25, step:1.25, bar:0, rest:60,
     cue:"Loket u těla, předloktí ven. Směšně lehká váha je správně. Rotátorová manžeta se posiluje opakováním, ne zátěží."},
    {id:"deadbug", name:"Mrtvý brouk (dead bug)", sets:3, lo:10, hi:12, inc:1.25, step:1.25, bar:0, rest:45,
     cue:"Antiextenze — bedra přitisknutá k zemi po celou dobu, protilehlá ruka a noha pomalu dolů. Bez váhy zapiš 0. Přesně ta stabilita, kterou po mrtvém tahu potřebuješ; navíc učí trup držet, když se hýbou končetiny."}
  ]},
  C:{title:"Tlak, hýždě & core", ex:[
    {id:"incline", name:"Šikmý tlak s jednoručkami", sets:4, lo:8, hi:12, inc:2, step:1, bar:0, rest:120,
     cue:"Váha = jedna jednoručka. Lavice 30°, lokty asi 45° od těla. Tenhle den začíná vrškem schválně — máš na něj nejvíc síly."},
    {id:"fly", name:"Rozpažky na kladce / peck deck", sets:3, lo:12, hi:15, inc:2.5, step:2.5, bar:0, rest:75,
     cue:"Prsa v protažení, které tlaky nedají — dole nech hrudník otevřít, nahoře nedotahuj do konce. Lehce, plynule, žádné škubání."},
    {id:"chestrow", name:"Přítah v podporu na lavici", sets:3, lo:10, hi:12, inc:2, step:1, bar:0, rest:90,
     cue:"Hrudník opřený o šikmou lavici — záda pracují bez zapojení beder, která už mají dost z mrtvého tahu."},
    {id:"legpress", name:"Leg press", sets:4, lo:10, hi:12, inc:5, step:5, bar:0, rest:120,
     cue:"Objem na nohy bez zátěže na páteř — tenhle den má nechat sílu na venek. Záda u opěrky, kolena nezavírat dovnitř."},
    {id:"hip", name:"Hip thrust", sets:4, lo:8, hi:12, inc:5, step:2.5, bar:20, rest:120,
     cue:"Nahoře stáhnout hýždě a 1 s výdrž, brada k hrudníku. Silné hýždě drží pánev při kopech i při vysokém kroku na stěně."},
    {id:"abwheel", name:"Ab wheel / kladka v kleku", sets:3, lo:8, hi:12, inc:2.5, step:2.5, bar:0, rest:75,
     cue:"Nejtěžší antiextenze, jakou můžeš dělat. Bedra se nesmí prohnout — radši kratší rozsah než prohnutá záda. U ab wheelu zapiš váhu 0."},
    {id:"triext", name:"Triceps nad hlavu (kladka / jednoručka)", sets:2, lo:10, hi:12, inc:2.5, step:1.25, bar:0, rest:60,
     cue:"Dlouhá hlava tricepsu v protažení — jiný podnět než stahování kladky v A. Lokty u hlavy, ať práci nepřebírají ramena."},
    {id:"wrist", name:"Extenzory zápěstí", sets:2, lo:15, hi:20, inc:1.25, step:1.25, bar:0, rest:60,
     cue:"Zvedání zápěstí nadhmatem, hodně lehce. Prevence lezeckého lokte — trénuješ opačné svaly, než na které tahá stěna. Poslední cvik dne, ale ten, který tě udrží zdravého."}
  ]}
};
export const CTX = [{k:"climb",label:"Lezení"},{k:"capo",label:"Capoeira"},{k:"tired",label:"Nevyspalý"}];
export const ORDER = ["A","B","C"];

export function exerciseName(day, id) {
  const d = PROGRAM[day];
  const e = d && d.ex.find((x) => x.id === id);
  return e ? e.name : id;
}
