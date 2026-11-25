// Onderdeel van de planning-app (uit planning-app.tsx gehaald om het overzichtelijk te houden).
import { createContext, useContext, lazy } from "react";
import { X, Filter, AlertTriangle } from "lucide-react";
import { DEFAULT_PL_NAMEN, normPlAliases } from "@/lib/projectleiders";
import { feestdagenTussen, feestdagOp } from "@/lib/feestdagen";
import { toDateStr, shiftDate, weekdayIdx, isWeekendStr, addWorkdays, workdayDiff, shiftPlanRows, schuifVolgendeOp } from "@/lib/werkdagen";
import { createProjectIndex } from "@/lib/project-index";

export const GebruikersbeheerView = lazy(() => import("@/components/gebruikersbeheer-view"));
export const TakenTab=lazy(()=>import("@/components/taken-tab").then(m=>({default:m.TakenTab})));

// ===== TYPES =====
export type Nav = "dashboard"|"projecten"|"agenda"|"personeelsplanning"|"uren"|"medewerkers"|"notities"|"facturatie"|"instellingen"|"geschiedenis"|"gebruikers";
export type Afdeling = "Stoffering"|"Schilderwerk"|"Zonwering";
export type ProjectStatus = "Offerte"|"Bevestigd"|"In uitvoering"|"Afgerond"|"Gefactureerd";
export type AvailStatus = "Beschikbaar"|"Ingepland"|"Bezet"|"Gereserveerd"|"Niet beschikbaar"|"Vakantie"|"Ziek"|"Vrij";
export type Functie = "Stoffeerder"|"Schilder"|"Monteur zonwering"|"Allround"|"Projectleider";
export type CalView = "month"|"week"|"day"|"kwartaal";

export interface Project {
  id:string; werknummer:string; projectnr?:string; projectnaam:string; opdrachtgever:string;
  adres?:string; plaats:string; afdeling:Afdeling;
  afdelingen?:Afdeling[];
  projectleider:string;
  startdatum:string; afloopdatum:string;
  /** Extra kolommen uit het Excel-importbestand */
  calculatiecode?:string; vestiging?:string; straatObject?:string; plaatsObject?:string; opmerkingen?:string; ar?:string; statusExcel?:string;
  medewerkers:string[]; status:ProjectStatus; notities:string;
  uurprijs:number; uren:number; region?:string; benodigdeMedewerkers?:number; teamKleur?:string;
  /** Eigen aanpassingen aan het werkplan (werkbon schilder), bovenop wat de app zelf invult */
  werkplan?:Record<string,unknown>;
  /** Alleen voor agendablokken: dit project staat die dag als eerste uit te voeren. */
  eersteVanDag?:boolean;
}
// ===== CENTRALE PROJECTINDEX =====
// Eén gedeelde index voor de hele app: O(1) lookups op id/werknummer en een vooraf
// opgebouwde zoekindex. Componenten krijgen nooit de volledige projectenlijst als prop.
export const projectIndex=createProjectIndex<Project>();
export const getIndexedProject=(id?:string|null):Project|undefined=>projectIndex.getProjectById(id);
/** Werknummer is geen unieke sleutel: O(1) lookup die 0, 1 of meerdere werken oplevert. */
export const getIndexedProjectsByWerknummer=(wn:string):Project[]=>projectIndex.getProjectsByWerknummer(String(wn).trim());
/** Zoeken via de vooraf opgebouwde zoekindex; stopt zodra `limit` treffers gevonden zijn. */
export function searchIndexedProjects(q:string,limit=20):Project[]{
  const s=q.trim().toLowerCase();
  if(!s)return [];
  const out:Project[]=[];
  for(const id of projectIndex.getOrder()){
    if(!projectIndex.getProjectSearchText(id).includes(s))continue;
    const p=projectIndex.getProjectById(id);
    if(p)out.push(p);
    if(out.length>=limit)break;
  }
  return out;
}
export interface Employee {
  id:string; naam:string; functie:Functie; afdeling:Afdeling;
  telefoon:string; email:string; competenties:string[];
  /** Contracturen per week (voor de urenweekstaat), standaard 40 */
  contractUren?:number;
}
export interface AvailEntry { id:string; employeeId:string; date:string; startTime:string; endTime:string; status:AvailStatus; note?:string; projectId?:string; periodeId?:string; volgorde?:number; teamId?:string; reeksId?:string; isFirstOfDay?:boolean;
  isSeriesException?:boolean; serieType?:"vastevrij"; serieWeekdays?:number[]; serieStartDate?:string; serieEndDate?:string; vasteVrijExceptionIds?:string[]; }
export interface FixedFreeSeries { periodeId:string; employeeId:string; serieWeekdays:number[]; serieStartDate:string; serieEndDate:string; }
// Standaard werkdag: 07:00 – 17:00 (gebruikt als begin- en eindtijd bij inplannen, afwezigheid en nieuwe werken)
// Standaard werkdag voor alle afdelingen: 07:00–17:00. Aan te passen in Instellingen
// (settings.werkdagStart / werkdagEind); per planning ook zelf in te stellen in het inplanvenster.
export let WORKDAY_START="07:00";
export let WORKDAY_END="17:00";
export const geldigeTijd=(t?:string)=>!!t&&/^\d{2}:\d{2}$/.test(t);
export function setWerkdag(start?:string,end?:string){
  WORKDAY_START=geldigeTijd(start)?start!:"07:00";
  WORKDAY_END=geldigeTijd(end)&&end!>WORKDAY_START?end!:"17:00";
}
export function defaultStartFor(_p?:Project|null):string{return WORKDAY_START;}
export const toMin=(t:string)=>{const [h,m]=t.split(":").map(Number);return (h||0)*60+(m||0);};
export const fromMin=(v:number)=>`${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}`;
export interface AppSettings {
  bedrijfsnaam:string; adres:string; postcode:string; plaats:string;
  telefoon:string; email:string; primaryColor:string; accentColor:string;
  deptColors:Record<Afdeling,{bg:string;light:string;border:string}>;
  planFilters?:PlanFilter[];
  teamColors?:Record<string,string>;
  statusColors?:Record<string,string>;
  projectColors?:Record<string,string>;
  /** Kleur per projectleider (sleutel = naam zoals getoond), gebruikt bij Schilderwerk-blokken */
  projectleiderColors?:Record<string,string>;
  /** Standaard werkdag bij nieuwe planning, bijv. "07:00" en "17:00" */
  werkdagStart?:string; werkdagEind?:string;
  /** Afkorting projectleider (bijv. "RV") → volledige naam; aanvulling op de standaardlijst */
  projectleiderNamen?:Record<string,string>;
  borderColors?:Record<string,string>;
  badgeColors?:Record<string,string>;
  holidayColor?:string;
  fixedFreeSeries?:FixedFreeSeries[];
  employeePlanningOrder?:string[];
  /** Werkbon mailen bij inplannen: uit (standaard), eerst vragen, of automatisch */
  werkbonMail?:"uit"|"vragen"|"automatisch";
  /** Werkbon alleen voor medewerkers van Schilderwerk (standaard aan) */
  werkbonAlleenSchilders?:boolean;
}

