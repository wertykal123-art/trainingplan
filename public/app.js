"use strict";
import { PROGRAM, CTX, ORDER } from "/shared/program.js";
import { CYCLE_WEEKS, cycleWeek, isDeloadWeek, cycleEnded, cycleEnd, deloadWeight, deloadSets, todayISO } from "/shared/cycle.js";

const PLATES=[{w:25,c:"#B23A2E"},{w:20,c:"#1B4A8B"},{w:15,c:"#D9A400"},{w:10,c:"#2E7D4F"},{w:5,c:"#F5F4F1"},{w:2.5,c:"#B23A2E"},{w:1.25,c:"#9AA1AE"}];
const LOCAL_KEY="trenink:local";   // záložní kopie v prohlížeči (offline)

/* ============ STAV ============ */
const emptyState=()=>({weights:{},fails:{},sessions:[],draft:null,nextDay:"A",lastBackup:null,created:new Date().toISOString(),cycle:{n:1,start:todayISO()}});
let S=emptyState();
let restT=null, restLeft=0, restTotal=0, restEnd=0;

/* ---- synchronizace se serverem ---- */
const Sync={dirty:false,saving:false,lastSaved:null,online:navigator.onLine,error:null,
  label(){
    if(!this.online) return this.dirty?"offline · změny čekají":"offline";
    if(this.saving) return "ukládám…";
    if(this.error) return "neuloženo · zkusím znovu";
    if(this.dirty) return "neuloženo";
    return this.lastSaved?"uloženo "+new Date(this.lastSaved).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"synchronizováno";
  }};

async function api(path,opts={}){
  const r=await fetch(path,{credentials:"same-origin",headers:{"Content-Type":"application/json"},...opts});
  if(r.status===401){showLogin();throw new Error("unauthorized");}
  if(!r.ok){let m="Chyba serveru";try{m=(await r.json()).error||m;}catch(e){}throw new Error(m);}
  return r.json();
}

function localGet(){try{const t=localStorage.getItem(LOCAL_KEY);return t?JSON.parse(t):null;}catch(e){return null;}}
function localSet(o){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(o));}catch(e){}}

/* sloučení dvou stavů — kdyby ses trefil do stejného deníku ze dvou zařízení */
function merge(a,b){
  const seen=new Set(), all=[...(a.sessions||[]),...(b.sessions||[])]
    .filter(s=>{const k=s.date;if(seen.has(k))return false;seen.add(k);return true;})
    .sort((x,y)=>new Date(x.date)-new Date(y.date));
  const newer=(b.sessions||[]).length>=(a.sessions||[]).length?b:a;
  return Object.assign({},a,b,{sessions:all,weights:newer.weights||{},fails:newer.fails||{},
    draft:a.draft||b.draft,cycle:b.cycle||a.cycle});
}

async function load(){
  const local=localGet();
  try{
    const remote=await api("/api/state");
    // lokální kopie s neodeslanými změnami (offline) → sloučit a poslat
    if(local&&local._dirty){S=Object.assign(emptyState(),merge(remote,local));delete S._dirty;Sync.dirty=true;pushNow();}
    else S=Object.assign(emptyState(),remote);
    Sync.error=null;
  }catch(e){
    if(e.message==="unauthorized") throw e;
    if(local){S=Object.assign(emptyState(),local);delete S._dirty;Sync.error=e.message;toast("Server nedostupný, pracuješ s kopií v telefonu.");}
    else throw e;
  }
  localSet(S);
}

let pushTimer=null;
function save(){
  Sync.dirty=true; localSet(Object.assign({},S,{_dirty:true})); updateSyncLabel();
  clearTimeout(pushTimer); pushTimer=setTimeout(pushNow,900);
}
async function pushNow(){
  clearTimeout(pushTimer);
  if(Sync.saving){pushTimer=setTimeout(pushNow,500);return;}
  if(!navigator.onLine){Sync.online=false;updateSyncLabel();return;}
  Sync.saving=true; updateSyncLabel();
  const snapshot=JSON.stringify(S);
  try{
    const r=await api("/api/state",{method:"PUT",body:snapshot});
    Sync.lastSaved=r.savedAt; Sync.error=null;
    if(JSON.stringify(S)===snapshot){Sync.dirty=false;localSet(S);} // mezitím se nic nezměnilo
  }catch(e){
    if(e.message!=="unauthorized"){Sync.error=e.message;pushTimer=setTimeout(pushNow,5000);}
  }finally{Sync.saving=false;updateSyncLabel();}
}
window.addEventListener("online",()=>{Sync.online=true;updateSyncLabel();if(Sync.dirty)pushNow();});
window.addEventListener("offline",()=>{Sync.online=false;updateSyncLabel();});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){if(Sync.dirty)pushNow();}
  else if(restT){tickRest();}
});
window.addEventListener("beforeunload",()=>{
  if(Sync.dirty&&navigator.sendBeacon){
    try{navigator.sendBeacon("/api/state?beacon=1",new Blob([JSON.stringify(S)],{type:"application/json"}));}catch(e){}
  }
});
function updateSyncLabel(){document.querySelectorAll(".sync").forEach(el=>{el.textContent=Sync.label();el.classList.toggle("warn",!Sync.online||!!Sync.error);});}
function toast(t){const el=document.getElementById("toast");el.textContent=t;el.classList.add("on");clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove("on"),1900);}