// Centrale sortering van medewerkers volgens de handmatig gekozen planningvolgorde.
// Onbekende/verwijderde ID's worden genegeerd; nieuwe medewerkers komen onderaan.
export function sortEmployeesByPlanningOrder<T extends {id:string}>(list:T[],order:string[]):T[]{
  const byId=new Map(list.map(e=>[e.id,e]));
  const out:T[]=[];const used=new Set<string>();
  (order||[]).forEach(id=>{const e=byId.get(id);if(e&&!used.has(id)){out.push(e);used.add(id);}});
  list.forEach(e=>{if(!used.has(e.id))out.push(e);});
  return out;
}

// ===== DEPT COLOR CONTEXT =====
export const DEFAULT_DC:Record<Afdeling,{bg:string;light:string;border:string}> = {
  Stoffering:  {bg:"#26A69A",light:"#DDF2EF",border:"#26A69A"},
  Schilderwerk:{bg:"#EF6A50",light:"#FDE5DF",border:"#EF6A50"},
  Zonwering:   {bg:"#F2A43A",light:"#FDEFD8",border:"#F2A43A"},
};
export const DC = DEFAULT_DC;
// Oude felle standaardkleuren (in eerder opgeslagen instellingen) omzetten naar de zachte tinten.
// Zelf gekozen kleuren blijven ongemoeid.
export const OUDE_AFD_KLEUR:Record<string,string>=Object.fromEntries(([
    [["#0ABFB8","#4E8C80","#67AC9F"],"#26A69A"],[["#E0F7F6","#E3EFEA","#E6F2EE"],"#DDF2EF"],
    [["#FF6B5B","#C2604D","#DA7B63"],"#EF6A50"],[["#FFE8E5","#F5E1DC","#F8E6E0"],"#FDE5DF"],
    [["#F5A623","#B07A2A","#D9A04A"],"#F2A43A"],[["#FEF0D3","#F6EAD3","#F8EDD8"],"#FDEFD8"],
  ] as [string[],string][]).flatMap(([oud,nieuw])=>oud.map(o=>[o,nieuw])));
export const zacht=(k?:string)=>k?OUDE_AFD_KLEUR[k.toUpperCase()]??k:k;
export function verzachtOudeKleuren(s:AppSettings):AppSettings{
  const dc={...s.deptColors};
  (Object.keys(dc) as Afdeling[]).forEach(a=>{const x=dc[a];if(x)dc[a]={bg:zacht(x.bg)!,light:zacht(x.light)!,border:zacht(x.border)!};});
  return {...s,deptColors:dc,...(s.planFilters?{planFilters:s.planFilters.map(p=>({...p,kleur:zacht(p.kleur)!}))}:{})};
}
export const DeptColorCtx = createContext<Record<Afdeling,{bg:string;light:string;border:string}>>(DEFAULT_DC);
export function useDC(){return useContext(DeptColorCtx);}

export const INIT_SETTINGS:AppSettings = {
  bedrijfsnaam:"PlanPro BV",adres:"Industrieweg 14",postcode:"1234 AB",
  plaats:"Amsterdam",telefoon:"020-1234567",email:"info@planpro.nl",
  primaryColor:"#23272F",accentColor:"#4E8C80",
  deptColors:DEFAULT_DC,
};