/* ============ PŘIHLÁŠENÍ ============ */
function showLogin(){document.getElementById("app").hidden=true;document.getElementById("login").hidden=false;setTimeout(()=>document.getElementById("pw").focus(),50);}
function showApp(){document.getElementById("login").hidden=true;document.getElementById("app").hidden=false;}
document.getElementById("loginForm").onsubmit=async ev=>{
  ev.preventDefault();
  const btn=document.getElementById("loginBtn"), err=document.getElementById("loginErr"), pw=document.getElementById("pw");
  btn.disabled=true; err.textContent="";
  try{
    const r=await fetch("/api/login",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:pw.value})});
    if(!r.ok){err.textContent=(await r.json().catch(()=>({}))).error||"Přihlášení se nepovedlo.";return;}
    pw.value=""; await boot();
  }catch(e){err.textContent="Server neodpovídá.";}
  finally{btn.disabled=false;}
};
async function logout(){
  if(Sync.dirty){await pushNow();if(Sync.dirty&&!confirm("Některé změny nejsou uložené na serveru. Přesto se odhlásit?"))return;}
  try{await fetch("/api/logout",{method:"POST",credentials:"same-origin"});}catch(e){}
  try{localStorage.removeItem(LOCAL_KEY);}catch(e){}
  S=emptyState(); showLogin();
}

/* ============ POMOCNÉ ============ */
const round=(v,st)=>Math.max(0,Math.round(v/st)*st);
const e1rm=(w,r,rir)=>w>0?w*(1+(r+(rir||0))/30):0;
function plateList(total,barW){
  if(!barW||total<=barW) return null;
  let side=(total-barW)/2, out=[];
  for(const p of PLATES){while(side>=p.w-0.001){out.push(p);side-=p.w;}}
  return side>0.02?null:out;
}
function keyOf(day,ex){return day+":"+ex;}
const plural=(n,one,few,many)=>n===1?one:(n>=2&&n<=4?few:many);
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

/* progrese: co dělat příště */
function progress(ex,day,logged){
  const k=keyOf(day,ex.id), cur=S.weights[k]||0;
  const done=logged.filter(s=>s.done);
  if(!done.length) return {w:cur,note:""};
  const minR=Math.min(...done.map(s=>s.reps));
  const avgRir=done.reduce((a,s)=>a+s.rir,0)/done.length;
  const allTop=done.every(s=>s.reps>=ex.hi) && done.length>=ex.sets;
  if(cur<=0) return {w:0,note:""};
  if(allTop && avgRir>=1){S.fails[k]=0;return {w:round(cur+ex.inc,ex.step),note:"+"+ex.inc+" kg"};}
  if(minR<ex.lo){
    S.fails[k]=(S.fails[k]||0)+1;
    if(S.fails[k]>=2){S.fails[k]=0;return {w:round(cur*0.9,ex.step),note:"−10 % (reset)"};}
    return {w:cur,note:"zopakovat"};
  }
  S.fails[k]=0;
  return {w:cur,note:allTop?"stejná (odpočiň si víc)":"stejná (přidej opakování)"};
}

/* ============ TRÉNINK ============ */
function inDeloadWeek(){return !!(S.cycle&&S.cycle.start)&&isDeloadWeek(S.cycle.start);}
function blankEx(day,e,dl){
  const base=S.weights[keyOf(day,e.id)]||0;
  return {id:e.id,w:dl?deloadWeight(base,e.step):base,
    sets:Array.from({length:dl?deloadSets(e.sets):e.sets},()=>({done:false,reps:e.hi,rir:2,w:0}))};
}
function newDraft(day,deload){
  const dl=deload===undefined?inDeloadWeek():!!deload;
  return {day,date:new Date().toISOString(),ctx:{},deload:dl,ex:PROGRAM[day].ex.map(e=>blankEx(day,e,dl))};
}
/* ruční přepnutí lehkého týdne – zapnout i přeskočit */
function toggleDeload(){
  const d=S.draft; if(!d) return;
  const want=!d.deload;
  if(d.ex.some(e=>e.sets.some(s=>s.done))){d.deload=want;save();renderTrain();
    toast(want?"Trénink označen jako lehký.":"Označení lehkého týdne zrušeno.");return;}
  S.draft=newDraft(d.day,want); save(); renderTrain();
  toast(want?"Lehký trénink: nižší váhy a o sérii míň.":"Plný trénink, váhy podle progrese.");
}
function newCycle(){
  if(!confirm("Začít nový cyklus? Historie i pracovní váhy zůstanou. Vynuluje se jen počítadlo týdnů a lehký týden vyjde na poslední týden nového cyklu."))return;
  S.cycle={n:((S.cycle&&S.cycle.n)||1)+1,start:todayISO()};
  S.draft=null; save(); renderAll();
  toast("Cyklus "+S.cycle.n+" začal.");
}
function renderTrain(){
  const v=document.getElementById("view-train");
  if(S.draft&&!PROGRAM[S.draft.day]) S.draft=null;
  const day=S.draft?S.draft.day:(PROGRAM[S.nextDay]?S.nextDay:"A"), p=PROGRAM[day];
  document.getElementById("dayStamp").textContent=day;
  document.getElementById("dayTitle").textContent=p.title;
  document.getElementById("sesCount").textContent=S.sessions.length+" tréninků";
  const wk=cycleWeek(S.cycle.start), over=cycleEnded(S.cycle.start);
  document.getElementById("wkCount").textContent=over?"cyklus skončil":"týden "+wk+"/"+CYCLE_WEEKS;
  v.innerHTML="";

  const pick=document.createElement("div");pick.className="picker";
  ORDER.forEach(d=>{const b=document.createElement("button");b.textContent=d+" · "+PROGRAM[d].title.split(" ")[0];
    b.setAttribute("aria-pressed",d===day);b.onclick=()=>{if(S.draft&&S.draft.ex.some(e=>e.sets.some(s=>s.done))&&d!==day){if(!confirm("Rozdělaný trénink se zahodí. Přepnout?"))return;}
      S.draft=newDraft(d);S.nextDay=d;save();renderTrain();};
    pick.appendChild(b);});
  v.appendChild(pick);

  const sy=document.createElement("div");sy.className="sync";sy.style.margin="-4px 0 8px";sy.textContent=Sync.label();v.appendChild(sy);
  updateSyncLabel();

  if(!S.draft) S.draft=newDraft(day);

  const strip=document.createElement("div");strip.className="cycle";
  strip.innerHTML=`<span>Cyklus ${S.cycle.n} · ${over?"po konci":"týden "+wk+" ze "+CYCLE_WEEKS}${S.draft.deload?" · lehký":""}</span>`;
  const tg=document.createElement("button");tg.textContent=S.draft.deload?"Přeskočit lehký":"Udělat lehký";
  tg.onclick=toggleDeload;strip.appendChild(tg);v.appendChild(strip);

  if(S.draft.deload){
    v.insertAdjacentHTML("beforeend",'<div class="banner"><b>Lehký týden</b>Váhy jsou předvyplněné o 10 % níž a je o sérii míň. Progrese se dnes nepočítá a pracovní váhy zůstanou tam, kde byly. V exportu bude trénink označený, aby ho Claude nebral jako propad.</div>');
  }
  if(over){
    const b=document.createElement("div");b.className="banner";b.style.background="var(--blue)";
    b.innerHTML='<b>Cyklus skončil</b>Vyexportuj data v záložce Data, nahraj je Claudovi pro nový plán a pak tady začni další cyklus.';
    const btn=document.createElement("button");btn.className="bigbtn";btn.style.marginTop="9px";
    btn.textContent="Začít nový cyklus";btn.onclick=newCycle;b.appendChild(btn);v.appendChild(b);
  }

  p.ex.forEach((e,i)=>{
    let d=S.draft.ex[i];
    if(!d||d.id!==e.id){d=blankEx(day,e,!!S.draft.deload);S.draft.ex[i]=d;}
    const card=document.createElement("article");card.className="ex";
    const allDone=d.sets.every(s=>s.done); if(allDone)card.classList.add("done");
    const reps=e.lo===e.hi?e.lo:e.lo+"–"+e.hi;
    card.innerHTML=`<div class="ex-head"><span class="num">${i+1}</span><h3>${e.name}</h3>
      <span class="tag">${d.sets.length} × ${reps}</span></div><div class="ex-body"></div>`;
    const body=card.querySelector(".ex-body");

    const lr=document.createElement("div");lr.className="loadrow";
    lr.innerHTML=`<label class="wfield"><input type="number" step="${e.step}" min="0" value="${d.w||""}" placeholder="—" aria-label="váha"><span>kg</span></label><div class="hint"></div>`;
    const inp=lr.querySelector("input"), hint=lr.querySelector(".hint");
    function drawHint(){
      const last=lastFor(day,e.id);
      let h = d.w>0 ? "" : "<b>První série napoví:</b> zvol váhu, se kterou uděláš horní hranici opakování a zbydou ti 2–3 v zásobě.";
      if(d.w>0 && last) h="Minule: <b>"+last.w+" kg</b> · "+last.reps.join("/")+" op.";
      else if(d.w>0) h="Zapiš, co reálně uzvedneš — váhy na příště dopočítám sám.";
      const pl=plateList(d.w,e.bar);
      hint.innerHTML=h+(pl?`<div class="plates" title="kotouče na jednu stranu"><span class="bar"></span>${pl.map(p=>`<span class="plate" style="background:${p.c};height:${18+p.w*0.9}px"></span>`).join("")}</div>`:"");
    }
    inp.oninput=()=>{d.w=parseFloat(inp.value)||0;drawHint();save();};
    drawHint();body.appendChild(lr);

    const sets=document.createElement("div");sets.className="sets";
    d.sets.forEach((s,j)=>{
      const row=document.createElement("div");row.className="set"+(s.done?" on":"");
      row.innerHTML=`<span class="idx">${j+1}.</span>
        <div class="stepper"><button aria-label="méně">−</button><input type="number" inputmode="numeric" value="${s.reps}" aria-label="opakování"><button aria-label="více">+</button></div>
        <span class="unit">op.</span>
        <div class="rir" role="group" aria-label="zbylá opakování v zásobě">${[0,1,2,3].map(n=>`<button data-r="${n}" aria-pressed="${s.rir===n}">${n===3?"3+":n}</button>`).join("")}</div>
        <button class="log" aria-label="zapsat sérii">✓</button>`;
      const ri=row.querySelector(".stepper input");
      row.querySelectorAll(".stepper button")[0].onclick=()=>{s.reps=Math.max(0,s.reps-1);ri.value=s.reps;save();};
      row.querySelectorAll(".stepper button")[1].onclick=()=>{s.reps=s.reps+1;ri.value=s.reps;save();};
      ri.oninput=()=>{s.reps=parseInt(ri.value)||0;save();};
      row.querySelectorAll(".rir button").forEach(b=>b.onclick=()=>{s.rir=+b.dataset.r;
        row.querySelectorAll(".rir button").forEach(x=>x.setAttribute("aria-pressed",+x.dataset.r===s.rir));save();});
      row.querySelector(".log").onclick=()=>{
        s.done=!s.done; s.w=d.w;
        if(s.done){row.classList.add("on");startRest(e.rest);} else row.classList.remove("on");
        save();
        if(d.sets.every(x=>x.done))card.classList.add("done");else card.classList.remove("done");
      };
      sets.appendChild(row);
    });
    body.appendChild(sets);
    body.insertAdjacentHTML("beforeend",`<p class="cue">${e.cue}</p>`);
    v.appendChild(card);
  });

  if(!S.draft.ctx)S.draft.ctx={};
  const cx=document.createElement("div");cx.className="item";
  cx.innerHTML=`<h3>Posledních 48 hodin</h3><div class="sub">Podle toho se pozná, proč ti některý trénink sedl a jiný ne.</div>
    <div class="picker" style="margin-bottom:0">${CTX.map(c=>`<button data-k="${c.k}" aria-pressed="${!!S.draft.ctx[c.k]}">${c.label}</button>`).join("")}</div>`;
  cx.querySelectorAll(".picker button").forEach(b=>b.onclick=()=>{
    const k=b.dataset.k;S.draft.ctx[k]=!S.draft.ctx[k];b.setAttribute("aria-pressed",!!S.draft.ctx[k]);save();});
  v.appendChild(cx);

  const fin=document.createElement("div");fin.className="row";
  fin.innerHTML=`<button class="bigbtn ghost" id="dropBtn">Zahodit</button><button class="bigbtn" id="finBtn">Uložit trénink</button>`;
  v.appendChild(fin);
  fin.querySelector("#finBtn").onclick=finish;
  fin.querySelector("#dropBtn").onclick=()=>{if(confirm("Zahodit rozdělaný trénink?")){S.draft=null;save();renderTrain();}};
  v.insertAdjacentHTML("beforeend",'<p class="hint" style="margin:6px 0 20px">Zapisuj i série, které se nepovedly — z toho se počítá příští váha. „Zásoba“ = kolik opakování bys ještě zvládl navíc.</p>');
}
function lastFor(day,exId){
  for(let i=S.sessions.length-1;i>=0;i--){const s=S.sessions[i];if(s.day!==day||s.deload)continue;
    const e=s.ex.find(x=>x.id===exId);if(e&&e.sets.length)return {w:e.sets[0].w||e.w,reps:e.sets.map(x=>x.reps)};}
  return null;
}
function finish(){
  const d=S.draft; if(!d) return;
  const day=d.day, prog=PROGRAM[day];
  const logged=d.ex.map(e=>({id:e.id,w:e.w,sets:e.sets.filter(s=>s.done).map(s=>({reps:s.reps,rir:s.rir,w:s.w||e.w}))}))
                   .filter(e=>e.sets.length);
  if(!logged.length){toast("Nemáš zapsanou žádnou sérii.");return;}
  if(!d.deload){
    prog.ex.forEach((e,i)=>{
      const k=keyOf(day,e.id), doneSets=d.ex[i].sets.filter(s=>s.done);
      if(d.ex[i].w>0 && S.weights[k]!==d.ex[i].w) S.weights[k]=d.ex[i].w;
      if(!doneSets.length) return;
      const r=progress(e,day,d.ex[i].sets);
      if(r.w>0) S.weights[k]=r.w;
    });
  }
  S.sessions.push({date:new Date().toISOString(),day,ctx:d.ctx||{},deload:!!d.deload,ex:logged});
  S.nextDay=ORDER[(ORDER.indexOf(day)+1)%3];
  S.draft=null; save(); stopRest();
  toast(d.deload?"Lehký trénink uložen, pracovní váhy zůstávají. Příště: "+S.nextDay:"Uloženo. Příště: trénink "+S.nextDay);
  renderTrain(); renderHistory(); renderStats();
  window.scrollTo({top:0,behavior:"smooth"});
}