// ===== CONSTANTS =====
export const SB:Record<ProjectStatus,string> = {
  Offerte:"bg-[#ECEFF4] text-[#475569]",
  Bevestigd:"bg-[#DCE6FA] text-[#1E3A7B]",
  "In uitvoering":"bg-[#D9F4E5] text-[#16774A]",
  Afgerond:"bg-[#ECE9F8] text-[#4B3FA0]",
  Gefactureerd:"bg-[#FDEBC8] text-[#8A5300]",
};
export const AS:Record<AvailStatus,{bg:string;text:string;dot:string}> = {
  Beschikbaar:        {bg:"#D9F4E5",text:"#16774A",dot:"#22A06B"},
  Ingepland:          {bg:"#DCE6FA",text:"#1E3A7B",dot:"#3B6FD8"},
  Bezet:              {bg:"#FCE1DC",text:"#A42A1E",dot:"#E0402F"},
  // Gereserveerd: medewerker vastgehouden (met omschrijving); blokkeert inplannen niet
  Gereserveerd:       {bg:"#FDEFD3",text:"#8A5300",dot:"#F2A43A"},
  "Niet beschikbaar": {bg:"#FBDDDF",text:"#9B1C26",dot:"#D9363E"},
  Vakantie:           {bg:"#ECE6FC",text:"#5134A6",dot:"#8B6CD9"},
  Ziek:               {bg:"#ECEFF4",text:"#3F4A5A",dot:"#7A8699"},
  Vrij:               {bg:"#F1F3F6",text:"#3F4A5A",dot:"#A3ACBA"},
};
// Feestdagen worden per jaar berekend (src/lib/feestdagen.ts); deze lijst dekt een ruime periode rond vandaag.
export const DUTCH_HOL = feestdagenTussen(new Date().getFullYear()-3,new Date().getFullYear()+15);
export interface SHol {start:string;end:string;name:string;regions:string[];}
export const SCHOOL_HOL:SHol[] = [
  {start:"2025-10-18",end:"2025-10-26",name:"Herfstvakantie",regions:["Noord","Midden","Zuid"]},
  {start:"2025-12-22",end:"2026-01-04",name:"Kerstvakantie",regions:["Noord","Midden","Zuid"]},
  {start:"2026-02-14",end:"2026-02-22",name:"Voorjaarsvakantie",regions:["Noord"]},
  {start:"2026-02-21",end:"2026-03-01",name:"Voorjaarsvakantie",regions:["Midden"]},
  {start:"2026-02-28",end:"2026-03-08",name:"Voorjaarsvakantie",regions:["Zuid"]},
  {start:"2026-04-25",end:"2026-05-10",name:"Meivakantie",regions:["Noord","Midden","Zuid"]},
  {start:"2026-07-11",end:"2026-08-23",name:"Zomervakantie",regions:["Noord"]},
  {start:"2026-07-04",end:"2026-08-16",name:"Zomervakantie",regions:["Midden","Zuid"]},
  // Schooljaar 2026-2027 (officiële data Rijksoverheid)
  {start:"2026-10-10",end:"2026-10-18",name:"Herfstvakantie",regions:["Noord"]},
  {start:"2026-10-17",end:"2026-10-25",name:"Herfstvakantie",regions:["Midden","Zuid"]},
  {start:"2026-12-19",end:"2027-01-03",name:"Kerstvakantie",regions:["Noord","Midden","Zuid"]},
  {start:"2027-02-13",end:"2027-02-21",name:"Voorjaarsvakantie",regions:["Zuid"]},
  {start:"2027-02-20",end:"2027-02-28",name:"Voorjaarsvakantie",regions:["Noord","Midden"]},
  {start:"2027-04-24",end:"2027-05-02",name:"Meivakantie",regions:["Noord","Midden","Zuid"]},
  {start:"2027-07-10",end:"2027-08-22",name:"Zomervakantie",regions:["Noord"]},
  {start:"2027-07-17",end:"2027-08-29",name:"Zomervakantie",regions:["Midden"]},
  {start:"2027-07-24",end:"2027-09-05",name:"Zomervakantie",regions:["Zuid"]},
];
// Laatst bekende vakantie-/feestdagdatum + waarschuwing als die bijna verlopen is.
export function holidayDataUntil():string{
  // Feestdagen worden automatisch berekend; alleen de schoolvakanties moeten jaarlijks worden bijgewerkt.
  const all=SCHOOL_HOL.map(h=>h.end);
  return all.sort().pop()||"";
}
export function holidayDataExpiringSoon(months=3):boolean{
  const last=holidayDataUntil();if(!last)return true;
  const limit=new Date();limit.setMonth(limit.getMonth()+months);
  return new Date(last+"T12:00")<=limit;
}
export const DAYS_NL = ["Ma","Di","Wo","Do","Vr","Za","Zo"];
export const DAYS_FULL = ["Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
export const MONTHS_NL = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
export const AFDS:Afdeling[] = ["Stoffering","Schilderwerk","Zonwering"];
export const FUNCS:Functie[] = ["Stoffeerder","Schilder","Monteur zonwering","Allround","Projectleider"];
export const STATS:ProjectStatus[] = ["Offerte","Bevestigd","In uitvoering","Afgerond","Gefactureerd"];
export const AVAIL_STATS:AvailStatus[] = ["Beschikbaar","Ingepland","Bezet","Gereserveerd","Vakantie","Ziek","Vrij"];
export const ABSENCE_STATS:AvailStatus[] = ["Vakantie","Ziek","Vrij","Bezet","Gereserveerd"];
export const HOUR_HEIGHT = 56;
export const BASE_HOUR = 7;
export const HOURS = Array.from({length:13},(_,i)=>i+BASE_HOUR);

export const TODAY_STR = new Date().toISOString().split("T")[0];

// ===== UTILS =====

export function validDate(d:string|Date|null|undefined):boolean{if(!d)return false;const dt=typeof d==="string"?new Date(d):d;return !isNaN(dt.getTime());}
export function fmtDate(d:string|Date){if(!validDate(d))return "—";const dt=typeof d==="string"?new Date(d):d;return dt.toLocaleDateString("nl-NL",{day:"2-digit",month:"2-digit",year:"numeric"});}
export function fmtTime(d:string|Date){if(!validDate(d))return "";const dt=typeof d==="string"?new Date(d):d;return dt.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"});}
export function toDTLocal(iso:string){const d=new Date(iso);if(isNaN(d.getTime()))return "";const p=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
// Datum-/tijddelen van een opgeslagen ISO-datum, in lokale (Europe/Amsterdam) tijd.
export function datePart(iso:string){const s=toDTLocal(iso);return s?s.slice(0,10):"";}
export function timePart(iso:string){const s=toDTLocal(iso);return s?s.slice(11,16):"";}
// Combineert een datum (yyyy-mm-dd, of Nederlands dd-mm-jjjj) met een tijd (HH:MM)
// tot een ISO-datum zonder dagverschuiving. Lege datum => "".
export function combineLocalDT(dateStr:string,timeStr:string,defH:number,defM:number):string{
  const raw=(dateStr||"").trim();if(!raw)return "";
  let y=0,m=0,d=0;
  const nl=raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  const iso=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(nl){d=+nl[1];m=+nl[2];y=+nl[3];}
  else if(iso){y=+iso[1];m=+iso[2];d=+iso[3];}
  else return "";
  const t=(timeStr||"").match(/^(\d{1,2}):(\d{2})$/);
  const hh=t?+t[1]:defH, mm=t?+t[2]:defM;
  const dt=new Date(y,m-1,d,hh,mm,0,0);
  return isNaN(dt.getTime())?"":dt.toISOString();
}
export function sameDay(a:Date,b:Date){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
export function getDHol(s:string){return feestdagOp(s);}
// ===== Feestdagkleur (instelbaar, standaard fuchsia) =====
export const HOLIDAY_COLOR="#A0668F";
export function holidayColorOf(s?:{holidayColor?:string}){return s?.holidayColor||HOLIDAY_COLOR;}
export function withAlpha(hex:string,alpha:number){
  const h=hex.replace("#","");
  if(h.length!==6)return hex;
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
// Maandag = 0 … zondag = 6
export const WD_LABELS=["Ma","Di","Wo","Do","Vr","Za","Zo"];
export const WD_FULL=["Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
export function getSHols(s:string,regions:string[]){const d=new Date(s);return SCHOOL_HOL.filter(h=>{const st=new Date(h.start),en=new Date(h.end);return d>=st&&d<=en&&h.regions.some(r=>regions.includes(r));});}
export function nid(){
  const uuid=globalThis.crypto?.randomUUID?.();
  return uuid||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,11)}`;
}
export function nextWN(ps:Project[]){const yr=new Date().getFullYear();const ns=ps.filter(p=>p.werknummer.startsWith(yr+"-")).map(p=>parseInt(p.werknummer.split("-")[1]));return `${yr}-${String((ns.length?Math.max(...ns):0)+1).padStart(3,"0")}`;}
export function abbrevName(naam:string):string{const parts=naam.split(" ");return parts.length<=1?naam:parts[0][0]+". "+parts.slice(1).join(" ");}
// Projectleider kan een employee-id zijn óf vrije tekst (bv. Calculator uit Excel).

// ===== Projectleiders: afkortingen (uit Excel "Projectl.") → volledige naam =====
// Standaardlijst en normalisatie staan in src/lib/projectleiders.ts
export let plAliases:Record<string,string>=normPlAliases(DEFAULT_PL_NAMEN);
export function setProjectleiderAliases(m?:Record<string,string>){plAliases=normPlAliases({...DEFAULT_PL_NAMEN,...(m||{})});}
export function plName(p:Project,employees:Employee[]):string{
  const e=employees.find(x=>x.id===p.projectleider);
  if(e)return e.naam;
  const raw=String(p.projectleider||"").trim();
  return plAliases[raw.toUpperCase()]||raw;
}
export function tooltipText(row:AvailEntry,proj:Project,employees:Employee[]):string{
  const first=row.isFirstOfDay?"Als eerste uitvoeren · ":"";
  const desc=proj.projectnaam||proj.opmerkingen||"—";
  const calc=plName(proj,employees)||"—";
  const afds=getAllAfds(proj).join(", ");
  return `${first}${proj.werknummer}\n${desc}\n${calc} · ${afds}\nklik = werkgegevens · rechtsklik = planning bewerken`;
}
export function projLabel(p:Project,employees:Employee[]):string{const pn=canonPl(plName(p,employees));const s=p.eersteVanDag?"★ ":"";return pn?`${s}${p.werknummer} – ${p.projectnaam} – ${pn}`:`${s}${p.werknummer} – ${p.projectnaam}`;}
// Agenda: namen van de ingeplande medewerkers (alleen voor blokken die uit planningregels komen)
export function agendaEmpNames(p:Project,employees:Employee[]):string{if(!p.id.includes("::"))return "";return p.medewerkers.map(id=>employees.find(e=>e.id===id)?.naam).filter((n):n is string=>!!n).join(", ");}
export function agendaLabel(p:Project,employees:Employee[]):string{const n=agendaEmpNames(p,employees);return n?`${projLabel(p,employees)} · ${n}`:projLabel(p,employees);}
export function getDatesInRange(start:Date,end:Date):string[]{const dates:string[]=[];const cur=new Date(start);cur.setHours(0,0,0,0);const endD=new Date(end);endD.setHours(0,0,0,0);while(cur<=endD){dates.push(toDateStr(new Date(cur)));cur.setDate(cur.getDate()+1);}return dates;}
export function getDominantStatus(avails:AvailEntry[]):AvailStatus{const pri:AvailStatus[]=["Ziek","Vakantie","Bezet","Gereserveerd","Niet beschikbaar","Ingepland","Vrij","Beschikbaar"];for(const s of pri){if(avails.some(a=>a.status===s))return s;}return "Beschikbaar";}
export function fmtHM(h:number,m:number){return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;}
export function getWeekNumber(d:Date):number{const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const dayNum=date.getUTCDay()||7;date.setUTCDate(date.getUTCDate()+4-dayNum);const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));return Math.ceil((((date.getTime()-yearStart.getTime())/86400000)+1)/7);}

export function getAllAfds(p:Project):Afdeling[]{return p.afdelingen?.length?p.afdelingen:[p.afdeling];}
export function isOfferte(p:Project){return (p.status||"").trim().toLowerCase()==="offerte";}
export function projStyle(p:Project,dc:Record<Afdeling,{bg:string;light:string;border:string}>):React.CSSProperties{
  const afds=getAllAfds(p);
  // Offertes blijven zichtbaar in de agenda, maar met een grijze, gestippelde stijl
  if(p.teamKleur&&!isOfferte(p))return{backgroundColor:p.teamKleur};
  if(isOfferte(p))return{backgroundColor:"#9AA5B8",backgroundImage:"repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 6px, transparent 6px 12px)",border:"1px dashed #5F6673",opacity:0.9};
  if(afds.length===1)return{backgroundColor:dc[afds[0]].bg};
  if(afds.length===2)return{background:`linear-gradient(135deg, ${dc[afds[0]].bg} 50%, ${dc[afds[1]].bg} 50%)`};
  return{background:`linear-gradient(90deg, ${dc[afds[0]].bg} 33.3%, ${dc[afds[1]].bg} 33.3% 66.6%, ${dc[afds[2]].bg} 66.6%)`};
}
// Agenda: kleur uitsluitend op afdeling (geen offerte-, team- of statuskleur)
export function agendaProjStyle(p:Project,dc:Record<Afdeling,{bg:string;light:string;border:string}>):React.CSSProperties{
  const afds=getAllAfds(p);
  if(afds.length===1)return{backgroundColor:dc[afds[0]].bg,borderColor:dc[afds[0]].border};
  if(afds.length===2)return{background:`linear-gradient(135deg, ${dc[afds[0]].bg} 50%, ${dc[afds[1]].bg} 50%)`};
  return{background:`linear-gradient(90deg, ${dc[afds[0]].bg} 33.3%, ${dc[afds[1]].bg} 33.3% 66.6%, ${dc[afds[2]].bg} 66.6%)`};
}
export function primaryAfd(p:Project):Afdeling{return getAllAfds(p)[0];}

// ===== PLANNINGREGELS (enige bron van waarheid) =====
// Een planningregel = availability-rij met projectId en status "Ingepland".
export function planRows(av:AvailEntry[]):AvailEntry[]{return av.filter(a=>!!a.projectId&&a.status==="Ingepland");}
export function projectPlans(av:AvailEntry[],projectId:string):AvailEntry[]{return planRows(av).filter(a=>a.projectId===projectId);}
export function assignedEmpIds(av:AvailEntry[],projectId:string):string[]{return [...new Set(projectPlans(av,projectId).map(a=>a.employeeId))];}
// Alle werk-id's die bij hetzelfde werk horen: dit werk + werken met hetzelfde werknummer (dubbel ingelezen).
// Alleen voor tellen en tonen; werknummers en werken zelf worden nooit aangepast.
export function werkIdsVan(p:Pick<Project,"id"|"werknummer">):string[]{
  const wn=String(p.werknummer||"").trim();
  return [...new Set([p.id,...(wn?getIndexedProjectsByWerknummer(wn).map(x=>x.id):[])])];
}
// Ingeplande medewerkers van een werk, inclusief planning op werken met hetzelfde werknummer
export function werkEmpIds(av:AvailEntry[],p:Pick<Project,"id"|"werknummer">):string[]{
  const ids=new Set(werkIdsVan(p));
  return [...new Set(planRows(av).filter(a=>ids.has(a.projectId||"")).map(a=>a.employeeId))];
}
export function planPeriod(rows:AvailEntry[]):{start:string;end:string}|null{
  if(!rows.length)return null;
  let start="",end="";
  rows.forEach(r=>{
    const s=combineLocalDT(r.date,r.startTime||WORKDAY_START,7,0);
    const e=combineLocalDT(r.date,r.endTime||"17:00",17,0);
    if(!start||new Date(s)<new Date(start))start=s;
    if(!end||new Date(e)>new Date(end))end=e;
  });
  return start&&end?{start,end}:null;
}
export function benodigd(p:Project):number{return Math.max(1,Number(p.benodigdeMedewerkers)||1);}
export type PlanStatus="Niet ingepland"|"Gedeeltelijk ingepland"|"Ingepland";
export function planStatusOf(p:Project,av:AvailEntry[]):PlanStatus{
  const n=werkEmpIds(av,p).length;
  if(n===0)return "Niet ingepland";
  return n>=benodigd(p)?"Ingepland":"Gedeeltelijk ingepland";
}
// Standaardkleuren voor de planningsbadges (overschrijfbaar via Kleuren beheren)
export const DEFAULT_BADGE_COLORS:Record<PlanStatus,string>={
  "Niet ingepland":"#94A3B8",
  "Gedeeltelijk ingepland":"#C99A45",
  "Ingepland":"#6A9E74",
};
export const PLAN_STATUS_LABEL:Record<PlanStatus,string>={
  "Niet ingepland":"Niet ingepland",
  "Gedeeltelijk ingepland":"Gedeeltelijk ingepland",
  "Ingepland":"Volledig ingepland",
};
export function overlaps(aS:string,aE:string,bS:string,bE:string){return aS<bE&&bS<aE;}
export interface PlanConflict{employee:string;label:string;time:string;status:AvailStatus;date:string;kind:"blocking"|"warning";type?:"planning_overlap";}
// Blokkerend: Bezet, Vakantie, Ziek, Vrij, Niet beschikbaar.
// Waarschuwing: de medewerker staat al op een ánder project in hetzelfde tijdvak.
// `rows` bevat uitsluitend de regels van deze medewerker op deze dag (O(1)-lookup),
// en `getProject` is een O(1)-lookup op de centrale projectindex.
export function findConflicts(rows:AvailEntry[],employees:Employee[],getProject:(id?:string|null)=>Project|undefined,empId:string,date:string,start:string,end:string,ignoreId?:string):PlanConflict[]{
  const emp=employees.find(e=>e.id===empId);
  const naam=emp?emp.naam:"Medewerker";
  const out:PlanConflict[]=[];
  rows.filter(a=>a.id!==ignoreId).forEach(a=>{
    if(!overlaps(start,end,a.startTime,a.endTime))return;
    const blocking:AvailStatus[]=["Niet beschikbaar","Vakantie","Ziek","Vrij","Bezet"];
    if(blocking.includes(a.status)){out.push({employee:naam,label:a.status,time:`${a.startTime}–${a.endTime}`,status:a.status,date:a.date,kind:"blocking"});return;}
    if(a.status==="Ingepland"){
      const p=getProject(a.projectId);
      out.push({employee:naam,label:p?`${p.werknummer} – ${p.projectnaam}`:(a.note||"Bestaande planning"),time:`${a.startTime}–${a.endTime}`,status:a.status,date:a.date,kind:"warning",type:"planning_overlap"});
    }
  });
  return out;
}
// Werkformulier → planning: voor elke gekozen medewerker per dag in de looptijd van het werk een
// planningregel ("Ingepland"). Weekenddagen worden overgeslagen tenzij het werk alleen in het weekend valt;
// dagen met vakantie/ziek/vrij/bezet worden overgeslagen en teruggemeld.
export function buildProjectPlanRows(p:Project,empIds:string[],av:AvailEntry[],employees:Employee[]):{rows:AvailEntry[];skipped:PlanConflict[]}{
  if(!empIds.length||!validDate(p.startdatum))return{rows:[],skipped:[]};
  const end=validDate(p.afloopdatum)?p.afloopdatum:p.startdatum;
  const all=getDatesInRange(new Date(p.startdatum),new Date(end));
  const weekdays=all.filter(d=>weekdayIdx(d)<5&&!feestdagOp(d));
  const days=weekdays.length?weekdays:all;
  // Standaard werkdag (Instellingen, standaard 07:00–17:00)
  const st=defaultStartFor(p),et=WORKDAY_END;
  const reeksId=days.length>1?"reeks-"+nid():undefined;
  const rows:AvailEntry[]=[],skipped:PlanConflict[]=[];
  empIds.forEach(employeeId=>days.forEach(date=>{
    const block=blockingOnly(findConflicts(av.filter(a=>a.employeeId===employeeId&&a.date===date),employees,getIndexedProject,employeeId,date,st,et));
    if(block.length){skipped.push(...block);return;}
    rows.push({id:"plan-"+nid(),employeeId,date,startTime:st,endTime:et,status:"Ingepland",
      note:`${p.werknummer} – ${p.projectnaam}`,projectId:p.id,...(reeksId?{reeksId}:null)});
  }));
  return{rows,skipped};
}
export const blockingOnly=(c:PlanConflict[])=>c.filter(x=>x.kind==="blocking");
// Is de medewerker op die dag (in dit tijdvak) vrij/ziek/op vakantie/bezet? Dan wordt die dag bij inplannen
// stilzwijgend overgeslagen, zonder foutmelding.
export function isGeblokkeerd(av:AvailEntry[],empId:string,date:string,st:string,et:string,negeer:string[]=[]):boolean{
  return blockingOnly(findConflicts(av.filter(a=>a.employeeId===empId&&a.date===date&&!negeer.includes(a.id)),[],getIndexedProject,empId,date,st,et)).length>0;
}
// Na verschuiven: werken van dezelfde medewerker die nu botsen schuiven op (in volgorde, over vrije dagen heen)
export function metMeeschuiven(av:AvailEntry[],verplaatst:AvailEntry[],mag:(r:AvailEntry)=>boolean=()=>true):AvailEntry[]{
  const eigen=verplaatst.map(e=>e.id);
  const extra=schuifVolgendeOp(av,verplaatst,(r,d)=>!!feestdagOp(d)||isGeblokkeerd(av,r.employeeId,d,r.startTime,r.endTime,eigen)).filter(mag);
  return [...verplaatst,...extra];
}
// Werk krijgt nieuwe datums (werkformulier): de planning schuift mee zoals bij slepen. Nieuwe startdatum =
// alles verschuiven (werkdagen); daarna per medewerker inkorten of doortrekken tot de nieuwe einddatum.
// Weekend en dagen waarop de medewerker vrij/afwezig is, worden overgeslagen.
export function planningNaarPeriode(rows:AvailEntry[],nS:string,nE:string,av:AvailEntry[]):{ups:AvailEntry[];rem:string[]}{
  if(!rows.length)return{ups:[],rem:[]};
  const oS=rows.map(r=>r.date).sort()[0];
  const verschoven=oS===nS?rows.map(r=>({...r})):shiftPlanRows(rows,nS);
  const eigen=rows.map(r=>r.id);
  const orig=new Map(rows.map(r=>[r.id,r]));
  const ups:AvailEntry[]=[];const rem:string[]=[];
  const perMw=new Map<string,AvailEntry[]>();
  verschoven.forEach(r=>perMw.set(r.employeeId,[...(perMw.get(r.employeeId)||[]),r]));
  perMw.forEach((lijst,empId)=>{
    const binnen:AvailEntry[]=[];
    lijst.forEach(r=>{
      if(r.date>nE||r.date<nS||isGeblokkeerd(av,empId,r.date,r.startTime,r.endTime,eigen))rem.push(r.id);
      else binnen.push(r);
    });
    binnen.forEach(r=>{const o=orig.get(r.id);if(!o||o.date!==r.date)ups.push(r);});
    const sjabloon=[...lijst].sort((a,b)=>a.date.localeCompare(b.date))[lijst.length-1];
    const datums=new Set(binnen.map(r=>r.date));
    const laatste=binnen.length?[...datums].sort()[datums.size-1]:null;
    for(let d=laatste?shiftDate(laatste,1):nS;d<=nE;d=shiftDate(d,1)){
      if(isWeekendStr(d)||feestdagOp(d)||datums.has(d)||isGeblokkeerd(av,empId,d,sjabloon.startTime,sjabloon.endTime,eigen))continue;
      ups.push({...sjabloon,id:"plan-"+nid(),date:d,isFirstOfDay:false,volgorde:undefined});
    }
  });
  return{ups,rem};
}
export const warningsOnly=(c:PlanConflict[])=>c.filter(x=>x.kind==="warning");
export const conflictLine=(c:PlanConflict)=>`${c.employee} · ${c.label} · ${fmtDate(c.date)} · ${c.time}`;
// ===== TEAMKLEUREN =====
export const TEAM_PALETTE=["#5A73A8","#6A9E74","#8E78A6","#C99A45","#B5637E","#14B8A6","#5C5A9C","#B5503F","#7E9A4A","#0EA5E9","#A0668F","#C77A45"];
export function teamKey(projectId:string,date:string,empIds:string[]):string{return `${projectId}|${date}|${[...empIds].sort().join(",")}`;}
export function teamColor(key:string,overrides:Record<string,string>={}):string{
  if(overrides[key])return overrides[key];
  let h=0;for(let i=0;i<key.length;i++)h=(h*31+key.charCodeAt(i))>>>0;
  return TEAM_PALETTE[h%TEAM_PALETTE.length];
}
// ===== PROJECTKLEUREN (Personeelsplanning) =====
// De kleur hoort uitsluitend bij projectId en wordt centraal bewaard in settings.projectColors.
// Nooit afhankelijk van medewerker, datum, team, status, tijd, rijpositie of actieve filter.
export function hslToHex(h:number,s:number,l:number):string{ // s,l in 0..1
  const a=s*Math.min(l,1-l);
  const f=(n:number)=>{
    const k=(n+h/30)%12;
    const c=l-a*Math.max(-1,Math.min(k-3,9-k,1));
    return Math.round(255*c).toString(16).padStart(2,"0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
// Ruime, goed onderscheidbare kleurreeks (gulden hoek + wisselende verzadiging/helderheid)
export function generatedProjectColor(i:number):string{
  const h=(i*137.508)%360;
  const s=0.55+((i%3)*0.14);
  const l=0.40+((i%2)*0.10);
  return hslToHex(h,s,l);
}
export function stableIdx(s:string):number{let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h%997;}
export const FALLBACK_PROJECT_COLOR="#64748B";
// Centrale helper voor alle Personeelsplanning-weergaven.
// O(1): handmatig opgeslagen kleur, anders een deterministische kleur uit alleen projectId.
// Er wordt nooit automatisch een kleur voor de volledige projectenlijst berekend of opgeslagen.
export function projectPlanningColorOf(projectId:string|undefined|null,projectColors:Record<string,string>={}):string{
  if(!projectId)return FALLBACK_PROJECT_COLOR;
  return projectColors[projectId]||generatedProjectColor(stableIdx(projectId));
}
// ===== PROJECTLEIDERKLEUREN (Schilderwerk) =====
// Sleutel = de naam van de projectleider zoals getoond (plName). Handmatige kleur uit settings.projectleiderColors,
// anders een vaste kleur afgeleid van de naam.
// Eén vaste schrijfwijze per projectleider: afkorting (RV), andere hoofdletters of extra spaties
// komen allemaal uit op dezelfde naam, dus ook op dezelfde kleur en één regel in filter/legenda.
export const plSpelling=new Map<string,string>();
export function canonPl(naam:string):string{
  const schoon=naam.replace(/\s+/g," ").trim();
  if(!schoon)return "";
  const alias=plAliases[schoon.toUpperCase()];
  const basis=alias||Object.values(plAliases).find(v=>v.toLowerCase()===schoon.toLowerCase())||schoon;
  const k=basis.toLowerCase();
  if(!plSpelling.has(k))plSpelling.set(k,basis);
  return plSpelling.get(k)!;
}
export function projectleiderKey(p:Project,employees:Employee[]):string{return canonPl(plName(p,employees));}
// Projectleiderkleuren: vaste reeks die duidelijk afwijkt van de afdelingskleuren
// (Stoffering turquoise, Schilderwerk koraal, Zonwering oranje), zodat het tweede kleurvlak altijd opvalt.
export const PL_PALETTE=["#2F6FDB","#8B5CF6","#1F9D55","#D9468F","#1E3A7B","#C9741F","#5B57D6","#6E9E1F","#C93A4E","#1D8FB5","#7E4FC9","#475569"];
export function projectleiderColorOf(name:string,map:Record<string,string>={}):string{
  if(!name)return FALLBACK_PROJECT_COLOR;
  // Handmatige kleur (ook als die onder een andere schrijfwijze is opgeslagen), anders vast op naam
  const eigen=map[name]||Object.entries(map).find(([k])=>k.toLowerCase()===name.toLowerCase())?.[1];
  return eigen||PL_PALETTE[stableIdx("pl:"+name.toLowerCase())%PL_PALETTE.length];
}
// Kleur van een werk in de Personeelsplanning: de kleur van de (eerste) afdeling van het werk
export function werkAfdKleur(p:Project|undefined|null,dc:Record<Afdeling,{bg:string;light:string;border:string}>):string{
  return p?(dc[primaryAfd(p)]?.bg||FALLBACK_PROJECT_COLOR):FALLBACK_PROJECT_COLOR;
}
export function isSchilderwerk(p:Project):boolean{return getAllAfds(p).includes("Schilderwerk");}
// Achtergrond van een planningblok: Schilderwerk met projectleider = tweekleurig (werk | projectleider).
export function planBlockBg(projColor:string,plColor?:string|null):React.CSSProperties{
  return plColor?{background:`linear-gradient(90deg, ${projColor} 0%, ${projColor} 68%, ${plColor} 68%, ${plColor} 100%)`}:{backgroundColor:projColor};
}
// Tekst in een blok: maximaal twee regels, daarna afgekapt (volledige tekst staat in de tooltip).
export const TWO_LINES:React.CSSProperties={display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",overflowWrap:"anywhere",whiteSpace:"normal",lineHeight:1.2};
// ===== WERKDAGEN (zaterdag/zondag worden nooit automatisch ingepland) =====
// isWeekendStr, addWorkdays, workdayDiff en shiftPlanRows staan in src/lib/werkdagen.ts (met tests).

// Ingeplande medewerkers van een project, altijd afgeleid uit de planningregels (availability)
export function getProjectAssignedEmployees<E extends {id:string}>(projectIds:string|string[],av:AvailEntry[],employees:E[]):{employee:E;rows:AvailEntry[]}[]{
  const out:{employee:E;rows:AvailEntry[]}[]=[];
  const seen=new Map<string,number>();
  const ids=new Set(Array.isArray(projectIds)?projectIds:[projectIds]);
  planRows(av).filter(a=>ids.has(a.projectId||"")).forEach(r=>{
    const emp=employees.find(e=>e.id===r.employeeId);
    if(!emp)return;
    const idx=seen.get(emp.id);
    if(idx===undefined){seen.set(emp.id,out.length);out.push({employee:emp,rows:[r]});}
    else out[idx].rows.push(r);
  });
  out.forEach(o=>o.rows.sort((a,b)=>(a.date+a.startTime).localeCompare(b.date+b.startTime)));
  return out;
}
// Alle medewerkers die op dezelfde dag op hetzelfde project staan vormen een team
export function teamForDay(av:AvailEntry[],projectId:string,date:string):string[]{
  return [...new Set(planRows(av).filter(a=>a.projectId===projectId&&a.date===date).map(a=>a.employeeId))].sort();
}
// Alle planningregels van hetzelfde team op één dag (zelfde project + dag)
export function teamRowsForDay(av:AvailEntry[],projectId:string,date:string):AvailEntry[]{
  return planRows(av).filter(a=>a.projectId===projectId&&a.date===date);
}
// ===== HANDMATIGE VOLGORDE PER MEDEWERKER PER DAG =====
export const byVolgorde=(a:AvailEntry,b:AvailEntry)=>{
  if(!!a.isFirstOfDay!==!!b.isFirstOfDay)return a.isFirstOfDay?-1:1;
  const va=typeof a.volgorde==="number"?a.volgorde:9999;
  const vb=typeof b.volgorde==="number"?b.volgorde:9999;
  if(va!==vb)return va-vb;
  return a.startTime.localeCompare(b.startTime);
};
// ===== "ALS EERSTE UITVOEREN" =====
// Per medewerker per dag mag hoogstens één projectblok gemarkeerd zijn.
export function dayPlanRows(all:AvailEntry[],empId:string,date:string):AvailEntry[]{
  return planRows(all).filter(a=>a.employeeId===empId&&a.date===date).sort(byVolgorde);
}
export function groupKeys(entries:AvailEntry[]):string[]{
  return [...new Set(planRows(entries).map(e=>e.employeeId+"|"+e.date))];
}
export function mergeRows(all:AvailEntry[],entries:AvailEntry[],removeIds:string[]=[]):AvailEntry[]{
  const map=new Map(all.filter(a=>!removeIds.includes(a.id)).map(a=>[a.id,a]));
  entries.forEach(e=>map.set(e.id,e));
  return [...map.values()];
}
// Zorgt dat er per medewerker+dag maximaal één markering staat en dat een
// enkel projectblok automatisch als eerste geldt. Geeft de (aangevulde) opslaglijst terug.
export function normalizeFirstOfDay(all:AvailEntry[],entries:AvailEntry[],removeIds:string[]=[]):AvailEntry[]{
  const merged=mergeRows(all,entries,removeIds);
  const out=new Map(entries.map(e=>[e.id,e]));
  groupKeys([...entries,...all.filter(a=>removeIds.includes(a.id))]).forEach(k=>{
    const [empId,date]=k.split("|");
    const rows=dayPlanRows(merged,empId,date);
    if(!rows.length)return;
    const marked=rows.find(r=>r.isFirstOfDay);
    // Nooit automatisch markeren: alleen een bewuste keuze van de gebruiker zet de ster.
    const want=marked?marked.id:null;
    rows.forEach(r=>{
      const should=r.id===want;
      if(!!r.isFirstOfDay===should)return;
      out.set(r.id,{...(out.get(r.id)||r),isFirstOfDay:should});
    });
  });
  return [...out.values()];
}
// Zoekt een dag waar het gemarkeerde project niet langer als eerste begint.
export function firstStartMismatch(all:AvailEntry[],entries:AvailEntry[],removeIds:string[]=[]):{rows:AvailEntry[];target:AvailEntry}|null{
  const merged=mergeRows(all,entries,removeIds);
  for(const k of groupKeys(entries)){
    const [empId,date]=k.split("|");
    const rows=dayPlanRows(merged,empId,date);
    if(rows.length<2)continue;
    const marked=rows.find(r=>r.isFirstOfDay);
    if(!marked)continue;
    const earliest=[...rows].sort((a,b)=>a.startTime.localeCompare(b.startTime))[0];
    if(earliest.id!==marked.id&&earliest.startTime<marked.startTime)return {rows,target:earliest};
  }
  return null;
}
// Zet de markering op één regel en hernummert de dag.
export function applyFirstOfDay(rows:AvailEntry[],targetId:string|null):AvailEntry[]{
  const rest=rows.filter(r=>r.id!==targetId).sort(byVolgorde);
  const order=targetId?[...rows.filter(r=>r.id===targetId),...rest]:rest;
  return order.map((r,idx)=>({...r,volgorde:idx,isFirstOfDay:!!targetId&&idx===0}));
}
// Volledige dagafwezigheid: kleurt de celrand
export function dayBlockState(av:AvailEntry[],empId:string,date:string):AvailStatus|null{
  const rows=av.filter(a=>!a.projectId&&a.employeeId===empId&&a.date===date&&ABSENCE_STATS.includes(a.status));
  // Bestaande afwezigheid van 08:00–17:00 telt ook nog als hele dag
  const full=rows.find(a=>a.startTime<="08:00"&&a.endTime>=WORKDAY_END);
  return full?full.status:(rows[0]?.status??null);
}
// ===== KLEURBEHEER =====
// Alle kleuren komen uit app_settings; zonder override geldt de standaardkleur.
export function statusColorOf(s:AvailStatus,ov:Record<string,string>={}):string{return ov[s]||AS[s].dot;}
export function statusBgOf(s:AvailStatus,ov:Record<string,string>={}):string{return ov[s]?ov[s]+"33":AS[s].bg;}
export function absenceStyle(s:AvailStatus,ov:Record<string,string>={}):React.CSSProperties{
  const c=statusColorOf(s,ov);
  return{backgroundColor:c,backgroundImage:"repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0 5px, transparent 5px 10px)",color:"#fff"};
}
// Dagrand bij een hele dag afwezig: eigen override, anders de statuskleur
export function borderColorOf(s:AvailStatus,bo:Record<string,string>={},ov:Record<string,string>={}):string{return bo[s]||statusColorOf(s,ov);}
// Planningsbadge (Niet / Gedeeltelijk / Volledig ingepland)
export function badgeColorOf(s:PlanStatus,bc:Record<string,string>={}):string{return bc[s]||DEFAULT_BADGE_COLORS[s];}
export function badgeStyle(s:PlanStatus,bc:Record<string,string>={}):React.CSSProperties{
  const c=badgeColorOf(s,bc);
  return{backgroundColor:c+"22",color:c,border:`1px solid ${c}55`};
}
// ===== FILTERS =====
export interface PlanFilter{id:string;naam:string;kleur:string;afdeling:string;actief:boolean;}
export const DEFAULT_PLAN_FILTERS:PlanFilter[]=AFDS.map((a,i)=>({id:"pf"+(i+1),naam:a,kleur:DEFAULT_DC[a].bg,afdeling:a,actief:true}));



export function getMonthWeeks(year:number,month:number):Date[][]{
  const first=new Date(year,month,1),last=new Date(year,month+1,0);
  const dow=first.getDay();
  const start=new Date(first);start.setDate(first.getDate()-(dow===0?6:dow-1));
  const weeks:Date[][]=[];const cur=new Date(start);
  do{const w:Date[]=[];for(let i=0;i<7;i++){w.push(new Date(cur));cur.setDate(cur.getDate()+1);}weeks.push(w);}while(cur<=last);
  return weeks;
}
export function getWeekDays(ref:Date):Date[]{
  const dow=ref.getDay();const mon=new Date(ref);
  mon.setDate(ref.getDate()-(dow===0?6:dow-1));mon.setHours(0,0,0,0);
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});
}
export interface LEv{project:Project;sc:number;ec:number;slot:number;cl:boolean;cr:boolean;}
export function layoutWeek(wdays:Date[],projects:Project[]):LEv[]{
  const ws=new Date(wdays[0]);ws.setHours(0,0,0,0);
  const we=new Date(wdays[6]);we.setHours(23,59,59,999);
  const evs=projects.filter(p=>{const s=new Date(p.startdatum),e=new Date(p.afloopdatum);return s<=we&&e>=ws;})
    .map(p=>{
      const ps=new Date(p.startdatum);ps.setHours(0,0,0,0);
      const pe=new Date(p.afloopdatum);pe.setHours(0,0,0,0);
      const sc=Math.max(0,Math.round((ps.getTime()-ws.getTime())/86400000));
      const ec=Math.min(6,Math.round((pe.getTime()-ws.getTime())/86400000));
      return{project:p,sc,ec,cl:ps<ws,cr:pe>wdays[6],slot:0};
    }).sort((a,b)=>a.sc!==b.sc?a.sc-b.sc:(b.ec-b.sc)-(a.ec-a.sc));
  const usage:{s:number;e:number}[][]=[];
  evs.forEach(ev=>{let sl=0;while(true){if(!usage[sl])usage[sl]=[];const c=usage[sl].some(u=>u.e>=ev.sc&&u.s<=ev.ec);if(!c){usage[sl].push({s:ev.sc,e:ev.ec});ev.slot=sl;break;}sl++;}});
  return evs;
}

// ===== SHARED UI =====
export function Badge({children,className=""}:{children:React.ReactNode;className?:string}){
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}
export function DeptBadge({afd}:{afd:Afdeling}){
  const dc=useDC();
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{backgroundColor:dc[afd].bg}}>{afd}</span>;
}
export function DeptBadges({afds}:{afds:Afdeling[]}){
  const dc=useDC();
  return <div className="flex flex-wrap gap-1">{afds.map(a=><span key={a} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{backgroundColor:dc[a].bg}}>{a}</span>)}</div>;
}
export function StatusBadge({status}:{status:ProjectStatus}){
  return <Badge className={SB[status]}>{status}</Badge>;
}
export function AvailBadge({status}:{status:AvailStatus}){
  const s=AS[status];
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{backgroundColor:s.bg,color:s.text}}>
    <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:s.dot}}/>
    {status}
  </span>;
}
export function Btn({children,onClick,variant="primary",size="md",className="",disabled=false}:{children:React.ReactNode;onClick?:()=>void;variant?:"primary"|"secondary"|"ghost"|"danger";size?:"sm"|"md";className?:string;disabled?:boolean}){
  const v={primary:"bg-[#1E3A7B] text-white hover:bg-[#18306A]",secondary:"bg-[#FCFCFD] border border-[rgba(15,23,42,0.16)] text-[#23272F] hover:bg-[#F2F4F7]",ghost:"text-[#5F6673] hover:text-[#23272F] hover:bg-[#E9EDF2]",danger:"bg-[#C2604D] text-white hover:bg-[#C93A2E]"};
  const s={sm:"px-3 py-1.5 text-xs",md:"px-4 py-2 text-sm"};
  return <button onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors ${v[variant]} ${s[size]} ${disabled?"opacity-40 cursor-not-allowed":""} ${className}`}>{children}</button>;
}
export function Input({label,value,onChange,type="text",placeholder="",required=false,className=""}:{label?:string;value:string;onChange:(v:string)=>void;type?:string;placeholder?:string;required?:boolean;className?:string}){
  return <div className={className}>
    {label&&<label className="block text-xs font-semibold text-[#5F6673] mb-1">{label}{required&&<span className="text-[#C2604D] ml-0.5">*</span>}</label>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2 bg-[#F2F4F7] border border-[rgba(15,23,42,0.1)] rounded-[10px] text-sm text-[#23272F] focus:outline-none focus:ring-2 focus:ring-[#1E3A7B]/40 focus:border-[#1E3A7B] placeholder-[#9AA1AD]" />
  </div>;
}
// Plaats van het werkadres (voor het weer)
export function werkPlaats(p?:Project|null):string{
  return String(p?.plaatsObject||p?.plaats||"").trim();
}

// Korte naam van een werk: "werknummer – projectnaam"
export function werkLabel(id?:string|null):string{
  const p=getIndexedProject(id);if(!p)return "";
  return [p.werknummer,p.projectnaam].filter(Boolean).join(" – ");
}

// ===== Regio =====
// Regio van een werk: het veld "Regio / Vestiging" (of de Excel-kolom Vestiging); is die leeg, dan de plaats.
export function regioVan(p?:Project|null):string{
  if(!p)return "";
  return String(p.region||p.vestiging||p.plaatsObject||p.plaats||"").trim();
}
export function regioOpties(projects:Iterable<Project|undefined|null>):string[]{
  const s=new Set<string>();
  for(const p of projects){const r=regioVan(p);if(r)s.add(r);}
  return [...s].sort((a,b)=>a.localeCompare(b,"nl"));
}
export function RegioFilter({value,onChange,opties,className=""}:{value:string;onChange:(v:string)=>void;opties:string[];className?:string}){
  return <select value={value} onChange={e=>onChange(e.target.value)} title="Filter op regio" aria-label="Filter op regio"
    className={`py-1.5 px-2 text-xs rounded-[10px] border focus:outline-none focus:ring-1 focus:ring-[#1E3A7B]/50 ${value?"border-[#1E3A7B] text-[#23272F] font-semibold bg-[#EEF1F5]":"border-[rgba(15,23,42,0.12)] text-[#5F6673] bg-white"} ${className}`}>
    <option value="">Alle regio's</option>
    {opties.map(o=><option key={o} value={o}>{o}</option>)}
  </select>;
}

export function Select({label,value,onChange,options,required=false,className=""}:{label?:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];required?:boolean;className?:string}){
  return <div className={className}>
    {label&&<label className="block text-xs font-semibold text-[#5F6673] mb-1">{label}{required&&<span className="text-[#C2604D] ml-0.5">*</span>}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)}
      className="w-full px-3 py-2 bg-[#F2F4F7] border border-[rgba(15,23,42,0.1)] rounded-[10px] text-sm text-[#23272F] focus:outline-none focus:ring-2 focus:ring-[#1E3A7B]/40 focus:border-[#1E3A7B]">
      <option value="">Selecteer...</option>
      {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>;
}
export function Textarea({label,value,onChange,rows=3,placeholder="",className=""}:{label?:string;value:string;onChange:(v:string)=>void;rows?:number;placeholder?:string;className?:string}){
  return <div className={className}>
    {label&&<label className="block text-xs font-semibold text-[#5F6673] mb-1">{label}</label>}
    <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows} placeholder={placeholder}
      className="w-full px-3 py-2 bg-[#F2F4F7] border border-[rgba(15,23,42,0.1)] rounded-[10px] text-sm text-[#23272F] focus:outline-none focus:ring-2 focus:ring-[#1E3A7B]/40 focus:border-[#1E3A7B] placeholder-[#9AA1AD] resize-none" />
  </div>;
}
export function Modal({title,children,onClose,width="max-w-2xl"}:{title:string;children:React.ReactNode;onClose:()=>void;width?:string}){
  return <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
    <div className={`relative mm-venster rounded-t-[28px] sm:rounded-[28px] w-full ${width} max-h-[92vh] sm:max-h-[90vh] flex flex-col`}>
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-[rgba(15,23,42,0.08)]">
        <h2 className="font-bold text-base md:text-lg text-[#23272F] truncate pr-2">{title}</h2>
        <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-[#F2F4F7] text-[#5F6673] transition-colors flex-shrink-0"><X className="w-4 h-4"/></button>
      </div>
      <div className="overflow-y-auto flex-1">{children}</div>
    </div>
  </div>;
}
export function ConfirmModal({message,onConfirm,onCancel,confirmLabel="Verwijderen",confirmVariant="danger"}:{message:string;onConfirm:()=>void;onCancel:()=>void;confirmLabel?:string;confirmVariant?:"primary"|"danger"}){
  return <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)onCancel();}}>
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
    <div className="relative mm-venster rounded-[28px] w-full max-w-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#F5E1DC] flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-[#C2604D]"/></div>
        <div><h3 className="font-semibold text-[#23272F]">Bevestigen</h3><p className="text-sm text-[#5F6673]">{message}</p></div>
      </div>
      <div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={onCancel}>Annuleren</Btn><Btn variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Btn></div>
    </div>
  </div>;
}