/* ============ PAUZA ============ */
function startRest(sec){
  restTotal=sec; restEnd=Date.now()+sec*1000;
  document.getElementById("restbar").classList.add("up");
  clearInterval(restT); tickRest();
  restT=setInterval(tickRest,500);
}
function tickRest(){
  restLeft=Math.round((restEnd-Date.now())/1000);
  const m=Math.floor(Math.max(0,restLeft)/60), s=Math.max(0,restLeft)%60;
  document.getElementById("restnum").textContent=m+":"+String(s).padStart(2,"0");
  document.getElementById("restfill").style.width=(100*Math.max(0,Math.min(1,restLeft/restTotal)))+"%";
  if(restLeft<=0){beep();stopRest();}
}
function stopRest(){clearInterval(restT);restT=null;document.getElementById("restbar").classList.remove("up");}
function beep(){try{const a=new (window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();
  o.connect(g);g.connect(a.destination);o.frequency.value=660;g.gain.setValueAtTime(.001,a.currentTime);
  g.gain.exponentialRampToValueAtTime(.25,a.currentTime+.02);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.5);
  o.start();o.stop(a.currentTime+.55);}catch(e){}}
document.getElementById("restSkip").onclick=stopRest;
document.getElementById("restAdd").onclick=()=>{restEnd+=30000;restTotal+=30;tickRest();};

/* ============ HISTORIE ============ */
function fmt(d){return new Date(d).toLocaleDateString("cs-CZ",{day:"numeric",month:"numeric",year:"2-digit"});}
function nameOf(day,id){const p=PROGRAM[day];const e=p&&p.ex.find(x=>x.id===id);return e?e.name:id;}
function renderHistory(){
  const v=document.getElementById("view-history");
  if(!S.sessions.length){v.innerHTML='<p class="empty">Zatím prázdno. Po prvním uloženém tréninku se sem zapíše všechno, co jsi odcvičil.</p>';return;}
  v.innerHTML="";
  [...S.sessions].reverse().forEach(s=>{
    const vol=s.ex.reduce((a,e)=>a+e.sets.reduce((b,x)=>b+(x.w||0)*x.reps,0),0);
    const el=document.createElement("div");el.className="item";
    el.innerHTML=`<h3>${esc(s.day)} · ${PROGRAM[s.day]?PROGRAM[s.day].title:""}${s.deload?' <span class="flag">lehký</span>':""}</h3>
      <div class="sub">${fmt(s.date)} · objem ${Math.round(vol).toLocaleString("cs-CZ")} kg · ${s.ex.reduce((a,e)=>a+e.sets.length,0)} sérií${
        s.ctx&&Object.keys(s.ctx).some(k=>s.ctx[k])?" · "+CTX.filter(c=>s.ctx[c.k]).map(c=>c.label.toLowerCase()).join(", "):""}</div>
      <table>${s.ex.map(e=>`<tr><td>${esc(nameOf(s.day,e.id))}</td><td>${e.sets.map(x=>(x.w??0)+"×"+x.reps).join(" · ")}</td></tr>`).join("")}</table>
      <div class="row" style="margin:8px 0 0"><button class="bigbtn ghost" style="font-size:15px;padding:8px" data-del="${esc(s.date)}">Smazat trénink</button></div>`;
    el.querySelector("[data-del]").onclick=()=>{if(!confirm("Smazat tenhle trénink z historie? Pracovní váhy zůstanou."))return;
      S.sessions=S.sessions.filter(x=>x.date!==s.date);save();renderHistory();renderStats();renderTrain();toast("Trénink smazán.");};
    v.appendChild(el);
  });
}

/* ============ PROGRES ============ */
function renderStats(){
  const v=document.getElementById("view-stats");
  if(S.sessions.length<2){v.innerHTML='<p class="empty">Graf se objeví po druhém tréninku. Sleduje odhadované maximum na 1 opakování — tedy sílu, ne jen zvednutou váhu.</p>';return;}
  const track=[["A","squat"],["A","bench"],["B","dead"],["B","ohp"]];
  v.innerHTML='<h2 class="sec">Odhad maxima na 1 opakování</h2><p class="hint" style="margin:-4px 0 8px">Lehké týdny se do odhadu nepočítají, aby graf ukazoval sílu a ne plánovaný výpadek.</p>';
  track.forEach(([day,id])=>{
    const name=PROGRAM[day].ex.find(e=>e.id===id).name;
    const pts=[];
    S.sessions.forEach(s=>{if(s.day!==day||s.deload)return;const e=s.ex.find(x=>x.id===id);if(!e)return;
      const best=Math.max(...e.sets.map(x=>e1rm(x.w,x.reps,x.rir)));if(best>0)pts.push({t:s.date,v:best});});
    if(pts.length<2)return;
    const first=pts[0].v,last=pts[pts.length-1].v,d=last-first;
    v.insertAdjacentHTML("beforeend",`<div class="chart"><h3>${name}<span>${Math.round(last)} kg ${d>=0?"▲ +":"▼ "}${Math.round(Math.abs(d))}</span></h3>${spark(pts)}</div>`);
  });
  const weeks={};
  S.sessions.forEach(s=>{const w=Math.floor((new Date(s.date)-new Date(S.sessions[0].date))/6048e5);
    weeks[w]=(weeks[w]||0)+s.ex.reduce((a,e)=>a+e.sets.reduce((b,x)=>b+(x.w||0)*x.reps,0),0);});
  const ks=Object.keys(weeks).map(Number).sort((a,b)=>a-b);
  v.insertAdjacentHTML("beforeend",`<h2 class="sec">Celkový objem po týdnech</h2><div class="chart">${
    spark(ks.map(k=>({t:k,v:weeks[k]})),true)}<p class="hint" style="margin-top:8px">Objem = váha × opakování, sečteno přes celý týden. Roste-li plynule, jsi na dobré cestě; skokový nárůst je nejčastější příčina bolavých kloubů.</p></div>`);
  const rows=[];
  CTX.forEach(c=>{
    const on=[],off=[];
    S.sessions.forEach(s=>{
      const q=s.ex.reduce((a,e)=>a+e.sets.reduce((b,x)=>b+(x.rir||0),0),0)/Math.max(1,s.ex.reduce((a,e)=>a+e.sets.length,0));
      ((s.ctx&&s.ctx[c.k])?on:off).push(q);
    });
    if(on.length>=2&&off.length>=2){
      const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
      const d=avg(on)-avg(off);
      rows.push(`<tr><td>${c.label} předtím <span style="color:var(--steel)">(${on.length}× / ${off.length}×)</span></td><td>${
        d>0.25?"těžší série":d<-0.25?"lehčí série":"beze změny"} · ${d>0?"+":""}${d.toFixed(1)}</td></tr>`);
    }
  });
  if(rows.length) v.insertAdjacentHTML("beforeend",`<h2 class="sec">Jak se to pere se zbytkem života</h2><div class="item"><table>${rows.join("")}</table>
    <p class="hint" style="margin-top:9px">Číslo je rozdíl v průměrné zásobě opakování. Kladné = po téhle aktivitě ti série přijdou těžší. Pár desetin je šum, půl opakování a víc už stojí za úpravu rozvrhu.</p></div>`);
  if(!v.querySelector(".chart"))v.innerHTML='<p class="empty">Zatím málo dat.</p>';
}
function spark(pts,bars){
  const W=300,H=72,pad=6;
  const vs=pts.map(p=>p.v),mn=Math.min(...vs),mx=Math.max(...vs),rg=(mx-mn)||1;
  const x=i=>pad+i*(W-2*pad)/Math.max(1,pts.length-1), y=v=>H-pad-((v-mn)/rg)*(H-2*pad);
  if(bars){const bw=(W-2*pad)/pts.length-3;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img">${pts.map((p,i)=>
      `<rect x="${pad+i*((W-2*pad)/pts.length)}" y="${Math.min(H-pad-2,y(p.v))}" width="${Math.max(4,bw)}" height="${Math.max(2,H-pad-y(p.v))}" fill="#1B4A8B" opacity=".85"/>`).join("")}</svg>`;}
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" preserveAspectRatio="none">
    <polyline fill="none" stroke="#1B4A8B" stroke-width="2" points="${pts.map((p,i)=>x(i)+","+y(p.v)).join(" ")}"/>
    ${pts.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.v)}" r="2.5" fill="#15171C"/>`).join("")}</svg>`;
}

/* ============ PLÁN ============ */
function renderPlan(){
  const v=document.getElementById("view-plan");
  v.innerHTML=`<div class="banner"><b>Jak to funguje</b>Tři tréninky týdně, střídáš A → B → C. Každý cvik má rozsah opakování. Dokud nejsi na horní hranici ve všech sériích, přidáváš opakování; jakmile ji dáš (a zbývají ti aspoň 1–2 v zásobě), deník sám přidá váhu. Dvakrát po sobě pod spodní hranicí = automatický úkrok o 10 % dolů.</div>
  <div class="banner" style="background:var(--blue)"><b>Proč tu chybí shyby</b>Vertikální tah za tebe odvede lezení — kdyby byl i v plánu, sešel by se ti na lokti a rameni objem, který se nestihne zregenerovat. Posilovna tady doplňuje to, co jinde nedostaneš: těžký tlak, nohy pod zátěží a práci proti sezení.</div>
  <div class="banner" style="background:var(--steel)"><b>Když se to nevejde do času</b>Cviky jsou seřazené podle důležitosti. Dochází-li čas nebo síla, škrtej odspoda — poslední dva cviky dne jsou doplňkové. Jediná výjimka: extenzory zápěstí, vnější rotace a face pull nech vždycky, ty tam nejsou kvůli výkonu, ale kvůli loktům a ramenům.</div>`
  + ORDER.map(d=>`<h2 class="sec">Trénink ${d} — ${PROGRAM[d].title}</h2>`+PROGRAM[d].ex.map((e,i)=>
    `<details><summary>${i+1}. ${e.name} <span style="font-size:15px;color:var(--steel)">${e.sets}×${e.lo===e.hi?e.lo:e.lo+"–"+e.hi}</span></summary><p>${e.cue}<br>Pauza mezi sériemi: ${Math.round(e.rest/60*10)/10} min · přírůstek ${e.inc} kg</p></details>`).join("")).join("")
  + `<h2 class="sec">Objem za týden</h2><div class="item"><table id="volTable"></table>
  <p class="hint" style="margin-top:9px">Počítáno z plánu, ne z odcvičeného. K číslu u zad si připočti lezení — proto je tu záměrně níž, než by bylo v běžném plánu.</p></div>`
  + `<h2 class="sec">Rozcvičení (8–10 min, každý trénink)</h2>
  <div class="item"><table>
   <tr><td>Rotoped / veslo, lehce</td><td>4 min</td></tr>
   <tr><td>Otevírání hrudní páteře vleže na boku</td><td>8 op. na stranu</td></tr>
   <tr><td>Hluboký dřep s výdrží + kolébání do stran</td><td>1 min</td></tr>
   <tr><td>Mostíky vleže (glute bridge)</td><td>15 op.</td></tr>
   <tr><td>Kroužení rameny s gumou přes hlavu</td><td>10 op.</td></tr>
   <tr><td>Náběhové série prvního cviku (30 %, 50 %, 70 %)</td><td>3×5</td></tr>
  </table><p class="hint" style="margin-top:9px">Náběhové série do deníku nezapisuj — počítají se jen pracovní série.</p></div>
  <h2 class="sec">Pravidla, která to drží pohromadě</h2>
  <div class="item"><table>
   <tr><td>Nechávej vždy 1–3 opakování v zásobě. Do selhání nejdeš prakticky nikdy.</td><td></td></tr>
   <tr><td>Posilovna radši na dny bez lezení. Když to nejde, lez první — prsty potřebují čerstvost, dřep ne.</td><td></td></tr>
   <tr><td>Běh dávej na dny bez dřepu a mrtvého tahu, nebo aspoň s odstupem 6 h. Delší běhy až po tréninku, nikdy před.</td><td></td></tr>
   <tr><td>Těžké nohy ráno a capoeira večer? Jde to, ale ten den v posilovně nic netlač na maximum.</td><td></td></tr>
   <tr><td>Ostrá bolest nebo bolest v kloubu = konec cviku pro dnešek. Tah ve svalu je v pořádku.</td><td></td></tr>
   <tr><td>Loket po lezení citlivý? Vynech přítahy, extenzory zápěstí nech. Řeší se to týdny, ne dny.</td><td></td></tr>
   <tr><td>Špatně vyspaný? Odcvič polovinu sérií, váhy nech. To pořád vyhrává nad vynecháním.</td><td></td></tr>
   <tr><td>Cyklus má 4 týdny a poslední je lehký: deník sám nabídne −10 % váhy a o sérii míň a pracovní váhy nechá být.</td><td></td></tr>
   <tr><td>Bílkoviny cca 1,6 g na kilo, spánek 7–8 h. Při třech sportech je regenerace limit, ne trénink.</td><td></td></tr>
  </table></div>
  <p class="hint" style="margin-bottom:24px">Plán je stavěný na postupné zatěžování a hodně prostoru na regeneraci. Pokud tě něco dlouhodobě bolí nebo máš zdravotní omezení, probeř to nejdřív s lékařem nebo fyzioterapeutem.</p>`;
  const GROUP={squat:"Nohy",nordic:"Nohy",split:"Nohy",legpress:"Nohy",hip:"Nohy",dead:"Nohy",
    bench:"Prsa",incline:"Prsa",fly:"Prsa",ohp:"Ramena",lat:"Ramena",face:"Ramena",extrot:"Ramena",
    row:"Záda",cablerow:"Záda",chestrow:"Záda",tri:"Paže",triext:"Paže",wrist:"Paže",
    pallof:"Core",deadbug:"Core",abwheel:"Core"};
  const vol={};
  ORDER.forEach(d=>PROGRAM[d].ex.forEach(e=>{const g=GROUP[e.id]||"Ostatní";vol[g]=(vol[g]||0)+e.sets;}));
  const total=Object.values(vol).reduce((a,b)=>a+b,0);
  const t=v.querySelector("#volTable");
  t.innerHTML=Object.entries(vol).sort((a,b)=>b[1]-a[1]).map(([g,n])=>
    `<tr><td>${g}</td><td>${n} sérií</td></tr>`).join("")
    +`<tr><td><b>Celkem</b></td><td><b>${total} sérií</b></td></tr>`;
}

/* ============ DATA ============ */
const isoDay=d=>{const x=new Date(d);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");};
function renderData(){
  const v=document.getElementById("view-data");
  const first=S.sessions.length?S.sessions[0].date:null, last=S.sessions.length?S.sessions[S.sessions.length-1].date:null;
  const cyc=S.cycle, cStart=cyc.start, cEnd=cycleEnd(cStart), wk=cycleWeek(cStart), over=cycleEnded(cStart);
  const inCycle=S.sessions.filter(x=>new Date(x.date)>=new Date(cStart+"T00:00:00"));
  const dl=inCycle.filter(x=>x.deload).length;
  v.innerHTML=`<h2 class="sec">Cyklus</h2>
  <div class="item"><table>
    <tr><td>Běžící cyklus</td><td>č. ${cyc.n} · ${over?"po konci":"týden "+wk+" ze "+CYCLE_WEEKS}</td></tr>
    <tr><td>Od – do</td><td>${fmt(cStart)} – ${fmt(cEnd)}</td></tr>
    <tr><td>Tréninků v cyklu</td><td>${inCycle.length}${dl?" (z toho "+dl+" "+plural(dl,"lehký","lehké","lehkých")+")":""}</td></tr>
    <tr><td>Lehký týden</td><td>${over?"proběhl":(wk===CYCLE_WEEKS?"probíhá":"vyjde na "+CYCLE_WEEKS+". týden")}</td></tr>
  </table>
  <div class="row" style="margin:10px 0 0"><button class="bigbtn${over?"":" ghost"}" id="newCycleBtn">Začít nový cyklus</button></div>
  <p class="hint" style="margin-top:9px">Na konci cyklu vyexportuj data níž, nahraj je Claudovi a s novým plánem klepni sem. Historie i pracovní váhy zůstanou, jen se počítadlo týdnů vrátí na začátek.</p></div>

  <h2 class="sec">Kde leží tvoje data</h2>
  <div class="item"><table>
    <tr><td>Server (Postgres)</td><td><span class="sync">${Sync.label()}</span></td></tr>
    <tr><td>Kopie v tomhle prohlížeči <span style="color:var(--steel)">(pro offline)</span></td><td>ano</td></tr>
    <tr><td>Uloženo tréninků</td><td>${S.sessions.length}${first?" ("+fmt(first)+" – "+fmt(last)+")":""}</td></tr>
  </table></div>

  <h2 class="sec">Export pro rozbor v Claudovi</h2>
  <div class="item">
    <div class="range"><label>Od <input type="date" id="expFrom" value="${cStart}"></label><label>Do <input type="date" id="expTo" value="${isoDay(new Date())}"></label></div>
    <div class="row" style="margin:6px 0 0"><button class="bigbtn ghost" style="font-size:15px;padding:8px" id="expCycle">Tenhle cyklus</button><button class="bigbtn ghost" style="font-size:15px;padding:8px" id="expAll">Celá historie</button></div>
    <div class="row" style="margin:10px 0 6px"><a class="bigbtn linkbtn" id="dlTxt" href="#">Rozbor (TXT)</a><a class="bigbtn ghost linkbtn" id="dlCsv" href="#">CSV</a><a class="bigbtn ghost linkbtn" id="dlJson" href="#">JSON</a></div>
    <div class="row" style="margin:0"><button class="bigbtn ghost" id="expC">Zkopírovat rozbor do schránky</button></div>
    <p class="hint" style="margin-top:9px">Výchozí rozsah je běžící cyklus. TXT je připravený text s otázkami pro Clauda, stačí ho nahrát nebo vložit do chatu; nese číslo cyklu, pracovní váhy i označení lehkých tréninků. CSV má jednu řádku na sérii včetně sloupce <b>lehky_tyden</b>. JSON je kompletní záloha, dá se zpět načíst.</p>
  </div>
  <textarea id="io" placeholder="Sem se vypíše rozbor pro Clauda. Můžeš sem taky vložit obsah zálohy (JSON) a načíst ji tlačítkem níž."></textarea>

  <h2 class="sec">Záloha a obnova</h2>
  <div class="row"><button class="bigbtn ghost" id="impF">Načíst ze souboru</button><button class="bigbtn ghost" id="imp">Načíst z textu</button></div>
  <input type="file" id="fileIn" accept=".json,application/json" hidden>
  <p class="hint">Načtení zálohy data slučuje, nepřepisuje — tréninky se stejným datem se nezdvojí. Funguje i pro JSON ze staré verze deníku (soubor trenink-*.json).</p>

  <h2 class="sec">Účet</h2>
  <div class="row"><button class="bigbtn ghost" id="logoutBtn">Odhlásit</button><button class="bigbtn ghost" id="rst" style="border-color:var(--red);color:var(--red)">Smazat vše</button></div>
  <p class="hint" style="margin-bottom:24px" id="installHint"></p>`;

  const io=v.querySelector("#io"), from=v.querySelector("#expFrom"), to=v.querySelector("#expTo");
  const links=()=>{
    const q=new URLSearchParams();if(from.value)q.set("from",from.value);if(to.value)q.set("to",to.value);
    const qs=q.toString()?"?"+q.toString():"";
    v.querySelector("#dlTxt").href="/api/export.txt"+qs+(qs?"&":"?")+"download=1";
    v.querySelector("#dlCsv").href="/api/export.csv"+qs;
    v.querySelector("#dlJson").href="/api/export.json"+qs;
  };
  from.onchange=to.onchange=links; links();
  v.querySelector("#expAll").onclick=()=>{from.value="";to.value="";links();toast("Export zahrne celou historii.");};
  v.querySelector("#expCycle").onclick=()=>{from.value=cStart;to.value=isoDay(new Date());links();toast("Export zahrne běžící cyklus.");};
  v.querySelector("#newCycleBtn").onclick=newCycle;
  v.querySelector("#expC").onclick=async()=>{
    try{
      const q=new URLSearchParams();if(from.value)q.set("from",from.value);if(to.value)q.set("to",to.value);
      const r=await fetch("/api/export.txt?"+q.toString(),{credentials:"same-origin"});
      if(!r.ok)throw 0;const t=await r.text();io.value=t;io.select();
      try{await navigator.clipboard.writeText(t);toast("Zkopírováno — vlož to Claudovi do chatu.");}catch(e){toast("Označeno, zkopíruj ručně.");}
    }catch(e){toast("Export se nepovedl (jsi offline?).");}
  };
  const importObj=o=>{
    if(!o||!Array.isArray(o.sessions))throw 0;
    S=Object.assign(emptyState(),merge(S,o));save();toast("Záloha sloučena.");renderAll();
  };
  v.querySelector("#impF").onclick=()=>v.querySelector("#fileIn").click();
  v.querySelector("#fileIn").onchange=async ev=>{const f=ev.target.files[0];if(!f)return;
    try{importObj(JSON.parse(await f.text()));}catch(e){toast("Tohle není platná záloha.");}};
  v.querySelector("#imp").onclick=()=>{try{importObj(JSON.parse(io.value));}catch(e){toast("Tohle není platná záloha.");}};
  v.querySelector("#rst").onclick=()=>{if(confirm("Opravdu smazat celou historii i váhy? Ze serveru i z telefonu.")){
    S=emptyState();save();renderAll();toast("Smazáno.");}};
  v.querySelector("#logoutBtn").onclick=logout;
  const standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone;
  v.querySelector("#installHint").textContent=standalone?"Běží jako nainstalovaná aplikace.":"Tip: v prohlížeči zvol „Přidat na plochu“ — deník se pak otevírá jako aplikace a načte se i bez signálu.";
  updateSyncLabel();
}

/* ============ ROUTER ============ */
function renderAll(){renderTrain();renderHistory();renderStats();renderPlan();renderData();}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("nav button").forEach(x=>x.setAttribute("aria-selected",x===b));
  ["train","history","stats","plan","data"].forEach(n=>document.getElementById("view-"+n).hidden=(n!==b.dataset.view));
  if(b.dataset.view==="data")renderData();
  window.scrollTo({top:0});
});

async function boot(){
  try{await load();}
  catch(e){if(e.message==="unauthorized")return; toast("Nepodařilo se načíst data: "+e.message);return;}
  if(!S.cycle||!S.cycle.start){S.cycle={n:1,start:todayISO()};save();}
  showApp(); renderAll();
}
(async()=>{
  if("serviceWorker" in navigator){try{await navigator.serviceWorker.register("/sw.js");}catch(e){}}
  let authed=false;
  try{authed=(await (await fetch("/api/me",{credentials:"same-origin"})).json()).authed;}
  catch(e){ // server nedostupný – když je cookie a lokální kopie, zkus offline režim
    if(localGet()){await boot();return;}
  }
  if(authed) await boot(); else showLogin();
})();
