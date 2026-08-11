import { useState, useRef, useEffect, useMemo, createContext, useContext } from "react";
import {
  LayoutDashboard, FolderOpen, CalendarDays, Users, Clock3,
  Receipt, Settings, ChevronLeft, ChevronRight, Plus, Pencil,
  Trash2, X, Search, MapPin, Phone, Mail, Layers,
  FileText, MessageSquare, CreditCard, Check, Upload,
  ChevronDown, UserCircle, Filter, MoreVertical,
  Calendar, Grid3X3, UserCheck, AlertTriangle, Building2,
  Tag, Star, Eye, Briefcase, Clock, Menu, Download, Table2, LogOut, Palette
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { loadAll, syncTable, syncSettings, loadProjectMeta, saveProjectMeta, EMPTY_META, loadPersonalNotes, savePersonalNote, deletePersonalNote, type PersonalNote } from "@/lib/planning-store";
import { useAuth } from "@/components/auth-gate";
import maasmondLogo from "@/assets/maasmond-logo.jpg.asset.json";


// ===== TYPES =====
type Nav = "dashboard"|"projecten"|"agenda"|"personeelsplanning"|"medewerkers"|"notities"|"facturatie"|"instellingen";
type Afdeling = "Stoffering"|"Schilderwerk"|"Zonwering";
type ProjectStatus = "Offerte"|"Bevestigd"|"In uitvoering"|"Afgerond"|"Gefactureerd";
type AvailStatus = "Beschikbaar"|"Ingepland"|"Bezet"|"Niet beschikbaar"|"Vakantie"|"Ziek"|"Vrij";
type Functie = "Stoffeerder"|"Schilder"|"Monteur zonwering"|"Allround"|"Projectleider";
type CalView = "month"|"week"|"day"|"kwartaal";

interface Project {
  id:string; werknummer:string; projectnr?:string; projectnaam:string; opdrachtgever:string;
  adres?:string; plaats:string; afdeling:Afdeling;
  afdelingen?:Afdeling[];
  projectleider:string;
  werkzaamheden:string; startdatum:string; afloopdatum:string;
  medewerkers:string[]; status:ProjectStatus; notities:string;
  uurprijs:number; uren:number; region?:string; benodigdeMedewerkers?:number; teamKleur?:string;
  /** Alleen voor agendablokken: dit project staat die dag als eerste uit te voeren. */
  eersteVanDag?:boolean;
}
interface Employee {
  id:string; naam:string; functie:Functie; afdeling:Afdeling;
  telefoon:string; email:string; competenties:string[];
}
interface AvailEntry { id:string; employeeId:string; date:string; startTime:string; endTime:string; status:AvailStatus; note?:string; projectId?:string; periodeId?:string; volgorde?:number; teamId?:string; reeksId?:string; isFirstOfDay?:boolean;
  isSeriesException?:boolean; serieType?:"vastevrij"; serieWeekdays?:number[]; serieStartDate?:string; serieEndDate?:string; vasteVrijExceptionIds?:string[]; }
interface FixedFreeSeries { periodeId:string; employeeId:string; serieWeekdays:number[]; serieStartDate:string; serieEndDate:string; }
const WORKDAY_END="17:00";
const toMin=(t:string)=>{const [h,m]=t.split(":").map(Number);return (h||0)*60+(m||0);};
const fromMin=(v:number)=>`${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}`;
const shiftDate=(ds:string,days:number)=>{const d=new Date(ds+"T12:00");d.setDate(d.getDate()+days);return toDateStr(d);};
interface AppSettings {
  bedrijfsnaam:string; adres:string; postcode:string; plaats:string;
  telefoon:string; email:string; primaryColor:string; accentColor:string;
  deptColors:Record<Afdeling,{bg:string;light:string;border:string}>;
  planFilters?:PlanFilter[];
  teamColors?:Record<string,string>;
  statusColors?:Record<string,string>;
  projectColors?:Record<string,string>;
  borderColors?:Record<string,string>;
  badgeColors?:Record<string,string>;
  holidayColor?:string;
  fixedFreeSeries?:FixedFreeSeries[];
}

// ===== DEPT COLOR CONTEXT =====
const DEFAULT_DC:Record<Afdeling,{bg:string;light:string;border:string}> = {
  Stoffering:  {bg:"#0ABFB8",light:"#E0F7F6",border:"#0ABFB8"},
  Schilderwerk:{bg:"#FF6B5B",light:"#FFE8E5",border:"#FF6B5B"},
  Zonwering:   {bg:"#F5A623",light:"#FEF0D3",border:"#F5A623"},
};
const DC = DEFAULT_DC;
const DeptColorCtx = createContext<Record<Afdeling,{bg:string;light:string;border:string}>>(DEFAULT_DC);
function useDC(){return useContext(DeptColorCtx);}

const INIT_SETTINGS:AppSettings = {
  bedrijfsnaam:"PlanPro BV",adres:"Industrieweg 14",postcode:"1234 AB",
  plaats:"Amsterdam",telefoon:"020-1234567",email:"info@planpro.nl",
  primaryColor:"#1A2744",accentColor:"#0ABFB8",
  deptColors:DEFAULT_DC,
};

// ===== CONSTANTS =====
const SB:Record<ProjectStatus,string> = {
  Offerte:"bg-slate-100 text-slate-600",
  Bevestigd:"bg-blue-100 text-blue-700",
  "In uitvoering":"bg-emerald-100 text-emerald-700",
  Afgerond:"bg-purple-100 text-purple-700",
  Gefactureerd:"bg-amber-100 text-amber-700",
};
const AS:Record<AvailStatus,{bg:string;text:string;dot:string}> = {
  Beschikbaar:        {bg:"#D1FAE5",text:"#065F46",dot:"#10B981"},
  Ingepland:          {bg:"#DBEAFE",text:"#1E40AF",dot:"#3B82F6"},
  Bezet:              {bg:"#FFE4E6",text:"#9F1239",dot:"#F43F5E"},
  "Niet beschikbaar": {bg:"#FEE2E2",text:"#991B1B",dot:"#EF4444"},
  Vakantie:           {bg:"#EDE9FE",text:"#5B21B6",dot:"#8B5CF6"},
  Ziek:               {bg:"#F1F3F6",text:"#374151",dot:"#6B7280"},
  Vrij:               {bg:"#F3F4F6",text:"#374151",dot:"#9CA3AF"},
};
const DUTCH_HOL = [
  {date:"2025-01-01",name:"Nieuwjaarsdag"},{date:"2025-04-18",name:"Goede Vrijdag"},
  {date:"2025-04-20",name:"Eerste Paasdag"},{date:"2025-04-21",name:"Tweede Paasdag"},
  {date:"2025-04-27",name:"Koningsdag"},{date:"2025-05-05",name:"Bevrijdingsdag"},
  {date:"2025-05-29",name:"Hemelvaartsdag"},{date:"2025-06-08",name:"Eerste Pinksterdag"},
  {date:"2025-06-09",name:"Tweede Pinksterdag"},{date:"2025-12-25",name:"Eerste Kerstdag"},
  {date:"2025-12-26",name:"Tweede Kerstdag"},{date:"2026-01-01",name:"Nieuwjaarsdag"},
  {date:"2026-04-03",name:"Goede Vrijdag"},{date:"2026-04-05",name:"Eerste Paasdag"},
  {date:"2026-04-06",name:"Tweede Paasdag"},{date:"2026-04-27",name:"Koningsdag"},
  {date:"2026-05-05",name:"Bevrijdingsdag"},{date:"2026-05-14",name:"Hemelvaartsdag"},
  {date:"2026-05-24",name:"Eerste Pinksterdag"},{date:"2026-05-25",name:"Tweede Pinksterdag"},
  {date:"2026-12-25",name:"Eerste Kerstdag"},{date:"2026-12-26",name:"Tweede Kerstdag"},
];
interface SHol {start:string;end:string;name:string;regions:string[];}
const SCHOOL_HOL:SHol[] = [
  {start:"2025-10-18",end:"2025-10-26",name:"Herfstvakantie",regions:["Noord","Midden","Zuid"]},
  {start:"2025-12-22",end:"2026-01-04",name:"Kerstvakantie",regions:["Noord","Midden","Zuid"]},
  {start:"2026-02-14",end:"2026-02-22",name:"Voorjaarsvakantie",regions:["Noord"]},
  {start:"2026-02-21",end:"2026-03-01",name:"Voorjaarsvakantie",regions:["Midden"]},
  {start:"2026-02-28",end:"2026-03-08",name:"Voorjaarsvakantie",regions:["Zuid"]},
  {start:"2026-04-25",end:"2026-05-10",name:"Meivakantie",regions:["Noord","Midden","Zuid"]},
  {start:"2026-07-11",end:"2026-08-23",name:"Zomervakantie",regions:["Noord"]},
  {start:"2026-07-04",end:"2026-08-16",name:"Zomervakantie",regions:["Midden","Zuid"]},
];
const DAYS_NL = ["Ma","Di","Wo","Do","Vr","Za","Zo"];
const DAYS_FULL = ["Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
const MONTHS_NL = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
const AFDS:Afdeling[] = ["Stoffering","Schilderwerk","Zonwering"];
const FUNCS:Functie[] = ["Stoffeerder","Schilder","Monteur zonwering","Allround","Projectleider"];
const STATS:ProjectStatus[] = ["Offerte","Bevestigd","In uitvoering","Afgerond","Gefactureerd"];
const AVAIL_STATS:AvailStatus[] = ["Beschikbaar","Ingepland","Bezet","Vakantie","Ziek","Vrij"];
const ABSENCE_STATS:AvailStatus[] = ["Vakantie","Ziek","Vrij","Bezet"];
const HOUR_HEIGHT = 56;
const BASE_HOUR = 7;
const HOURS = Array.from({length:13},(_,i)=>i+BASE_HOUR);

// ===== SAMPLE DATA =====
const mk = (off:number,h=8,m=0) => {
  const d = new Date(); d.setDate(d.getDate()+off); d.setHours(h,m,0,0); return d.toISOString();
};
const INIT_EMP:Employee[] = [
  {id:"e1",naam:"Jan de Vries",functie:"Projectleider",afdeling:"Stoffering",telefoon:"06-12345678",email:"jan@planpro.nl",competenties:["Projectmanagement","Bekleding","Technisch tekenen"]},
  {id:"e2",naam:"Maria Bakker",functie:"Stoffeerder",afdeling:"Stoffering",telefoon:"06-23456789",email:"maria@planpro.nl",competenties:["Bekleding","Gordijnen","Meubelbekleding"]},
  {id:"e3",naam:"Kees Jansen",functie:"Schilder",afdeling:"Schilderwerk",telefoon:"06-34567890",email:"kees@planpro.nl",competenties:["Schilderwerk","Behangen","Spuitwerk"]},
  {id:"e4",naam:"Petra Smit",functie:"Schilder",afdeling:"Schilderwerk",telefoon:"06-45678901",email:"petra@planpro.nl",competenties:["Schilderwerk","Decoratief schilderwerk"]},
  {id:"e5",naam:"Tom van den Berg",functie:"Monteur zonwering",afdeling:"Zonwering",telefoon:"06-56789012",email:"tom@planpro.nl",competenties:["Zonwering","Screens","Rolluiken"]},
  {id:"e6",naam:"Anja Visser",functie:"Allround",afdeling:"Zonwering",telefoon:"06-67890123",email:"anja@planpro.nl",competenties:["Zonwering","Screens","Bekleding"]},
  {id:"e7",naam:"Peter Meijer",functie:"Projectleider",afdeling:"Schilderwerk",telefoon:"06-78901234",email:"peter@planpro.nl",competenties:["Projectmanagement","Schilderwerk","Kwaliteitscontrole"]},
  {id:"e8",naam:"Lisa Kuiper",functie:"Stoffeerder",afdeling:"Stoffering",telefoon:"06-89012345",email:"lisa@planpro.nl",competenties:["Bekleding","Gordijnen","Vloerbekleding"]},
];
const INIT_PROJ:Project[] = [
  {id:"p1",werknummer:"2025-001",projectnaam:"Renovatie Hotel Amsterdam",opdrachtgever:"Hotel Amstel BV",adres:"Professor Tulpplein 1",plaats:"Amsterdam",afdeling:"Stoffering",afdelingen:["Stoffering"],projectleider:"e1",werkzaamheden:"Volledige herbekleding van 45 hotelkamers inclusief gordijnen en meubels",startdatum:mk(-5,8),afloopdatum:mk(12,17),medewerkers:["e2","e8"],status:"In uitvoering",notities:"Klant wil updates elke vrijdag",uurprijs:65,uren:120,region:"West"},
  {id:"p2",werknummer:"2025-002",projectnaam:"Schilderwerk Kantoorpand",opdrachtgever:"ABN AMRO Vastgoed",adres:"Weena 90",plaats:"Rotterdam",afdeling:"Schilderwerk",afdelingen:["Schilderwerk"],projectleider:"e7",werkzaamheden:"Volledig schilderwerk binnen en buiten, inclusief 3 verdiepingen kantoorpand",startdatum:mk(2,7,30),afloopdatum:mk(9,17),medewerkers:["e3","e4"],status:"Bevestigd",notities:"",uurprijs:55,uren:80,region:"Zuid"},
  {id:"p3",werknummer:"2025-003",projectnaam:"Zonwering Woonhuis",opdrachtgever:"Familie Hendriks",adres:"Maliebaan 45",plaats:"Utrecht",afdeling:"Zonwering",afdelingen:["Zonwering"],projectleider:"e5",werkzaamheden:"Plaatsing screens en rolluiken, 12 ramen woonkamer en slaapkamers",startdatum:mk(1,9),afloopdatum:mk(3,16),medewerkers:["e5","e6"],status:"Bevestigd",notities:"Klant aanwezig op maandag",uurprijs:60,uren:24,region:"West"},
  {id:"p4",werknummer:"2025-004",projectnaam:"Gordijnen Appartementencomplex",opdrachtgever:"Woongroep Nederland",adres:"Laan van Meerdervoort 55",plaats:"Den Haag",afdeling:"Stoffering",afdelingen:["Stoffering","Zonwering"],projectleider:"e1",werkzaamheden:"Meten, leveren en plaatsen van vouwgordijnen en screens in 28 appartementen",startdatum:mk(14,8),afloopdatum:mk(21,17),medewerkers:["e2"],status:"Offerte",notities:"",uurprijs:65,uren:112,region:"West"},
  {id:"p5",werknummer:"2025-005",projectnaam:"Buitenschilderwerk Villa",opdrachtgever:"Dhr. Van Leeuwen",adres:"Kepplerstraat 12",plaats:"Wassenaar",afdeling:"Schilderwerk",afdelingen:["Schilderwerk"],projectleider:"e7",werkzaamheden:"Volledig buitenschilderwerk, kozijnen en hekwerk",startdatum:mk(-30,8),afloopdatum:mk(-20,17),medewerkers:["e3"],status:"Afgerond",notities:"",uurprijs:55,uren:48,region:"Noord"},
  {id:"p6",werknummer:"2025-006",projectnaam:"Markiezen Restaurant",opdrachtgever:"Brasserie De Zon",adres:"Grote Markt 7",plaats:"Haarlem",afdeling:"Zonwering",afdelingen:["Zonwering"],projectleider:"e5",werkzaamheden:"Levering en montage 4 grote markiezen terras",startdatum:mk(5,8),afloopdatum:mk(6,16),medewerkers:["e5","e6"],status:"Bevestigd",notities:"Terras open om 11:00",uurprijs:60,uren:16,region:"West"},
];
const TODAY_STR = new Date().toISOString().split("T")[0];
const INIT_AVAIL:AvailEntry[] = [
  {id:"av1",employeeId:"e1",date:TODAY_STR,startTime:"08:00",endTime:"17:00",status:"Ingepland",note:"Renovatie Hotel Amsterdam",projectId:"p1"},
  {id:"av2",employeeId:"e2",date:TODAY_STR,startTime:"08:00",endTime:"17:00",status:"Ingepland",note:"Renovatie Hotel Amsterdam",projectId:"p1"},
  {id:"av3",employeeId:"e3",date:TODAY_STR,startTime:"08:00",endTime:"17:00",status:"Beschikbaar"},
  {id:"av4",employeeId:"e4",date:TODAY_STR,startTime:"08:00",endTime:"17:00",status:"Vakantie"},
  {id:"av5",employeeId:"e5",date:TODAY_STR,startTime:"09:00",endTime:"16:00",status:"Ingepland",note:"Zonwering Woonhuis",projectId:"p3"},
  {id:"av6",employeeId:"e6",date:TODAY_STR,startTime:"09:00",endTime:"16:00",status:"Ingepland",note:"Zonwering Woonhuis",projectId:"p3"},
  {id:"av7",employeeId:"e7",date:TODAY_STR,startTime:"07:30",endTime:"17:00",status:"Beschikbaar"},
  {id:"av7b",employeeId:"e7",date:TODAY_STR,startTime:"14:00",endTime:"16:00",status:"Niet beschikbaar",note:"Vergadering"},
  {id:"av8",employeeId:"e8",date:TODAY_STR,startTime:"08:00",endTime:"17:00",status:"Ziek"},
];

// ===== UTILS =====
function validDate(d:string|Date|null|undefined):boolean{if(!d)return false;const dt=typeof d==="string"?new Date(d):d;return !isNaN(dt.getTime());}
function fmtDate(d:string|Date){if(!validDate(d))return "—";const dt=typeof d==="string"?new Date(d):d;return dt.toLocaleDateString("nl-NL",{day:"2-digit",month:"2-digit",year:"numeric"});}
function fmtTime(d:string|Date){if(!validDate(d))return "";const dt=typeof d==="string"?new Date(d):d;return dt.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"});}
function toDateStr(d:Date){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function toDTLocal(iso:string){const d=new Date(iso);if(isNaN(d.getTime()))return "";const p=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
// Datum-/tijddelen van een opgeslagen ISO-datum, in lokale (Europe/Amsterdam) tijd.
function datePart(iso:string){const s=toDTLocal(iso);return s?s.slice(0,10):"";}
function timePart(iso:string){const s=toDTLocal(iso);return s?s.slice(11,16):"";}
// Combineert een datum (yyyy-mm-dd, of Nederlands dd-mm-jjjj) met een tijd (HH:MM)
// tot een ISO-datum zonder dagverschuiving. Lege datum => "".
function combineLocalDT(dateStr:string,timeStr:string,defH:number,defM:number):string{
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
function sameDay(a:Date,b:Date){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function getDHol(s:string){return DUTCH_HOL.find(h=>h.date===s)?.name||null;}
// ===== Feestdagkleur (instelbaar, standaard fuchsia) =====
const HOLIDAY_COLOR="#D946EF";
function holidayColorOf(s?:{holidayColor?:string}){return s?.holidayColor||HOLIDAY_COLOR;}
function withAlpha(hex:string,alpha:number){
  const h=hex.replace("#","");
  if(h.length!==6)return hex;
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
// Maandag = 0 … zondag = 6
const WD_LABELS=["Ma","Di","Wo","Do","Vr","Za","Zo"];
const WD_FULL=["Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
function weekdayIdx(ds:string){return (new Date(ds+"T12:00").getDay()+6)%7;}
function getSHols(s:string,regions:string[]){const d=new Date(s);return SCHOOL_HOL.filter(h=>{const st=new Date(h.start),en=new Date(h.end);return d>=st&&d<=en&&h.regions.some(r=>regions.includes(r));});}
function nid(){return Math.random().toString(36).slice(2,9);}
function nextWN(ps:Project[]){const yr=new Date().getFullYear();const ns=ps.filter(p=>p.werknummer.startsWith(yr+"-")).map(p=>parseInt(p.werknummer.split("-")[1]));return `${yr}-${String((ns.length?Math.max(...ns):0)+1).padStart(3,"0")}`;}
function abbrevName(naam:string):string{const parts=naam.split(" ");return parts.length<=1?naam:parts[0][0]+". "+parts.slice(1).join(" ");}
// Projectleider kan een employee-id zijn óf vrije tekst (bv. Calculator uit Excel).
function normalizeProjectnr(v:unknown):string{return String(v??"").trim();}
function plName(p:Project,employees:Employee[]):string{const e=employees.find(x=>x.id===p.projectleider);return e?e.naam:(p.projectleider||"");}
function projLabel(p:Project,employees:Employee[]):string{const n=plName(p,employees);const pn=n?abbrevName(n):"";const s=p.eersteVanDag?"★ ":"";return pn?`${s}${p.werknummer} – ${p.projectnaam} – ${pn}`:`${s}${p.werknummer} – ${p.projectnaam}`;}
function getDatesInRange(start:Date,end:Date):string[]{const dates:string[]=[];const cur=new Date(start);cur.setHours(0,0,0,0);const endD=new Date(end);endD.setHours(0,0,0,0);while(cur<=endD){dates.push(toDateStr(new Date(cur)));cur.setDate(cur.getDate()+1);}return dates;}
function getDominantStatus(avails:AvailEntry[]):AvailStatus{const pri:AvailStatus[]=["Ziek","Vakantie","Bezet","Niet beschikbaar","Ingepland","Vrij","Beschikbaar"];for(const s of pri){if(avails.some(a=>a.status===s))return s;}return "Beschikbaar";}
function fmtHM(h:number,m:number){return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;}
function getWeekNumber(d:Date):number{const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const dayNum=date.getUTCDay()||7;date.setUTCDate(date.getUTCDate()+4-dayNum);const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));return Math.ceil((((date.getTime()-yearStart.getTime())/86400000)+1)/7);}

function getAllAfds(p:Project):Afdeling[]{return p.afdelingen?.length?p.afdelingen:[p.afdeling];}
function isOfferte(p:Project){return (p.status||"").trim().toLowerCase()==="offerte";}
function projStyle(p:Project,dc:Record<Afdeling,{bg:string;light:string;border:string}>):React.CSSProperties{
  const afds=getAllAfds(p);
  // Offertes blijven zichtbaar in de agenda, maar met een grijze, gestippelde stijl
  if(p.teamKleur&&!isOfferte(p))return{backgroundColor:p.teamKleur};
  if(isOfferte(p))return{backgroundColor:"#9AA5B8",backgroundImage:"repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 6px, transparent 6px 12px)",border:"1px dashed #6B7A99",opacity:0.9};
  if(afds.length===1)return{backgroundColor:dc[afds[0]].bg};
  if(afds.length===2)return{background:`linear-gradient(135deg, ${dc[afds[0]].bg} 50%, ${dc[afds[1]].bg} 50%)`};
  return{background:`linear-gradient(90deg, ${dc[afds[0]].bg} 33.3%, ${dc[afds[1]].bg} 33.3% 66.6%, ${dc[afds[2]].bg} 66.6%)`};
}
// Agenda: kleur uitsluitend op afdeling (geen offerte-, team- of statuskleur)
function agendaProjStyle(p:Project,dc:Record<Afdeling,{bg:string;light:string;border:string}>):React.CSSProperties{
  const afds=getAllAfds(p);
  if(afds.length===1)return{backgroundColor:dc[afds[0]].bg,borderColor:dc[afds[0]].border};
  if(afds.length===2)return{background:`linear-gradient(135deg, ${dc[afds[0]].bg} 50%, ${dc[afds[1]].bg} 50%)`};
  return{background:`linear-gradient(90deg, ${dc[afds[0]].bg} 33.3%, ${dc[afds[1]].bg} 33.3% 66.6%, ${dc[afds[2]].bg} 66.6%)`};
}
function primaryAfd(p:Project):Afdeling{return getAllAfds(p)[0];}

// ===== PLANNINGREGELS (enige bron van waarheid) =====
// Een planningregel = availability-rij met projectId en status "Ingepland".
function planRows(av:AvailEntry[]):AvailEntry[]{return av.filter(a=>!!a.projectId&&a.status==="Ingepland");}
function projectPlans(av:AvailEntry[],projectId:string):AvailEntry[]{return planRows(av).filter(a=>a.projectId===projectId);}
function assignedEmpIds(av:AvailEntry[],projectId:string):string[]{return [...new Set(projectPlans(av,projectId).map(a=>a.employeeId))];}
function planPeriod(rows:AvailEntry[]):{start:string;end:string}|null{
  if(!rows.length)return null;
  let start="",end="";
  rows.forEach(r=>{
    const s=combineLocalDT(r.date,r.startTime||"08:00",8,0);
    const e=combineLocalDT(r.date,r.endTime||"17:00",17,0);
    if(!start||new Date(s)<new Date(start))start=s;
    if(!end||new Date(e)>new Date(end))end=e;
  });
  return start&&end?{start,end}:null;
}
function benodigd(p:Project):number{return Math.max(1,Number(p.benodigdeMedewerkers)||1);}
type PlanStatus="Niet ingepland"|"Gedeeltelijk ingepland"|"Ingepland";
function planStatusOf(p:Project,av:AvailEntry[]):PlanStatus{
  const n=assignedEmpIds(av,p.id).length;
  if(n===0)return "Niet ingepland";
  return n>=benodigd(p)?"Ingepland":"Gedeeltelijk ingepland";
}
// Standaardkleuren voor de planningsbadges (overschrijfbaar via Kleuren beheren)
const DEFAULT_BADGE_COLORS:Record<PlanStatus,string>={
  "Niet ingepland":"#94A3B8",
  "Gedeeltelijk ingepland":"#F59E0B",
  "Ingepland":"#10B981",
};
const PLAN_STATUS_LABEL:Record<PlanStatus,string>={
  "Niet ingepland":"Niet ingepland",
  "Gedeeltelijk ingepland":"Gedeeltelijk ingepland",
  "Ingepland":"Volledig ingepland",
};
function overlaps(aS:string,aE:string,bS:string,bE:string){return aS<bE&&bS<aE;}
interface PlanConflict{employee:string;label:string;time:string;status:AvailStatus;date:string;kind:"blocking"|"warning";type?:"planning_overlap";}
// Blokkerend: Bezet, Vakantie, Ziek, Vrij, Niet beschikbaar.
// Waarschuwing: de medewerker staat al op een ánder project in hetzelfde tijdvak.
function findConflicts(av:AvailEntry[],employees:Employee[],projects:Project[],empId:string,date:string,start:string,end:string,ignoreId?:string):PlanConflict[]{
  const emp=employees.find(e=>e.id===empId);
  const naam=emp?emp.naam:"Medewerker";
  const out:PlanConflict[]=[];
  av.filter(a=>a.employeeId===empId&&a.date===date&&a.id!==ignoreId).forEach(a=>{
    if(!overlaps(start,end,a.startTime,a.endTime))return;
    const blocking:AvailStatus[]=["Niet beschikbaar","Vakantie","Ziek","Vrij","Bezet"];
    if(blocking.includes(a.status)){out.push({employee:naam,label:a.status,time:`${a.startTime}–${a.endTime}`,status:a.status,date:a.date,kind:"blocking"});return;}
    if(a.status==="Ingepland"){
      const p=projects.find(x=>x.id===a.projectId);
      out.push({employee:naam,label:p?`${p.werknummer} – ${p.projectnaam}`:(a.note||"Bestaande planning"),time:`${a.startTime}–${a.endTime}`,status:a.status,date:a.date,kind:"warning",type:"planning_overlap"});
    }
  });
  return out;
}
const blockingOnly=(c:PlanConflict[])=>c.filter(x=>x.kind==="blocking");
const warningsOnly=(c:PlanConflict[])=>c.filter(x=>x.kind==="warning");
const conflictLine=(c:PlanConflict)=>`${c.employee} · ${c.label} · ${fmtDate(c.date)} · ${c.time}`;
// ===== TEAMKLEUREN =====
const TEAM_PALETTE=["#3B82F6","#10B981","#8B5CF6","#F59E0B","#EC4899","#14B8A6","#6366F1","#EF4444","#84CC16","#0EA5E9","#D946EF","#F97316"];
function teamKey(projectId:string,date:string,empIds:string[]):string{return `${projectId}|${date}|${[...empIds].sort().join(",")}`;}
function teamColor(key:string,overrides:Record<string,string>={}):string{
  if(overrides[key])return overrides[key];
  let h=0;for(let i=0;i<key.length;i++)h=(h*31+key.charCodeAt(i))>>>0;
  return TEAM_PALETTE[h%TEAM_PALETTE.length];
}
// Alle medewerkers die op dezelfde dag op hetzelfde project staan vormen een team
function teamForDay(av:AvailEntry[],projectId:string,date:string):string[]{
  return [...new Set(planRows(av).filter(a=>a.projectId===projectId&&a.date===date).map(a=>a.employeeId))].sort();
}
// Alle planningregels van hetzelfde team op één dag (zelfde project + dag)
function teamRowsForDay(av:AvailEntry[],projectId:string,date:string):AvailEntry[]{
  return planRows(av).filter(a=>a.projectId===projectId&&a.date===date);
}
// ===== HANDMATIGE VOLGORDE PER MEDEWERKER PER DAG =====
const byVolgorde=(a:AvailEntry,b:AvailEntry)=>{
  if(!!a.isFirstOfDay!==!!b.isFirstOfDay)return a.isFirstOfDay?-1:1;
  const va=typeof a.volgorde==="number"?a.volgorde:9999;
  const vb=typeof b.volgorde==="number"?b.volgorde:9999;
  if(va!==vb)return va-vb;
  return a.startTime.localeCompare(b.startTime);
};
// ===== "ALS EERSTE UITVOEREN" =====
// Per medewerker per dag mag hoogstens één projectblok gemarkeerd zijn.
function dayPlanRows(all:AvailEntry[],empId:string,date:string):AvailEntry[]{
  return planRows(all).filter(a=>a.employeeId===empId&&a.date===date).sort(byVolgorde);
}
function groupKeys(entries:AvailEntry[]):string[]{
  return [...new Set(planRows(entries).map(e=>e.employeeId+"|"+e.date))];
}
function mergeRows(all:AvailEntry[],entries:AvailEntry[],removeIds:string[]=[]):AvailEntry[]{
  const map=new Map(all.filter(a=>!removeIds.includes(a.id)).map(a=>[a.id,a]));
  entries.forEach(e=>map.set(e.id,e));
  return [...map.values()];
}
// Zorgt dat er per medewerker+dag maximaal één markering staat en dat een
// enkel projectblok automatisch als eerste geldt. Geeft de (aangevulde) opslaglijst terug.
function normalizeFirstOfDay(all:AvailEntry[],entries:AvailEntry[],removeIds:string[]=[]):AvailEntry[]{
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
function firstStartMismatch(all:AvailEntry[],entries:AvailEntry[],removeIds:string[]=[]):{rows:AvailEntry[];target:AvailEntry}|null{
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
function applyFirstOfDay(rows:AvailEntry[],targetId:string|null):AvailEntry[]{
  const rest=rows.filter(r=>r.id!==targetId).sort(byVolgorde);
  const order=targetId?[...rows.filter(r=>r.id===targetId),...rest]:rest;
  return order.map((r,idx)=>({...r,volgorde:idx,isFirstOfDay:!!targetId&&idx===0}));
}
// Volledige dagafwezigheid: kleurt de celrand
function dayBlockState(av:AvailEntry[],empId:string,date:string):AvailStatus|null{
  const rows=av.filter(a=>!a.projectId&&a.employeeId===empId&&a.date===date&&ABSENCE_STATS.includes(a.status));
  const full=rows.find(a=>a.startTime<="08:00"&&a.endTime>="17:00");
  return full?full.status:(rows[0]?.status??null);
}
// ===== KLEURBEHEER =====
// Alle kleuren komen uit app_settings; zonder override geldt de standaardkleur.
function statusColorOf(s:AvailStatus,ov:Record<string,string>={}):string{return ov[s]||AS[s].dot;}
function statusBgOf(s:AvailStatus,ov:Record<string,string>={}):string{return ov[s]?ov[s]+"33":AS[s].bg;}
function absenceStyle(s:AvailStatus,ov:Record<string,string>={}):React.CSSProperties{
  const c=statusColorOf(s,ov);
  return{backgroundColor:c,backgroundImage:"repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0 5px, transparent 5px 10px)",color:"#fff"};
}
// Dagrand bij een hele dag afwezig: eigen override, anders de statuskleur
function borderColorOf(s:AvailStatus,bo:Record<string,string>={},ov:Record<string,string>={}):string{return bo[s]||statusColorOf(s,ov);}
// Planningsbadge (Niet / Gedeeltelijk / Volledig ingepland)
function badgeColorOf(s:PlanStatus,bc:Record<string,string>={}):string{return bc[s]||DEFAULT_BADGE_COLORS[s];}
function badgeStyle(s:PlanStatus,bc:Record<string,string>={}):React.CSSProperties{
  const c=badgeColorOf(s,bc);
  return{backgroundColor:c+"22",color:c,border:`1px solid ${c}55`};
}
// ===== FILTERS =====
interface PlanFilter{id:string;naam:string;kleur:string;afdeling:string;actief:boolean;}
const DEFAULT_PLAN_FILTERS:PlanFilter[]=AFDS.map((a,i)=>({id:"pf"+(i+1),naam:a,kleur:DEFAULT_DC[a].bg,afdeling:a,actief:true}));



function getMonthWeeks(year:number,month:number):Date[][]{
  const first=new Date(year,month,1),last=new Date(year,month+1,0);
  const dow=first.getDay();
  const start=new Date(first);start.setDate(first.getDate()-(dow===0?6:dow-1));
  const weeks:Date[][]=[];const cur=new Date(start);
  do{const w:Date[]=[];for(let i=0;i<7;i++){w.push(new Date(cur));cur.setDate(cur.getDate()+1);}weeks.push(w);}while(cur<=last);
  return weeks;
}
function getWeekDays(ref:Date):Date[]{
  const dow=ref.getDay();const mon=new Date(ref);
  mon.setDate(ref.getDate()-(dow===0?6:dow-1));mon.setHours(0,0,0,0);
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});
}
interface LEv{project:Project;sc:number;ec:number;slot:number;cl:boolean;cr:boolean;}
function layoutWeek(wdays:Date[],projects:Project[]):LEv[]{
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
function Badge({children,className=""}:{children:React.ReactNode;className?:string}){
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}
function DeptBadge({afd}:{afd:Afdeling}){
  const dc=useDC();
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{backgroundColor:dc[afd].bg}}>{afd}</span>;
}
function DeptBadges({afds}:{afds:Afdeling[]}){
  const dc=useDC();
  return <div className="flex flex-wrap gap-1">{afds.map(a=><span key={a} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{backgroundColor:dc[a].bg}}>{a}</span>)}</div>;
}
function StatusBadge({status}:{status:ProjectStatus}){
  return <Badge className={SB[status]}>{status}</Badge>;
}
function AvailBadge({status}:{status:AvailStatus}){
  const s=AS[status];
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{backgroundColor:s.bg,color:s.text}}>
    <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:s.dot}}/>
    {status}
  </span>;
}
function Btn({children,onClick,variant="primary",size="md",className="",disabled=false}:{children:React.ReactNode;onClick?:()=>void;variant?:"primary"|"secondary"|"ghost"|"danger";size?:"sm"|"md";className?:string;disabled?:boolean}){
  const v={primary:"bg-[#1A2744] text-white hover:bg-[#243660]",secondary:"bg-white border border-[rgba(26,39,68,0.15)] text-[#1A2744] hover:bg-[#F0F3F8]",ghost:"text-[#6B7A99] hover:text-[#1A2744] hover:bg-[#E8EDF5]",danger:"bg-[#FF6B5B] text-white hover:bg-[#e05c4d]"};
  const s={sm:"px-2.5 py-1.5 text-xs",md:"px-3.5 py-2 text-sm"};
  return <button onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors ${v[variant]} ${s[size]} ${disabled?"opacity-40 cursor-not-allowed":""} ${className}`}>{children}</button>;
}
function Input({label,value,onChange,type="text",placeholder="",required=false,className=""}:{label?:string;value:string;onChange:(v:string)=>void;type?:string;placeholder?:string;required?:boolean;className?:string}){
  return <div className={className}>
    {label&&<label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">{label}{required&&<span className="text-[#FF6B5B] ml-0.5">*</span>}</label>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2 bg-[#F0F3F8] border border-[rgba(26,39,68,0.1)] rounded-lg text-sm text-[#1A2744] focus:outline-none focus:ring-2 focus:ring-[#0ABFB8]/40 focus:border-[#0ABFB8] placeholder-[#B8C3D9]" />
  </div>;
}
function Select({label,value,onChange,options,required=false,className=""}:{label?:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];required?:boolean;className?:string}){
  return <div className={className}>
    {label&&<label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">{label}{required&&<span className="text-[#FF6B5B] ml-0.5">*</span>}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)}
      className="w-full px-3 py-2 bg-[#F0F3F8] border border-[rgba(26,39,68,0.1)] rounded-lg text-sm text-[#1A2744] focus:outline-none focus:ring-2 focus:ring-[#0ABFB8]/40 focus:border-[#0ABFB8]">
      <option value="">Selecteer...</option>
      {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>;
}
function Textarea({label,value,onChange,rows=3,placeholder="",className=""}:{label?:string;value:string;onChange:(v:string)=>void;rows?:number;placeholder?:string;className?:string}){
  return <div className={className}>
    {label&&<label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">{label}</label>}
    <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows} placeholder={placeholder}
      className="w-full px-3 py-2 bg-[#F0F3F8] border border-[rgba(26,39,68,0.1)] rounded-lg text-sm text-[#1A2744] focus:outline-none focus:ring-2 focus:ring-[#0ABFB8]/40 focus:border-[#0ABFB8] placeholder-[#B8C3D9] resize-none" />
  </div>;
}
function Modal({title,children,onClose,width="max-w-2xl"}:{title:string;children:React.ReactNode;onClose:()=>void;width?:string}){
  return <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
    <div className={`relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full ${width} max-h-[92vh] sm:max-h-[90vh] flex flex-col`}>
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-[rgba(26,39,68,0.08)]">
        <h2 className="font-bold text-base md:text-lg text-[#1A2744] truncate pr-2">{title}</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F3F8] text-[#6B7A99] transition-colors flex-shrink-0"><X className="w-4 h-4"/></button>
      </div>
      <div className="overflow-y-auto flex-1">{children}</div>
    </div>
  </div>;
}
function ConfirmModal({message,onConfirm,onCancel,confirmLabel="Verwijderen",confirmVariant="danger"}:{message:string;onConfirm:()=>void;onCancel:()=>void;confirmLabel?:string;confirmVariant?:"primary"|"danger"}){
  return <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)onCancel();}}>
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#FFE8E5] flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-[#FF6B5B]"/></div>
        <div><h3 className="font-semibold text-[#1A2744]">Bevestigen</h3><p className="text-sm text-[#6B7A99]">{message}</p></div>
      </div>
      <div className="flex gap-2 justify-end"><Btn variant="secondary" onClick={onCancel}>Annuleren</Btn><Btn variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Btn></div>
    </div>
  </div>;
}

// ===== EXCEL IMPORT MODAL =====
interface ImportRow {
  projectnr:string;       // Projectnr. — unique key for dedup
  projectnaam:string;     // First Omschrijving column
  opdrachtgever:string;   // Naam opdrachtgever
  contactpersoon:string;  // Contactpersoon
  projectleider:string;   // Kolom K (index 10)
  startdatum:string;      // Startdatum + Starttijd (ISO datetime)
  einddatum:string;       // Einddatum + Eindtijd (ISO datetime)
  datumOpdracht:string;   // Datum opdracht (alleen informatief)
  werknummer:string;      // Werknr. (may be empty)
  werkzaamheden:string;   // Kolom J (index 9) — exacte tekst
  rawDept:string;         // Kolom J — bron voor afdelingsherkenning
  afdelingen:Afdeling[];  // Resolved departments
  turnkey:boolean;
  rowIndex:number;        // 1-based Excel row number for error messages
  invalidReason:string;   // Non-empty = invalid row
}
interface ImportPreview {
  nieuw:ImportRow[]; bestaand:ImportRow[]; ongeldig:ImportRow[]; total:number;
}

// Resolve raw department string → Afdeling[]
function resolveDept(raw:string):{afdelingen:Afdeling[];turnkey:boolean}{
  const s=raw.toLowerCase().trim();
  if(!s)return{afdelingen:["Stoffering"],turnkey:false};
  if(s==="turnkey")return{afdelingen:["Stoffering","Schilderwerk","Zonwering"],turnkey:true};
  if(s.includes("combinatie")||s.includes("combi")){
    // multiple — include all that match
    const out:Afdeling[]=[];
    if(s.includes("stof"))out.push("Stoffering");
    if(s.includes("schild"))out.push("Schilderwerk");
    if(s.includes("zon"))out.push("Zonwering");
    return{afdelingen:out.length?out:["Stoffering","Schilderwerk","Zonwering"],turnkey:false};
  }
  if(s.includes("schild"))return{afdelingen:["Schilderwerk"],turnkey:false};
  if(s.includes("stof"))return{afdelingen:["Stoffering"],turnkey:false};
  if(s.includes("zon"))return{afdelingen:["Zonwering"],turnkey:false};
  // Unknown value → default Stoffering, not invalid
  return{afdelingen:["Stoffering"],turnkey:false};
}

// Parse a cell value that may be an Excel date serial, a formatted date string, or plain text
function parseXlDate(raw:string|number|null|undefined):string{
  if(raw==null||raw==="")return "";
  // Excel date serial (number > 1 and looks like an integer or float)
  const n=typeof raw==="number"?raw:Number(String(raw).replace(",","."));
  if(!isNaN(n)&&n>1&&n<200000){
    // Convert Excel serial (days since 1900-01-01, accounting for Lotus 1900 bug)
    const d=new Date(Math.round((n-25569)*86400000));
    if(!isNaN(d.getTime()))return d.toISOString();
  }
  const s=String(raw).trim();
  if(!s)return "";
  // Try DD-MM-YYYY
  const dm=/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})$/.exec(s);
  if(dm){
    const [,d,m,y]=dm;
    const year=y.length===2?2000+parseInt(y):parseInt(y);
    const dt=new Date(year,parseInt(m)-1,parseInt(d));
    if(!isNaN(dt.getTime()))return dt.toISOString();
  }
  // ISO or other parseable format
  const dt=new Date(s);
  if(!isNaN(dt.getTime()))return dt.toISOString();
  return "";
}

// Parse a time cell: "08:30", "8.30", "8", or an Excel time fraction (0–1) → {h,m} or null
function parseXlTime(raw:unknown):{h:number;m:number}|null{
  if(raw==null||raw==="")return null;
  if(typeof raw==="number"){
    const frac=raw-Math.floor(raw);
    if(raw>0&&raw<1||frac>0){
      const mins=Math.round(frac*24*60);
      return{h:Math.floor(mins/60)%24,m:mins%60};
    }
    if(raw>=0&&raw<=23)return{h:Math.round(raw),m:0};
    return null;
  }
  const s=String(raw).trim();
  const m=/^(\d{1,2})[:.\uff1a]?(\d{2})?$/.exec(s);
  if(!m)return null;
  const h=parseInt(m[1]);const mi=m[2]?parseInt(m[2]):0;
  if(isNaN(h)||h>23||mi>59)return null;
  return{h,m:mi};
}

// Combine an ISO date with a time (defaults applied) → ISO datetime string
function combineDT(iso:string,time:{h:number;m:number}|null,defH:number,defM=0):string{
  if(!iso)return "";
  const d=new Date(iso);
  if(isNaN(d.getTime()))return "";
  d.setHours(time?time.h:defH,time?time.m:defM,0,0);
  return d.toISOString();
}

// Cell value → trimmed string, empty if null/undefined
function cellStr(v:unknown):string{
  if(v==null)return "";
  return String(v).trim();
}

// Vaste kolomposities in het projectimportbestand (alleen projectimport)
const COL_WERKZAAMHEDEN=9;  // Excel kolom J
const COL_PROJECTLEIDER=10; // Excel kolom K

function ExcelImportModal({projects,employees,onImport,onClose}:{
  projects:Project[];employees:Employee[];
  onImport:(rows:ImportRow[])=>void;onClose:()=>void;
}){
  const [preview,setPreview]=useState<ImportPreview|null>(null);
  const [step,setStep]=useState<"upload"|"preview">("upload");
  const [loading,setLoading]=useState(false);
  const [parseError,setParseError]=useState<string>("");
  const fileRef=useRef<HTMLInputElement>(null);

  const parseFile=(file:File)=>{
    setLoading(true);
    setParseError("");
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const wb=XLSX.read(ev.target?.result,{type:"array",cellDates:false,raw:true});
        const ws=wb.Sheets[wb.SheetNames[0]];
        // Read as array-of-arrays to preserve column positions (handles duplicate headers)
        const raw=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:null,raw:true});

        // ── Find header row ──────────────────────────────────────────────────
        // Look for the row containing "Projectnr." (case-insensitive, trimmed)
        let headerRowIdx=-1;
        for(let i=0;i<Math.min(raw.length,30);i++){
          const row=raw[i] as unknown[];
          if(row.some(c=>cellStr(c).toLowerCase().replace(/\s/g,"").replace(/\.$/,"")
              .match(/^projectnr?$/))){
            headerRowIdx=i;break;
          }
        }
        if(headerRowIdx===-1){
          setParseError("Geen headerrij gevonden. Zorg dat de rij met 'Projectnr.' aanwezig is in het bestand.");
          setLoading(false);return;
        }

        const headerRow=(raw[headerRowIdx] as unknown[]).map(h=>cellStr(h).toLowerCase().trim());

        // ── Column index resolution (positional, handles duplicate headers) ──
        // Track first occurrence of "omschrijving" (Projectnaam)
        let omschrijvingCount=0;
        let col_projectnr=-1,col_omschr1=-1,col_opdrachtgever=-1;
        let col_contactpersoon=-1,col_datum_opdracht=-1;
        let col_startdatum=-1,col_einddatum=-1,col_starttijd=-1,col_eindtijd=-1,col_werknr=-1;

        headerRow.forEach((h,i)=>{
          const norm=h.replace(/\s+/g,"").replace(/\.$/,"");
          if(norm==="projectnr"&&col_projectnr===-1)col_projectnr=i;
          else if(h==="omschrijving"){
            omschrijvingCount++;
            if(omschrijvingCount===1)col_omschr1=i;
          }
          else if(norm==="naamopdrachtgever"||norm==="opdrachtgever")col_opdrachtgever=i;
          else if(norm==="contactpersoon")col_contactpersoon=i;
          else if(norm==="datumopdracht")col_datum_opdracht=i;
          else if(norm==="startdatum"&&col_startdatum===-1)col_startdatum=i;
          else if((norm==="einddatum"||norm==="afloopdatum"||norm==="eindedatum")&&col_einddatum===-1)col_einddatum=i;
          else if(norm==="starttijd"&&col_starttijd===-1)col_starttijd=i;
          else if((norm==="eindtijd"||norm==="eindetijd")&&col_eindtijd===-1)col_eindtijd=i;
          else if(norm==="werknr"||norm==="werknummer"||norm==="wnr"||(/werk/.test(norm)&&/(nr|nummer)/.test(norm)))col_werknr=i;
        });



        // Fallback: no dedicated Werknr. column found → scan any header mentioning "werk" + nr/nummer
        if(col_werknr===-1){
          col_werknr=headerRow.findIndex(h=>{
            const n=h.replace(/\s+/g,"").replace(/\./g,"");
            return n!=="projectnr"&&/werk/.test(n)&&/(nr|nummer)/.test(n);
          });
        }


        if(col_projectnr===-1){
          setParseError("Kolom 'Projectnr.' niet gevonden in de headerrij.");
          setLoading(false);return;
        }

        // ── Parse data rows ──────────────────────────────────────────────────
        const existingProjectNumbers=new Set(
          projects.map(p=>normalizeProjectnr(p.projectnr)).filter(Boolean)
        );

        const allRows:ImportRow[]=[];
        const dataRows=raw.slice(headerRowIdx+1);

        dataRows.forEach((rawRow,relIdx)=>{
          const row=rawRow as unknown[];
          // Skip completely empty rows
          if(!row||row.every(c=>c==null||cellStr(c)===""))return;

          const absRow=headerRowIdx+2+relIdx; // 1-based Excel row number

          const projectnr=col_projectnr>=0?cellStr(row[col_projectnr]):"";
          const projectnaam=col_omschr1>=0?cellStr(row[col_omschr1]):"";
          // Kolom J (index 9) = Werkzaamheden én bron voor afdelingsherkenning
          const rawDeptCell=cellStr(row[COL_WERKZAAMHEDEN]);
          const opdrachtgever=col_opdrachtgever>=0?cellStr(row[col_opdrachtgever]):"";
          const contactpersoon=col_contactpersoon>=0?cellStr(row[col_contactpersoon]):"";
          // Kolom K (index 10) = Projectleider
          const calculator=cellStr(row[COL_PROJECTLEIDER]);
          const startdatumRaw=col_startdatum>=0?row[col_startdatum]:null;
          const einddatumRaw=col_einddatum>=0?row[col_einddatum]:null;
          const starttijd=col_starttijd>=0?parseXlTime(row[col_starttijd]):null;
          const eindtijd=col_eindtijd>=0?parseXlTime(row[col_eindtijd]):null;
          const datumOpdrachtRaw=col_datum_opdracht>=0?row[col_datum_opdracht]:null;
          const werknrRaw=col_werknr>=0?cellStr(row[col_werknr]):"";

          // Validation: alleen Projectnr. is verplicht
          let invalidReason="";
          if(!projectnr&&!projectnaam)return; // skip truly blank rows silently
          if(!projectnr)invalidReason=`Rij ${absRow}: Projectnr. ontbreekt`;

          const{afdelingen,turnkey}=resolveDept(rawDeptCell);

          // Start = Startdatum + Starttijd (default 08:00); Eind = Einddatum (of Startdatum) + Eindtijd (default 17:00)
          const startISO=combineDT(parseXlDate(startdatumRaw as string|number|null),starttijd,8,0);
          const eindBase=parseXlDate(einddatumRaw as string|number|null)||parseXlDate(startdatumRaw as string|number|null);
          const eindISO=combineDT(eindBase,eindtijd,17,0);

          allRows.push({
            projectnr,
            projectnaam:projectnaam||projectnr,

            opdrachtgever,
            contactpersoon,
            projectleider:calculator,
            startdatum:startISO,
            einddatum:eindISO,
            datumOpdracht:parseXlDate(datumOpdrachtRaw as string|number|null),
            werknummer:werknrRaw||projectnr,
            werkzaamheden:rawDeptCell,
            rawDept:rawDeptCell,
            afdelingen,
            turnkey,
            rowIndex:absRow,
            invalidReason,
          });
        });

        const ongeldig=allRows.filter(r=>r.invalidReason);
        const valid=allRows.filter(r=>!r.invalidReason&&r.projectnr);
        const nieuw=valid.filter(r=>!existingProjectNumbers.has(normalizeProjectnr(r.projectnr)));
        const bestaand=valid.filter(r=>existingProjectNumbers.has(normalizeProjectnr(r.projectnr)));

        setPreview({nieuw,bestaand,ongeldig,total:allRows.length});
        setStep("preview");
      }catch(err){
        console.error(err);
        setParseError("Fout bij het lezen van het bestand. Zorg dat het een geldig .xlsx of .xls bestand is.");
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport=()=>{if(!preview)return;onImport([...preview.nieuw,...preview.bestaand]);};

  const DEPT_LABELS:Record<string,string>={
    Stoffering:"Stof",Schilderwerk:"Schilder",Zonwering:"Zon",
  };

  return <Modal title="Excel importeren" onClose={onClose} width="max-w-2xl">
    <div className="p-4 md:p-6 space-y-4">
      {step==="upload"&&<>
        <p className="text-sm text-[#6B7A99]">Upload uw originele Excel-bestand. De importer leest de kolommen op positie — u hoeft niets te hernoemen of te herordenen.</p>
        <div className="border-2 border-dashed border-[rgba(26,39,68,0.15)] rounded-xl p-8 text-center hover:border-[#0ABFB8] transition-colors cursor-pointer" onClick={()=>fileRef.current?.click()}>
          <Table2 className="w-10 h-10 text-[#6B7A99] mx-auto mb-3"/>
          <p className="text-sm font-semibold text-[#1A2744] mb-1">Klik om Excel-bestand te selecteren</p>
          <p className="text-xs text-[#B8C3D9]">.xlsx, .xls</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e=>{if(e.target.files?.[0])parseFile(e.target.files[0]);}}/>
        </div>
        {loading&&<p className="text-center text-sm text-[#6B7A99]">Bestand verwerken...</p>}
        {parseError&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{parseError}</div>}
        <div className="bg-[#F0F3F8] rounded-xl p-4 space-y-3 text-xs">
          <p className="font-semibold text-[#6B7A99] uppercase tracking-wide">Verwachte kolommen</p>
          <table className="w-full text-left text-[#6B7A99]">
            <thead><tr className="border-b border-[rgba(26,39,68,0.1)]"><th className="py-1 font-semibold text-[#1A2744]">Excel kolom</th><th className="py-1 font-semibold text-[#1A2744]">Veld</th><th className="py-1 font-semibold text-[#1A2744]">Verplicht</th></tr></thead>
            <tbody className="divide-y divide-[rgba(26,39,68,0.06)]">
              {[
                ["Projectnr.","Projectnummer","✓"],
                ["Omschrijving (1e kolom)","Projectnaam","✓"],
                ["Naam opdrachtgever","Opdrachtgever",""],
                ["Contactpersoon","Contactpersoon",""],
                ["Kolom K (index 10)","Calculator",""],
                ["Datum opdracht","Datum opdracht",""],
                ["Startdatum / Start datum","Startdatum (standaard 08:00)",""],
                ["Einddatum / Afloopdatum","Einddatum (standaard 17:00)",""],
                ["Starttijd / Eindtijd","Tijd bij start-/einddatum",""],
                ["Werknr.","Werknummer",""],
                ["Omschrijving (2e kolom, na S code)","Afdeling / type",""],
              ].map(([col,veld,req])=><tr key={col}><td className="py-1 font-mono">{col}</td><td className="py-1">{veld}</td><td className="py-1 text-[#0ABFB8] font-bold">{req}</td></tr>)}
            </tbody>
          </table>
          <div className="flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2">
            <span className="text-amber-500 flex-shrink-0 font-bold">★</span>
            <p className="text-amber-700"><strong>Turnkey</strong> = alle 3 afdelingen. <strong>Combinatie</strong> = meerdere afdelingen. <strong>Schilderwerk binnen/buiten</strong>, <strong>Stoffering klein/groot</strong>, <strong>Zonwering binnen/buiten</strong> worden automatisch herkend.</p>
          </div>
        </div>
      </>}
      {step==="preview"&&preview&&<>
        <div className="grid grid-cols-4 gap-2 md:gap-3">
          <div className="bg-[#F0F3F8] rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-[#1A2744]">{preview.total}</p>
            <p className="text-[10px] text-[#6B7A99] font-medium">Rijen gelezen</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-emerald-700">{preview.nieuw.length}</p>
            <p className="text-[10px] text-emerald-600 font-medium">Nieuw</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-amber-700">{preview.bestaand.length}</p>
            <p className="text-[10px] text-amber-600 font-medium">Wordt bijgewerkt</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-red-700">{preview.ongeldig.length}</p>
            <p className="text-[10px] text-red-600 font-medium">Ongeldig</p>
          </div>
        </div>
        {preview.nieuw.length>0&&<div>
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-2">Te importeren ({preview.nieuw.length})</p>
          <div className="max-h-52 overflow-y-auto space-y-1.5">
            {preview.nieuw.map((r,i)=><div key={i} className="flex items-center gap-2 p-2.5 bg-emerald-50 rounded-lg text-xs flex-wrap">
              <span className="font-mono text-emerald-700 flex-shrink-0 min-w-12">{r.projectnr}</span>
              <span className="font-medium text-[#1A2744] flex-1 min-w-0 truncate">{r.projectnaam}</span>
              {r.opdrachtgever&&<span className="text-[#6B7A99] truncate max-w-28">{r.opdrachtgever}</span>}
              {r.projectleider&&<span className="text-[#6B7A99] italic truncate max-w-20">{r.projectleider}</span>}
              {r.turnkey
                ?<span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white flex-shrink-0" style={{background:"linear-gradient(90deg,#0ABFB8 33%,#FF6B5B 33% 66%,#F5A623 66%)"}}>Turnkey</span>
                :<span className="flex gap-0.5 flex-shrink-0">{r.afdelingen.map(a=><span key={a} className="w-2 h-2 rounded-full" style={{backgroundColor:DEFAULT_DC[a].bg}} title={a}/>)}</span>
              }
              {r.startdatum&&<span className="text-[#B8C3D9] flex-shrink-0">{fmtDate(r.startdatum)}</span>}
            </div>)}
          </div>
        </div>}
        {preview.bestaand.length>0&&<div>
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-2">Wordt bijgewerkt ({preview.bestaand.length})</p>
          <div className="max-h-28 overflow-y-auto space-y-1">
            {preview.bestaand.map((r,i)=><div key={i} className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg text-xs">
              <span className="font-mono text-amber-700 flex-shrink-0">{r.projectnr}</span>
              <span className="text-[#6B7A99] truncate">{r.projectnaam}</span>
            </div>)}
          </div>
        </div>}
        {preview.ongeldig.length>0&&<div>
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-2">Ongeldig — niet geïmporteerd ({preview.ongeldig.length})</p>
          <div className="max-h-28 overflow-y-auto space-y-1">
            {preview.ongeldig.map((r,i)=><div key={i} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg text-xs">
              <span className="text-red-500 font-mono flex-shrink-0">R{r.rowIndex}</span>
              <span className="text-red-700">{r.invalidReason}</span>
            </div>)}
          </div>
        </div>}
        <div className="flex gap-2 justify-between pt-2 border-t border-[rgba(26,39,68,0.08)]">
          <Btn variant="secondary" onClick={()=>{setStep("upload");setPreview(null);setParseError("");}}>Terug</Btn>
          <Btn onClick={handleImport} disabled={preview.nieuw.length+preview.bestaand.length===0}>
            <Download className="w-4 h-4"/>
            {preview.nieuw.length+preview.bestaand.length} project{preview.nieuw.length+preview.bestaand.length!==1?"en":""} importeren
          </Btn>
        </div>
      </>}
    </div>
  </Modal>;
}

// ===== VACATION IMPORT MODAL =====
interface VacRow {
  rowIndex:number;
  rawName:string;
  matchedEmployee:Employee|null;
  ambiguous:boolean;
  startDate:string;       // YYYY-MM-DD
  endDate:string;         // YYYY-MM-DD
  startTime:string;       // HH:MM
  endTime:string;         // HH:MM
  hasExplicitTimes:boolean;
  status:AvailStatus;
  note:string;
  invalidReason:string;
  conflicts:{date:string;project:Project}[];
  duplicateDates:string[];
  entriesToCreate:AvailEntry[];
}
interface VacPreview { total:number; rows:VacRow[]; }

function parseTimeCell(raw:unknown):string{
  if(raw==null||raw==="")return "";
  const s=String(raw).trim();
  // Excel time serial (fraction of a day, 0.5 = 12:00)
  const n=Number(s.replace(",","."));
  if(!isNaN(n)&&n>0&&n<1){
    const totalMin=Math.round(n*1440);
    return fmtHM(Math.floor(totalMin/60),totalMin%60);
  }
  // "HH:MM" or "H:MM" or "HH.MM"
  const m=/^(\d{1,2})[:\.](\d{2})/.exec(s);
  if(m)return fmtHM(parseInt(m[1]),parseInt(m[2]));
  return "";
}
function mapVacStatus(raw:string):AvailStatus{
  const s=raw.toLowerCase().trim();
  if(!s)return "Beschikbaar";
  if(s.includes("niet beschikbaar")||s.includes("unavail")||s.includes("afwezig"))return "Niet beschikbaar";
  if(s.includes("ingepland")||s.includes("planned")||s.includes("gepland"))return "Ingepland";
  if(s.includes("beschikbaar")||s.includes("available"))return "Beschikbaar";
  if(s.includes("vakantie")||s.includes("holiday")||s.includes("leave")||s.includes("verlof"))return "Vakantie";
  if(s.includes("ziek")||s.includes("sick")||s.includes("ill")||s.includes("arbeidsongeschikt"))return "Ziek";
  if(s.includes("vrij")||s.includes("free")||s.includes("rtvz"))return "Vrij";
  return "Vakantie";
}


function VacationImportModal({employees,projects,availability,onImport,onClose}:{
  employees:Employee[];projects:Project[];availability:AvailEntry[];
  onImport:(entries:AvailEntry[])=>void;onClose:()=>void;
}){
  const [step,setStep]=useState<"upload"|"preview">("upload");
  const [preview,setPreview]=useState<VacPreview|null>(null);
  const [loading,setLoading]=useState(false);
  const [parseError,setParseError]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);

  const matchEmployee=(name:string):{emp:Employee|null;ambiguous:boolean}=>{
    if(!name.trim())return{emp:null,ambiguous:false};
    const q=name.trim().toLowerCase();
    const hits=employees.filter(e=>e.naam.toLowerCase()===q);
    if(hits.length===1)return{emp:hits[0],ambiguous:false};
    if(hits.length>1)return{emp:null,ambiguous:true};
    // partial match
    const partials=employees.filter(e=>e.naam.toLowerCase().includes(q)||q.includes(e.naam.toLowerCase()));
    if(partials.length===1)return{emp:partials[0],ambiguous:false};
    if(partials.length>1)return{emp:null,ambiguous:true};
    return{emp:null,ambiguous:false};
  };

  const buildEntries=(emp:Employee,startDate:string,endDate:string,startTime:string,endTime:string,status:AvailStatus,note:string):AvailEntry[]=>{
    const dates=getDatesInRange(new Date(startDate+"T12:00"),new Date(endDate+"T12:00"));
    return dates.map(ds=>({
      id:`vac-${emp.id}-${ds}-${startTime}-${endTime}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      employeeId:emp.id,date:ds,startTime,endTime,status,note:note||status,
    }));
  };

  const isDuplicate=(e:AvailEntry):boolean=>
    availability.some(a=>a.employeeId===e.employeeId&&a.date===e.date&&a.startTime===e.startTime&&a.endTime===e.endTime&&a.status===e.status&&!a.projectId);

  const findConflicts=(emp:Employee,startDate:string,endDate:string):{date:string;project:Project}[]=>{
    const dates=getDatesInRange(new Date(startDate+"T12:00"),new Date(endDate+"T12:00"));
    const out:{date:string;project:Project}[]=[];
    dates.forEach(ds=>{
      // Check project-linked avail entries
      availability.filter(a=>a.employeeId===emp.id&&a.date===ds&&a.projectId).forEach(a=>{
        const proj=projects.find(p=>p.id===a.projectId);
        if(proj&&!out.some(c=>c.date===ds&&c.project.id===proj.id))out.push({date:ds,project:proj});
      });
      // Check project date ranges
      const d=new Date(ds+"T12:00");
      projects.forEach(p=>{
        if(!p.medewerkers.includes(emp.id))return;
        const ps=new Date(p.startdatum);ps.setHours(0,0,0,0);
        const pe=new Date(p.afloopdatum);pe.setHours(23,59,59,999);
        if(d>=ps&&d<=pe&&!out.some(c=>c.date===ds&&c.project.id===p.id))out.push({date:ds,project:p});
      });
    });
    return out;
  };

  const parseFile=(file:File)=>{
    setLoading(true);setParseError("");
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const wb=XLSX.read(ev.target?.result,{type:"array",cellDates:false,raw:true});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const raw=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:null,raw:true});

        // Find header row: look for row containing "medewerker", "naam" or "startdatum"
        let headerIdx=-1;
        for(let i=0;i<Math.min(raw.length,20);i++){
          const row=raw[i] as unknown[];
          const cells=row.map(c=>cellStr(c).toLowerCase());
          if(cells.some(c=>c==="medewerker"||c==="naam"||c.includes("startdatum"))){headerIdx=i;break;}
        }
        if(headerIdx===-1){
          // Try looser: any row with "naam" somewhere
          for(let i=0;i<Math.min(raw.length,20);i++){
            const row=raw[i] as unknown[];
            if(row.some(c=>cellStr(c).toLowerCase().includes("naam"))){headerIdx=i;break;}
          }
        }
        if(headerIdx===-1){setParseError("Geen headerrij gevonden. Voeg een rij toe met 'Medewerker', 'Naam' of 'Startdatum'.");setLoading(false);return;}

        const headers=(raw[headerIdx] as unknown[]).map(h=>cellStr(h).toLowerCase().trim());
        const ci=(names:string[])=>{for(const n of names){const i=headers.indexOf(n);if(i>=0)return i;}return -1;};
        const colNaam=ci(["medewerker","naam","name","employee","werknemer"]);
        const colStart=ci(["startdatum","start datum","start","van"]);
        const colEind=ci(["einddatum","eind datum","eind","end","tot","t/m"]);
        const colStartT=ci(["starttijd","start tijd","begintijd","van tijd","time start"]);
        const colEindT=ci(["eindtijd","eind tijd","eindigd","tot tijd","time end"]);
        const colType=ci(["type","reden","status","soort","categorie"]);
        const colNote=ci(["notitie","opmerking","note","toelichting"]);

        if(colNaam===-1&&colStart===-1){setParseError("Kolommen 'Medewerker/Naam' en 'Startdatum' niet gevonden in de header.");setLoading(false);return;}

        const rows:VacRow[]=[];
        raw.slice(headerIdx+1).forEach((rawRow,relIdx)=>{
          const row=rawRow as unknown[];
          if(!row||row.every(c=>c==null||cellStr(c)===""))return;
          const absRow=headerIdx+2+relIdx;

          const rawName=colNaam>=0?cellStr(row[colNaam]):"";
          const rawStart=colStart>=0?row[colStart]:null;
          const rawEind=colEind>=0?row[colEind]:null;
          const rawStartT=colStartT>=0?row[colStartT]:null;
          const rawEindT=colEindT>=0?row[colEindT]:null;
          const rawType=colType>=0?cellStr(row[colType]):"";
          const rawNote=colNote>=0?cellStr(row[colNote]):"";

          const startISO=parseXlDate(rawStart as string|number|null);
          const eindISO=parseXlDate(rawEind as string|number|null)||startISO;
          const startTime=parseTimeCell(rawStartT)||"08:00";
          const endTime=parseTimeCell(rawEindT)||"17:00";
          const hasExplicitTimes=!!(parseTimeCell(rawStartT)||parseTimeCell(rawEindT));
          const status=mapVacStatus(rawType);
          const note=rawNote;

          let invalidReason="";
          if(!rawName&&colNaam>=0)invalidReason=`Rij ${absRow}: Medewerker naam ontbreekt`;
          else if(!startISO)invalidReason=`Rij ${absRow}: Startdatum ontbreekt of ongeldig`;

          const startDate=startISO?startISO.split("T")[0]:"";
          const endDate=eindISO?eindISO.split("T")[0]:startDate;

          const{emp,ambiguous}=matchEmployee(rawName);
          let conflicts:{date:string;project:Project}[]=[];
          let duplicateDates:string[]=[];
          let entriesToCreate:AvailEntry[]=[];

          if(!invalidReason&&emp&&startDate){
            const allEntries=buildEntries(emp,startDate,endDate,startTime,endTime,status,note);
            entriesToCreate=allEntries.filter(e=>!isDuplicate(e));
            duplicateDates=allEntries.filter(e=>isDuplicate(e)).map(e=>e.date);
            conflicts=findConflicts(emp,startDate,endDate);
          }

          rows.push({rowIndex:absRow,rawName,matchedEmployee:emp,ambiguous,startDate,endDate,startTime,endTime,hasExplicitTimes,status,note,invalidReason,conflicts,duplicateDates,entriesToCreate});
        });

        setPreview({total:rows.length,rows});
        setStep("preview");
      }catch(err){console.error(err);setParseError("Fout bij het lezen van het bestand.");}
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport=()=>{
    if(!preview)return;
    const all=preview.rows.flatMap(r=>r.matchedEmployee&&!r.ambiguous&&!r.invalidReason?r.entriesToCreate:[]);
    onImport(all);
  };

  if(!preview||step==="upload")return <Modal title="Beschikbaarheid importeren" onClose={onClose} width="max-w-xl">
    <div className="p-4 md:p-6 space-y-4">
      <p className="text-sm text-[#6B7A99]">Upload een Excel-bestand met beschikbaarheid (vakantie, ziek, vrij, beschikbaar…). Bestaande planning wordt <strong>niet</strong> overschreven.</p>

      <div className="border-2 border-dashed border-[rgba(26,39,68,0.15)] rounded-xl p-8 text-center hover:border-[#0ABFB8] transition-colors cursor-pointer" onClick={()=>fileRef.current?.click()}>
        <Calendar className="w-10 h-10 text-[#6B7A99] mx-auto mb-3"/>
        <p className="text-sm font-semibold text-[#1A2744] mb-1">Klik om Excel-bestand te selecteren</p>
        <p className="text-xs text-[#B8C3D9]">.xlsx, .xls</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>{if(e.target.files?.[0])parseFile(e.target.files[0]);}}/>
      </div>
      {loading&&<p className="text-center text-sm text-[#6B7A99]">Bestand verwerken...</p>}
      {parseError&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{parseError}</div>}
      <div className="bg-[#F0F3F8] rounded-xl p-4 text-xs space-y-2">
        <p className="font-semibold text-[#6B7A99] uppercase tracking-wide">Verwachte kolommen</p>
        <table className="w-full text-left text-[#6B7A99]">
          <tbody className="divide-y divide-[rgba(26,39,68,0.06)]">
            {[["Medewerker / Naam","Naam medewerker","✓"],["Startdatum","Eerste dag","✓"],["Einddatum","Laatste dag",""],["Starttijd","Begin (HH:MM)",""],["Eindtijd","Einde (HH:MM)",""],["Status / Type","Beschikbaar, Ingepland, Niet beschikbaar, Vakantie, Ziek, Vrij",""],["Notitie","Vrije tekst",""]].map(([col,desc,req])=>
              <tr key={col}><td className="py-1 font-mono pr-2">{col}</td><td className="py-1 text-[#B8C3D9]">{desc}</td><td className="py-1 text-[#0ABFB8] font-bold">{req}</td></tr>
            )}
          </tbody>
        </table>
        <p className="text-[#B8C3D9] pt-1">Als Einddatum ontbreekt → alleen Startdatum. Zonder tijden → volledige werkdag (08:00–17:00).</p>
      </div>
    </div>
  </Modal>;

  // Preview step
  const validRows=preview.rows.filter(r=>!r.invalidReason&&r.matchedEmployee&&!r.ambiguous);
  const totalNew=validRows.reduce((s,r)=>s+r.entriesToCreate.length,0);
  const totalDup=validRows.reduce((s,r)=>s+r.duplicateDates.length,0);
  const conflictRows=validRows.filter(r=>r.conflicts.length>0);
  const unmatchedRows=preview.rows.filter(r=>!r.invalidReason&&(!r.matchedEmployee||r.ambiguous));
  const invalidRows=preview.rows.filter(r=>!!r.invalidReason);

  return <Modal title="Beschikbaarheid importeren — preview" onClose={onClose} width="max-w-2xl">
    <div className="p-4 md:p-6 space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[{label:"Rijen gelezen",val:preview.total,cls:"bg-[#F0F3F8] text-[#1A2744]"},{label:"Nieuw aan te maken",val:totalNew,cls:"bg-emerald-50 text-emerald-700"},{label:"Al bestaand",val:totalDup,cls:"bg-amber-50 text-amber-700"},{label:"Conflicten",val:conflictRows.length,cls:conflictRows.length?"bg-red-50 text-red-700":"bg-[#F0F3F8] text-[#6B7A99]"}].map(s=>
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.cls}`}>
            <p className="text-xl font-bold">{s.val}</p>
            <p className="text-[10px] font-medium mt-0.5">{s.label}</p>
          </div>
        )}
      </div>

      {/* Import rows */}
      {validRows.length>0&&<div>
        <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-2">Te importeren ({validRows.length} medewerkers)</p>
        <div className="max-h-56 overflow-y-auto space-y-1.5">
          {validRows.map((r,i)=><div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg text-xs flex-wrap ${r.conflicts.length?"bg-amber-50 border border-amber-200":"bg-emerald-50"}`}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{backgroundColor:DEFAULT_DC[r.matchedEmployee!.afdeling].bg}}>{r.matchedEmployee!.naam.slice(0,1)}</div>
            <span className="font-medium text-[#1A2744] flex-shrink-0">{r.matchedEmployee!.naam}</span>
            <span className="text-[#6B7A99]">{fmtDate(r.startDate)}{r.endDate!==r.startDate&&` – ${fmtDate(r.endDate)}`}</span>
            {r.hasExplicitTimes&&<span className="text-[#6B7A99]">{r.startTime}–{r.endTime}</span>}
            <span className="px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 text-[10px]" style={{backgroundColor:AS[r.status].bg,color:AS[r.status].text}}>{r.status}</span>
            {r.entriesToCreate.length>0&&<span className="text-emerald-600 font-semibold flex-shrink-0">+{r.entriesToCreate.length} dag{r.entriesToCreate.length!==1?"en":""}</span>}
            {r.duplicateDates.length>0&&<span className="text-amber-600 flex-shrink-0">{r.duplicateDates.length}× al bestaand</span>}
            {r.conflicts.length>0&&<span className="text-amber-700 font-semibold flex-shrink-0">⚠ {r.conflicts.length} conflict{r.conflicts.length!==1?"en":""}</span>}
          </div>)}
        </div>
      </div>}

      {/* Conflicts */}
      {conflictRows.length>0&&<div>
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">⚠ Conflicten — projectplanning overlapt</p>
        <div className="max-h-40 overflow-y-auto space-y-1.5 bg-amber-50 rounded-xl p-3">
          {conflictRows.flatMap(r=>r.conflicts.map((c,ci)=><div key={`${r.rowIndex}-${ci}`} className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#1A2744] flex-shrink-0">{r.matchedEmployee!.naam}</span>
            <span className="text-[#6B7A99]">·</span>
            <span className="text-[#1A2744] truncate">{c.project.projectnaam}</span>
            <span className="text-[#6B7A99] font-mono flex-shrink-0">{c.project.werknummer}</span>
            <span className="text-amber-700 flex-shrink-0">{fmtDate(c.date)}</span>
          </div>))}
          <p className="text-[10px] text-amber-600 pt-1">De projectplanning wordt <strong>niet</strong> verwijderd. De vakantie wordt naast de bestaande planning toegevoegd.</p>
        </div>
      </div>}

      {/* Unmatched */}
      {unmatchedRows.length>0&&<div>
        <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-2">Niet gevonden ({unmatchedRows.length})</p>
        <div className="max-h-24 overflow-y-auto space-y-1">
          {unmatchedRows.map((r,i)=><div key={i} className="flex items-center gap-2 p-2 bg-[#F0F3F8] rounded-lg text-xs">
            <span className="font-mono text-[#6B7A99]">R{r.rowIndex}</span>
            <span className="font-medium text-[#1A2744]">"{r.rawName}"</span>
            <span className="text-[#6B7A99]">{r.ambiguous?"Meerdere medewerkers gevonden — specificeer in Excel":"Medewerker niet gevonden"}</span>
          </div>)}
        </div>
      </div>}

      {/* Invalid */}
      {invalidRows.length>0&&<div>
        <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-2">Ongeldig ({invalidRows.length})</p>
        <div className="max-h-24 overflow-y-auto space-y-1">
          {invalidRows.map((r,i)=><div key={i} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg text-xs">
            <span className="text-red-500 font-mono flex-shrink-0">R{r.rowIndex}</span>
            <span className="text-red-700">{r.invalidReason}</span>
          </div>)}
        </div>
      </div>}

      <div className="flex gap-2 justify-between pt-2 border-t border-[rgba(26,39,68,0.08)]">
        <Btn variant="secondary" onClick={()=>{setStep("upload");setPreview(null);setParseError("");}}>Terug</Btn>
        <Btn onClick={handleImport} disabled={totalNew===0}>
          <Check className="w-4 h-4"/>
          {totalNew} tijdblok{totalNew!==1?"ken":""} importeren
        </Btn>
      </div>
    </div>
  </Modal>;
}

// ===== PROJECT FORM =====
function ProjectForm({initial,employees,projects,availability,onSave,onCancel}:{
  initial:Partial<Project>;employees:Employee[];projects:Project[];availability:AvailEntry[];
  onSave:(p:Project)=>void;onCancel:()=>void;
}){
  const dc=useDC();
  const isEdit=!!initial.id;
  const [f,setF]=useState<Project>({
    id:initial.id||nid(),werknummer:initial.werknummer||nextWN(projects),
    projectnaam:initial.projectnaam||"",opdrachtgever:initial.opdrachtgever||"",
    adres:initial.adres||"",
    plaats:initial.plaats||"",afdeling:initial.afdeling||"Stoffering",
    afdelingen:initial.afdelingen||[initial.afdeling||"Stoffering"],
    projectleider:initial.projectleider||"",werkzaamheden:initial.werkzaamheden||"",
    startdatum:initial.startdatum||combineLocalDT(toDateStr(new Date()),"08:00",8,0),
    afloopdatum:initial.afloopdatum||combineLocalDT(toDateStr(new Date()),"17:00",17,0),
    medewerkers:initial.medewerkers||[],status:initial.status||"Offerte",
    notities:initial.notities||"",uurprijs:initial.uurprijs||65,uren:initial.uren||8,
    benodigdeMedewerkers:initial.benodigdeMedewerkers??1,
    region:initial.region||"",
  });
  const [assignAfd,setAssignAfd]=useState<Afdeling>(f.afdeling);
  const [assignComps,setAssignComps]=useState<string[]>([]);
  // Losse datum-/tijdvelden; ze schrijven altijd naar dezelfde projectvelden
  // (startdatum / afloopdatum) die de agenda gebruikt.
  const [sDate,setSDate]=useState(()=>datePart(f.startdatum));
  const [sTime,setSTime]=useState(()=>timePart(f.startdatum)||"08:00");
  const [eDate,setEDate]=useState(()=>datePart(f.afloopdatum));
  const [eTime,setETime]=useState(()=>timePart(f.afloopdatum)||"17:00");
  const applyDates=(sd:string,st:string,ed:string,et:string)=>{
    const startISO=combineLocalDT(sd,st,8,0);
    const endISO=combineLocalDT(ed||sd,et,17,0);
    setF(prev=>({...prev,startdatum:startISO,afloopdatum:endISO}));
  };
  const setStart=(d:string,t:string)=>{
    setSDate(d);setSTime(t);
    applyDates(d,t,eDate,eTime);
  };
  const setEnd=(d:string,t:string)=>{setEDate(d);setETime(t);applyDates(sDate,sTime,d,t);};
  const set=(k:keyof Project,v:unknown)=>setF(prev=>({...prev,[k]:v}));

  const toggleAfdeling=(afd:Afdeling)=>{
    setF(prev=>{
      const cur=prev.afdelingen||[prev.afdeling];
      const next=cur.includes(afd)?cur.filter(a=>a!==afd):[...cur,afd];
      const primary=next.length>0?next[0]:afd;
      return{...prev,afdelingen:next.length?next:[afd],afdeling:primary};
    });
  };

  const toggleMed=(id:string)=>setF(prev=>({...prev,medewerkers:prev.medewerkers.includes(id)?prev.medewerkers.filter(x=>x!==id):[...prev.medewerkers,id]}));
  const handleAssignAfdChange=(afd:Afdeling)=>{setAssignAfd(afd);setAssignComps([]);};
  const valid=f.projectnaam&&f.opdrachtgever&&f.afdelingen?.length;
  const afdComps=[...new Set(employees.filter(e=>e.afdeling===assignAfd).flatMap(e=>e.competenties))].sort();
  const projStart=new Date(f.startdatum);const projEnd=new Date(f.afloopdatum);
  const isEmpAvail=(emp:Employee):{ok:boolean;reason?:string}=>{
    const blocking=["Niet beschikbaar","Vakantie","Ziek","Vrij"];
    for(const av of availability.filter(a=>a.employeeId===emp.id)){
      if(av.projectId===f.id)continue;
      const bs=new Date(av.date+"T"+av.startTime);const be=new Date(av.date+"T"+av.endTime);
      if(bs<projEnd&&be>projStart){
        if(blocking.includes(av.status))return{ok:false,reason:av.status};
        if(av.status==="Ingepland"&&av.projectId)return{ok:false,reason:av.note||"Ingepland"};
      }
    }
    for(const p of projects){
      if(p.id!==f.id&&p.medewerkers.includes(emp.id)){
        if(new Date(p.startdatum)<projEnd&&new Date(p.afloopdatum)>projStart)return{ok:false,reason:p.projectnaam.slice(0,18)};
      }
    }
    return{ok:true};
  };
  const candidateEmps=employees.filter(e=>e.afdeling===assignAfd&&(assignComps.length===0||assignComps.every(c=>e.competenties.includes(c))));
  const availableEmps=candidateEmps.map(emp=>({emp,av:isEmpAvail(emp)}));
  const curAfds=f.afdelingen||[f.afdeling];

  return <div className="p-4 md:p-6 space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Input label="Werknaam" value={f.projectnaam} onChange={v=>set("projectnaam",v)} required placeholder="Naam van het werk"/>
      <Input label="Werknummer" value={f.werknummer} onChange={v=>set("werknummer",v)} placeholder="2025-001"/>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <Input label="Opdrachtgever" value={f.opdrachtgever} onChange={v=>set("opdrachtgever",v)} required placeholder="Naam opdrachtgever"/>
      <Input label="Adres" value={f.adres||""} onChange={v=>set("adres",v)} placeholder="Straatnaam + huisnummer"/>
      <Input label="Plaats" value={f.plaats} onChange={v=>set("plaats",v)} placeholder="Locatie"/>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <div>
        <label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">Afdeling(en)<span className="text-[#FF6B5B] ml-0.5">*</span></label>
        <div className="flex gap-2 flex-wrap">
          {AFDS.map(a=><button key={a} type="button" onClick={()=>toggleAfdeling(a)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${curAfds.includes(a)?"text-white border-transparent":"border-[rgba(26,39,68,0.15)] text-[#6B7A99] hover:border-[#6B7A99]"}`} style={curAfds.includes(a)?{backgroundColor:dc[a].bg}:{}}>{curAfds.includes(a)&&<Check className="w-3 h-3 inline mr-1"/>}{a}</button>)}
        </div>
      </div>
      <Input label="Calculator" value={plName(f as Project,employees)} onChange={v=>set("projectleider",v)} placeholder="Naam calculator"/>
      <Select label="Status" value={f.status} onChange={v=>set("status",v as ProjectStatus)} options={STATS.map(s=>({value:s,label:s}))}/>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <Input label="Regio / Vestiging" value={f.region||""} onChange={v=>set("region",v)} placeholder="bijv. West, Noord, Zuid"/>
      <div className="grid grid-cols-2 gap-2">
        <Input label="Startdatum" value={sDate} onChange={v=>setStart(v,sTime)} type="date" required/>
        <Input label="Starttijd" value={sTime} onChange={v=>setStart(sDate,v)} type="time"/>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input label="Einddatum" value={eDate} onChange={v=>setEnd(v,eTime)} type="date"/>
        <Input label="Eindtijd" value={eTime} onChange={v=>setEnd(eDate,v)} type="time"/>
      </div>
    </div>
    <Textarea label="Werkzaamheden" value={f.werkzaamheden} onChange={v=>set("werkzaamheden",v)} rows={3} placeholder="Omschrijving van de werkzaamheden..."/>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Input label="Benodigde medewerkers" value={String(f.benodigdeMedewerkers??1)} onChange={v=>set("benodigdeMedewerkers",Math.max(1,parseInt(v)||1))} type="number"/>
    </div>
    <div className="border border-[rgba(26,39,68,0.1)] rounded-xl overflow-hidden">
      <div className="bg-[#F0F3F8] px-4 py-2.5 border-b border-[rgba(26,39,68,0.1)]">
        <span className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Medewerkers toewijzen</span>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-2">1. Afdeling</p>
          <div className="flex gap-2">
            {AFDS.map(a=><button key={a} type="button" onClick={()=>handleAssignAfdChange(a)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${assignAfd===a?"text-white border-transparent":"border-[rgba(26,39,68,0.15)] text-[#6B7A99] hover:border-[#6B7A99]"}`} style={assignAfd===a?{backgroundColor:dc[a].bg}:{}}>{a}</button>)}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-2">2. Competenties <span className="normal-case font-normal text-[#B8C3D9]">(optioneel)</span></p>
          {afdComps.length===0?<p className="text-xs text-[#B8C3D9]">Geen competenties gevonden.</p>
          :<div className="flex flex-wrap gap-1.5">
            {afdComps.map(c=>{const sel=assignComps.includes(c);return<button key={c} type="button" onClick={()=>setAssignComps(prev=>sel?prev.filter(x=>x!==c):[...prev,c])} className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${sel?"bg-[#1A2744] text-white border-[#1A2744]":"border-[rgba(26,39,68,0.15)] text-[#6B7A99] hover:border-[#1A2744]"}`}>{sel&&<Check className="w-2.5 h-2.5 inline mr-0.5"/>}{c}</button>;})}
          </div>}
        </div>
        <div className="bg-[#F0F3F8] rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
          <Clock className="w-3.5 h-3.5 text-[#6B7A99] flex-shrink-0"/>
          <span className="font-semibold text-[#1A2744]">3. Periode:&nbsp;</span>
          <span className="text-[#6B7A99]">{fmtDate(f.startdatum)} {fmtTime(f.startdatum)} – {fmtDate(f.afloopdatum)} {fmtTime(f.afloopdatum)}</span>
        </div>
        <div>
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-2">4. Beschikbare medewerkers</p>
          {availableEmps.length===0
            ?<p className="text-xs text-[#6B7A99] italic py-1">Geen beschikbare medewerkers gevonden voor deze afdeling, competenties en periode.</p>
            :<div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {availableEmps.map(({emp,av})=>{const sel=f.medewerkers.includes(emp.id);return<button key={emp.id} type="button" onClick={()=>{if(av.ok||sel)toggleMed(emp.id);}} className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${sel?"border-[#0ABFB8] bg-[#E0F7F6]":av.ok?"border-[rgba(26,39,68,0.1)] hover:border-[#0ABFB8] bg-white":"border-[rgba(26,39,68,0.08)] bg-[#F8F9FC] opacity-60"}`}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[emp.afdeling].bg}}>{emp.naam.slice(0,1)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5"><p className="font-semibold text-[#1A2744] text-xs">{emp.naam}</p>{sel&&<Check className="w-3 h-3 text-[#0ABFB8] flex-shrink-0"/>}</div>
                  <p className="text-[10px] text-[#6B7A99] truncate">{emp.functie} · {emp.competenties.join(", ")}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 ${av.ok?"bg-[#D1FAE5] text-[#065F46]":"bg-[#FEE2E2] text-[#991B1B]"}`}>{av.ok?"Beschikbaar":av.reason}</span>
              </button>;})}
            </div>
          }
        </div>
      </div>
    </div>
    <Textarea label="Notities" value={f.notities} onChange={v=>set("notities",v)} rows={2} placeholder="Interne notities..."/>
    <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(26,39,68,0.08)]">
      <Btn variant="secondary" onClick={onCancel}>Annuleren</Btn>
      <Btn onClick={()=>{if(valid)onSave(f);}} disabled={!valid}>{isEdit?"Opslaan":"Werk aanmaken"}</Btn>
    </div>
  </div>;
}

// ===== PROJECT DETAIL =====
type ProjTab="overzicht"|"werkzaamheden"|"planning"|"medewerkers"|"documenten"|"facturatie"|"notities";
function ProjectDetail({project,employees,availability=[],teamColors={},badgeColors={},onEdit,onDelete,onClose}:{
  project:Project;employees:Employee[];availability?:AvailEntry[];teamColors?:Record<string,string>;badgeColors?:Record<string,string>;
  onEdit:()=>void;onDelete:(id:string)=>void;onClose:()=>void;
}){
  const dc=useDC();
  const [tab,setTab]=useState<ProjTab>("overzicht");
  const [notities,setNotities]=useState(project.notities);
  const [docs,setDocs]=useState<string[]>([]);
  const [metaLoaded,setMetaLoaded]=useState(false);
  const [confirmDel,setConfirmDel]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  // Documenten + notities uit de database laden en bij wijziging opslaan
  useEffect(()=>{
    let cancelled=false;
    setMetaLoaded(false);
    loadProjectMeta(project.id).then(m=>{
      if(cancelled)return;
      if(m){setDocs(m.docs||[]);if(m.notities)setNotities(m.notities);}
      setMetaLoaded(true);
    }).catch(()=>setMetaLoaded(true));
    return()=>{cancelled=true;};
  },[project.id]);
  useEffect(()=>{
    if(!metaLoaded)return;
    const t=setTimeout(()=>{
      void loadProjectMeta(project.id).then(prev=>
        saveProjectMeta(project.id,{...EMPTY_META,...(prev||{}),docs,notities}),
      ).catch(()=>{});
    },300);
    return()=>clearTimeout(t);
  },[docs,notities,metaLoaded,project.id]);

  const plNaam=plName(project,employees);
  const meds=employees.filter(e=>project.medewerkers.includes(e.id));
  // Uurprijs en geschatte uren worden bewust niet meer getoond (data blijft in de database)
  const dur=validDate(project.startdatum)&&validDate(project.afloopdatum)?Math.ceil((new Date(project.afloopdatum).getTime()-new Date(project.startdatum).getTime())/86400000):0;
  const tabs:ProjTab[]=["overzicht","werkzaamheden","planning","medewerkers","documenten","facturatie","notities"];
  const tabLabels:Record<ProjTab,string>={overzicht:"Overzicht",werkzaamheden:"Werkzaamheden",planning:"Planning",medewerkers:"Medewerkers",documenten:"Documenten",facturatie:"Facturatie",notities:"Notities"};
  const afds=getAllAfds(project);
  const primaryDc=dc[afds[0]];
  return <Modal title={project.projectnaam} onClose={onClose} width="max-w-3xl">
    <div className="border-b border-[rgba(26,39,68,0.08)]">
      <div className="flex items-center gap-0.5 px-3 md:px-6 pt-2 overflow-x-auto">
        {tabs.map(t=><button key={t} onClick={()=>setTab(t)} className={`px-2.5 md:px-3 py-2 text-xs md:text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${tab===t?"text-[#1A2744] border-b-2 border-[#0ABFB8]":"text-[#6B7A99] hover:text-[#1A2744]"}`}>{tabLabels[t]}</button>)}
      </div>
    </div>
    <div className="p-4 md:p-6">
      {tab==="overzicht"&&<div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap"><DeptBadges afds={afds}/><StatusBadge status={project.status}/></div>
            <p className="text-xl md:text-2xl font-bold text-[#1A2744]">{project.projectnaam}</p>
            <p className="text-[#6B7A99] text-sm">{project.werknummer}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Btn size="sm" variant="secondary" onClick={onEdit}><Pencil className="w-3.5 h-3.5"/><span className="hidden sm:inline">Bewerken</span></Btn>
            <Btn size="sm" variant="danger" onClick={()=>setConfirmDel(true)}><Trash2 className="w-3.5 h-3.5"/><span className="hidden sm:inline">Verwijderen</span></Btn>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          {[["Opdrachtgever",project.opdrachtgever],["Adres",project.adres||project.plaats],["Startdatum",fmtDate(project.startdatum)+" "+fmtTime(project.startdatum)],["Afloopdatum",fmtDate(project.afloopdatum)+" "+fmtTime(project.afloopdatum)],["Duur",`${dur} dag${dur!==1?"en":""}`],["Benodigde medewerkers",`${project.benodigdeMedewerkers??1}`]].map(([k,v])=>
            <div key={k} className="bg-[#F0F3F8] rounded-xl p-3">
              <p className="text-xs text-[#6B7A99] mb-0.5">{k}</p>
              <p className="font-semibold text-[#1A2744] text-sm">{v}</p>
            </div>
          )}
        </div>
        {plNaam&&<div className="flex items-center gap-3 p-3 bg-[#E0F7F6] rounded-xl">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{backgroundColor:primaryDc.bg}}>{plNaam.slice(0,1)}</div>
          <div><p className="font-semibold text-[#1A2744] text-sm">{plNaam}</p><p className="text-xs text-[#6B7A99]">Calculator</p></div>
        </div>}
      </div>}
      {tab==="werkzaamheden"&&<div>
        <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-2">Omschrijving</p>
        <p className="text-[#1A2744] leading-relaxed whitespace-pre-wrap">{project.werkzaamheden||"Geen werkzaamheden omschreven."}</p>
      </div>}
      {tab==="planning"&&<div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 border border-[rgba(26,39,68,0.1)] rounded-xl">
            <p className="text-xs text-[#6B7A99] mb-1">Startdatum</p>
            <p className="font-semibold text-[#1A2744]">{fmtDate(project.startdatum)}</p>
            <p className="text-sm text-[#6B7A99]">{fmtTime(project.startdatum)}</p>
          </div>
          <div className="p-4 border border-[rgba(26,39,68,0.1)] rounded-xl">
            <p className="text-xs text-[#6B7A99] mb-1">Afloopdatum</p>
            <p className="font-semibold text-[#1A2744]">{fmtDate(project.afloopdatum)}</p>
            <p className="text-sm text-[#6B7A99]">{fmtTime(project.afloopdatum)}</p>
          </div>
        </div>
        <div className="p-4 bg-[#F0F3F8] rounded-xl">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-[#6B7A99]">Voortgang</span>
            <span className="font-semibold text-[#1A2744]">{project.status}</span>
          </div>
          <div className="h-2 bg-white rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{width:project.status==="Afgerond"||project.status==="Gefactureerd"?"100%":project.status==="In uitvoering"?"60%":project.status==="Bevestigd"?"30%":"10%",backgroundColor:primaryDc.bg}}/>
          </div>
        </div>
      </div>}
      {tab==="medewerkers"&&<div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold" style={badgeStyle(planStatusOf(project,availability),badgeColors)}>{PLAN_STATUS_LABEL[planStatusOf(project,availability)]}</span>
          <span className="text-xs text-[#6B7A99]">{meds.length} van {benodigd(project)} benodigde medewerkers ingepland</span>
        </div>
        {meds.length===0&&<p className="text-[#6B7A99] text-sm">Geen medewerkers toegewezen.</p>}
        {meds.map(e=>{
          const rows=projectPlans(availability,project.id).filter(a=>a.employeeId===e.id).sort((a,b)=>(a.date+a.startTime).localeCompare(b.date+b.startTime));
          const kleur=rows.length?teamColor(teamKey(project.id,rows[0].date,teamForDay(availability,project.id,rows[0].date)),teamColors):dc[e.afdeling].bg;
          return<div key={e.id} className="flex items-start gap-3 p-3 border border-[rgba(26,39,68,0.08)] rounded-xl" style={{borderLeftColor:kleur,borderLeftWidth:4}}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#1A2744] text-sm">{e.naam}</p>
              <p className="text-xs text-[#6B7A99]">{e.functie}</p>
              {rows.length>0&&<div className="mt-1 space-y-0.5">
                {rows.map(r=><p key={r.id} className="text-xs text-[#6B7A99] font-mono flex items-center gap-1">{fmtDate(r.date)} · {r.startTime}–{r.endTime}{r.isFirstOfDay&&<Star className="w-3 h-3 text-[#F2A65A]" fill="currentColor" aria-label="Als eerste uitvoeren"/>}</p>)}
              </div>}
            </div>
            <DeptBadge afd={e.afdeling}/>
          </div>;
        })}
      </div>}
      {tab==="documenten"&&<div>
        <div className="border-2 border-dashed border-[rgba(26,39,68,0.15)] rounded-xl p-8 text-center mb-4 hover:border-[#0ABFB8] transition-colors cursor-pointer" onClick={()=>fileRef.current?.click()}>
          <Upload className="w-8 h-8 text-[#6B7A99] mx-auto mb-2"/>
          <p className="text-sm text-[#6B7A99]">Klik om bestanden te uploaden</p>
          <p className="text-xs text-[#B8C3D9] mt-1">PDF, Word, Excel, afbeeldingen</p>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e=>{if(e.target.files)setDocs(prev=>[...prev,...Array.from(e.target.files!).map(f=>f.name)]);}}/>
        </div>
        {docs.map((d,i)=><div key={i} className="flex items-center gap-3 p-2.5 border border-[rgba(26,39,68,0.08)] rounded-lg mb-2">
          <FileText className="w-4 h-4 text-[#0ABFB8]"/>
          <span className="flex-1 text-sm text-[#1A2744]">{d}</span>
          <button onClick={()=>setDocs(prev=>prev.filter((_,j)=>j!==i))} className="text-[#6B7A99] hover:text-[#FF6B5B]"><X className="w-3.5 h-3.5"/></button>
        </div>)}
      </div>}
      {tab==="facturatie"&&<FacturatieTermijnen projectId={project.id}/>}
      {tab==="notities"&&<Textarea value={notities} onChange={setNotities} rows={8} placeholder="Voeg notities toe..." label="Notities"/>}
    </div>
    {confirmDel&&<ConfirmModal message="Weet je zeker dat je dit project wilt verwijderen? Dit kan niet ongedaan worden gemaakt." onConfirm={()=>{onDelete(project.id);onClose();}} onCancel={()=>setConfirmDel(false)}/>}
  </Modal>;
}

// Small reusable component for termijnen (also used in FacturatieView)
function FacturatieTermijnen({projectId}:{projectId:string}){
  const TERMIJNEN=["Eerste termijn","Tweede termijn","Derde termijn","Vierde termijn"];
  const [status,setStatus]=useState<Record<string,boolean>>({});
  useEffect(()=>{
    let cancelled=false;
    loadProjectMeta(projectId).then(m=>{if(!cancelled&&m)setStatus(m.termijnen||{});}).catch(()=>{});
    return()=>{cancelled=true;};
  },[projectId]);
  const toggle=(key:string)=>{
    setStatus(prev=>{
      const next={...prev,[key]:!prev[key]};
      void loadProjectMeta(projectId)
        .then(m=>saveProjectMeta(projectId,{...EMPTY_META,...(m||{}),termijnen:next}))
        .catch(()=>{});
      return next;
    });
  };

  return <div className="space-y-3">
    {TERMIJNEN.map((t,i)=>{const key=`${projectId}-${i}`;const betaald=!!status[key];return(
      <div key={i} className="flex items-center gap-4 p-4 border border-[rgba(26,39,68,0.08)] rounded-xl bg-white">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${betaald?"bg-[#0ABFB8] text-white":"bg-[#E8EDF5] text-[#1A2744]"}`}>{i+1}</div>
        <div className="flex-1"><p className="font-semibold text-[#1A2744]">{t}</p><p className="text-xs text-[#6B7A99] mt-0.5">{betaald?"Betaald":"Nog niet gefactureerd"}</p></div>
        <button onClick={()=>toggle(key)} className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-all border ${betaald?"bg-[#E6F9F8] text-[#0ABFB8] border-[#0ABFB8]":"bg-[#E8EDF5] text-[#6B7A99] border-transparent hover:border-[#6B7A99]"}`}>
          {betaald?"✓ Betaald":"Open"}
        </button>
      </div>
    );})}
  </div>;
}

// ===== EMPLOYEE FORM =====
function EmployeeForm({initial,onSave,onCancel}:{initial:Partial<Employee>;onSave:(e:Employee)=>void;onCancel:()=>void;}){
  const dc=useDC();
  const [f,setF]=useState<Employee>({id:initial.id||nid(),naam:initial.naam||"",functie:initial.functie||"Stoffeerder",afdeling:initial.afdeling||"Stoffering",telefoon:initial.telefoon||"",email:initial.email||"",competenties:initial.competenties||[]});
  const [comp,setComp]=useState(f.competenties.join(", "));
  const set=(k:keyof Employee,v:unknown)=>setF(prev=>({...prev,[k]:v}));
  const valid=f.naam&&f.functie&&f.afdeling;
  return <div className="p-4 md:p-6 space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Input label="Naam" value={f.naam} onChange={v=>set("naam",v)} required/>
      <Input label="Telefoon" value={f.telefoon} onChange={v=>set("telefoon",v)}/>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <Select label="Functie" value={f.functie} onChange={v=>set("functie",v as Functie)} required options={FUNCS.map(fn=>({value:fn,label:fn}))}/>
      <Select label="Afdeling" value={f.afdeling} onChange={v=>set("afdeling",v as Afdeling)} required options={AFDS.map(a=>({value:a,label:a}))}/>
      <Input label="E-mail" value={f.email} onChange={v=>set("email",v)}/>
    </div>
    <Input label="Competenties (kommagescheiden)" value={comp} onChange={v=>{setComp(v);set("competenties",v.split(",").map(s=>s.trim()).filter(Boolean));}}/>
    <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(26,39,68,0.08)]">
      <Btn variant="secondary" onClick={onCancel}>Annuleren</Btn>
      <Btn onClick={()=>{if(valid)onSave(f);}} disabled={!valid}>{initial.id?"Opslaan":"Medewerker aanmaken"}</Btn>
    </div>
  </div>;
}

// ===== SIDEBAR =====
const NAV_ITEMS:[Nav,React.ElementType,string][]=[
  ["dashboard",LayoutDashboard,"Dashboard"],["projecten",FolderOpen,"Werken"],
  ["agenda",CalendarDays,"Agenda"],["personeelsplanning",Users,"Personeelsplanning"],
  ["medewerkers",UserCircle,"Medewerkers"],["notities",MessageSquare,"Notities"],
  ["facturatie",Receipt,"Facturatie"],["instellingen",Settings,"Instellingen"],
];
function SidebarContent({active,onNav}:{active:Nav;onNav:(n:Nav)=>void}){
  return <>
    <div className="px-5 py-5">
      <div className="flex items-center gap-2.5">
        <div className="bg-white rounded-lg px-2 py-1.5 flex items-center justify-center">
          <img src={maasmondLogo.url} alt="Maasmond logo" className="h-5 w-auto"/>
        </div>
        <span className="text-white font-bold text-base tracking-tight">Maasmond planning</span>
      </div>
      <p className="text-[#6B8099] text-xs mt-0.5">Projectplanning</p>
    </div>
    <div className="px-3 py-1 space-y-0.5 flex-1">
      {NAV_ITEMS.map(([id,Icon,label])=><button key={id} onClick={()=>onNav(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${active===id?"bg-white/15 text-white font-semibold":"text-[#8899BB] hover:text-white hover:bg-white/8"}`}>
        <Icon className="w-4 h-4 flex-shrink-0"/>{label}
      </button>)}
    </div>
    <div className="p-4 border-t border-white/10">
      <SidebarUser/>
    </div>
  </>;
}
function SidebarUser(){
  const {user,roleLabel,signOut}=useAuth();
  const email=user?.email||"";
  const naam=(user?.user_metadata?.["full_name"] as string|undefined)||(user?.user_metadata?.["name"] as string|undefined)||email.split("@")[0]||"Gebruiker";
  const initials=naam.split(/[\s.]+/).filter(Boolean).slice(0,2).map((p:string)=>p[0]?.toUpperCase()).join("")||"?";
  return <div className="space-y-2">
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-8 h-8 rounded-full bg-[#0ABFB8] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials}</div>
      <div className="min-w-0">
        <p className="text-white text-xs font-semibold truncate">{naam}</p>
        <p className="text-[#6B8099] text-xs truncate">{roleLabel}</p>
      </div>
    </div>
    {user && <button onClick={()=>void signOut()} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-[#8899BB] hover:text-white hover:bg-white/10 transition-colors">
      <LogOut className="w-3.5 h-3.5"/>Uitloggen
    </button>}
  </div>;
}

function Sidebar({active,onNav,mobileOpen,onMobileClose}:{active:Nav;onNav:(n:Nav)=>void;mobileOpen:boolean;onMobileClose:()=>void}){
  const handleNav=(n:Nav)=>{onNav(n);onMobileClose();};
  return <>
    <div className="hidden md:flex w-56 min-h-screen bg-[#1A2744] flex-col flex-shrink-0">
      <SidebarContent active={active} onNav={onNav}/>
    </div>
    {mobileOpen&&<div className="fixed inset-0 z-50 md:hidden" onClick={onMobileClose}>
      <div className="absolute inset-0 bg-black/50"/>
      <div className="absolute left-0 top-0 bottom-0 w-64 bg-[#1A2744] flex flex-col" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#0ABFB8] flex items-center justify-center"><Layers className="w-3.5 h-3.5 text-white"/></div>
            <span className="text-white font-bold text-sm">PlanPro</span>
          </div>
          <button onClick={onMobileClose} className="p-1.5 rounded-lg text-[#8899BB] hover:text-white hover:bg-white/10"><X className="w-4 h-4"/></button>
        </div>
        <SidebarContent active={active} onNav={handleNav}/>
      </div>
    </div>}
  </>;
}
function MobileTopBar({onOpenMenu,nav}:{onOpenMenu:()=>void;nav:Nav}){
  const labels:Record<Nav,string>={dashboard:"Dashboard",projecten:"Werken",agenda:"Agenda",personeelsplanning:"Planning",medewerkers:"Medewerkers",notities:"Notities",facturatie:"Facturatie",instellingen:"Instellingen"};
  return <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#1A2744] flex-shrink-0 z-10">
    <button onClick={onOpenMenu} className="p-1.5 rounded-lg text-[#8899BB] hover:text-white hover:bg-white/10 flex-shrink-0"><Menu className="w-5 h-5"/></button>
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="w-6 h-6 rounded bg-[#0ABFB8] flex items-center justify-center"><Layers className="w-3 h-3 text-white"/></div>
      <span className="text-white font-bold text-sm">PlanPro</span>
    </div>
    <span className="text-[#8899BB] text-sm ml-auto">{labels[nav]}</span>
  </div>;
}

// ===== DASHBOARD =====
function Dashboard({projects,employees,availability,onNav,onOpenProject}:{
  projects:Project[];employees:Employee[];availability:AvailEntry[];
  onNav:(n:Nav)=>void;onOpenProject:(p:Project)=>void;
}){
  const dc=useDC();
  const now=new Date();
  const active=projects.filter(p=>p.status==="In uitvoering");
  const thisWeek=projects.filter(p=>{const s=new Date(p.startdatum),e=new Date(p.afloopdatum),start=new Date(now);start.setDate(now.getDate()-(now.getDay()||7)+1);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(start.getDate()+6);return s<=end&&e>=start;});
  const avail=employees.filter(e=>{const avToday=availability.filter(a=>a.employeeId===e.id&&a.date===TODAY_STR);return avToday.length===0||avToday.some(a=>a.status==="Beschikbaar");});
  const conflicts=employees.filter(e=>{const ps=projects.filter(p=>p.medewerkers.includes(e.id)&&p.status==="In uitvoering");return ps.length>1;});
  const toFact=projects.filter(p=>p.status==="Afgerond");
  const stats=[
    {label:"Actieve werken",value:active.length,icon:FolderOpen,color:"#0ABFB8",bg:"#E0F7F6",nav:"projecten" as Nav},
    {label:"Werken deze week",value:thisWeek.length,icon:CalendarDays,color:"#6366F1",bg:"#EDE9FE",nav:"agenda" as Nav},
    {label:"Beschikbare medewerkers",value:avail.length,icon:UserCheck,color:"#10B981",bg:"#D1FAE5",nav:"personeelsplanning" as Nav},
    {label:"Planningconflicten",value:conflicts.length,icon:AlertTriangle,color:"#F5A623",bg:"#FEF0D3",nav:"personeelsplanning" as Nav},
    {label:"Te factureren",value:toFact.length,icon:Receipt,color:"#FF6B5B",bg:"#FFE8E5",nav:"facturatie" as Nav},
  ];
  return <div className="p-4 md:p-6 space-y-4 md:space-y-6">
    <div>
      <h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Dashboard</h1>
      <p className="text-[#6B7A99] text-xs md:text-sm">{now.toLocaleDateString("nl-NL",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
      {stats.map(s=><button key={s.label} onClick={()=>onNav(s.nav)} className="bg-white rounded-2xl p-3 md:p-4 text-left hover:shadow-md transition-all border border-[rgba(26,39,68,0.06)] hover:border-[rgba(26,39,68,0.12)]">
        <div className="flex items-center justify-between mb-2 md:mb-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center" style={{backgroundColor:s.bg}}><s.icon className="w-4 h-4 md:w-5 md:h-5" style={{color:s.color}}/></div>
          {s.value>0&&<span className="text-xs text-[#6B7A99]">→</span>}
        </div>
        <p className="text-xl md:text-2xl font-bold text-[#1A2744]">{s.value}</p>
        <p className="text-xs text-[#6B7A99] mt-0.5 leading-tight">{s.label}</p>
      </button>)}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(26,39,68,0.06)] flex items-center justify-between">
          <h3 className="font-semibold text-[#1A2744] text-sm md:text-base">Actieve werken</h3>
          <button onClick={()=>onNav("projecten")} className="text-xs text-[#0ABFB8] hover:underline">Alle werken</button>
        </div>
        <div className="divide-y divide-[rgba(26,39,68,0.05)]">
          {active.slice(0,6).map(p=>{
            const afds=getAllAfds(p);
            return <button key={p.id} onClick={()=>onOpenProject(p)} className="w-full px-4 md:px-5 py-2.5 md:py-3 flex items-center gap-3 hover:bg-[#F8F9FC] transition-colors text-left">
              <div className="w-2 h-7 md:h-8 rounded-full flex-shrink-0 overflow-hidden" style={afds.length===1?{backgroundColor:dc[afds[0]].bg}:{background:`linear-gradient(180deg, ${dc[afds[0]].bg} 50%, ${afds[1]?dc[afds[1]].bg:dc[afds[0]].bg} 50%)`}}/>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#1A2744] text-sm truncate">{p.projectnaam}</p>
                <p className="text-xs text-[#6B7A99] truncate">{p.opdrachtgever} · {p.plaats}</p>
              </div>
              <StatusBadge status={p.status}/>
            </button>;
          })}
          {active.length===0&&<p className="px-5 py-8 text-center text-sm text-[#6B7A99]">Geen actieve werken</p>}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(26,39,68,0.06)] flex items-center justify-between">
          <h3 className="font-semibold text-[#1A2744] text-sm md:text-base">Medewerkers vandaag</h3>
          <button onClick={()=>onNav("personeelsplanning")} className="text-xs text-[#0ABFB8] hover:underline">Personeelsplanning</button>
        </div>
        <div className="divide-y divide-[rgba(26,39,68,0.05)]">
          {employees.slice(0,6).map(e=>{
            const avToday=availability.filter(a=>a.employeeId===e.id&&a.date===TODAY_STR);
            const status:AvailStatus=getDominantStatus(avToday);
            return <div key={e.id} className="px-4 md:px-5 py-2.5 md:py-3 flex items-center gap-3">
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#1A2744] text-sm">{e.naam}</p>
                <p className="text-xs text-[#6B7A99]">{e.functie}</p>
              </div>
              <AvailBadge status={status}/>
            </div>;
          })}
        </div>
      </div>
    </div>
    <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
      <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(26,39,68,0.06)]"><h3 className="font-semibold text-[#1A2744]">Werken per afdeling</h3></div>
      <div className="px-4 md:px-5 py-4 grid grid-cols-3 gap-3 md:gap-4">
        {AFDS.map(afd=>{
          const ps=projects.filter(p=>getAllAfds(p).includes(afd));
          const act=ps.filter(p=>p.status==="In uitvoering").length;
          return <button key={afd} onClick={()=>onNav("projecten")} className="p-3 md:p-4 rounded-xl border-2 text-left hover:shadow-sm transition-all" style={{borderColor:dc[afd].bg,backgroundColor:dc[afd].light}}>
            <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2">
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full flex-shrink-0" style={{backgroundColor:dc[afd].bg}}/>
              <span className="font-semibold text-xs md:text-sm text-[#1A2744] leading-tight">{afd}</span>
            </div>
            <p className="text-xl md:text-2xl font-bold" style={{color:dc[afd].bg}}>{ps.length}</p>
            <p className="text-xs text-[#6B7A99]">{act} actief</p>
          </button>;
        })}
      </div>
    </div>
  </div>;
}

// ===== PROJECTEN VIEW =====
type ColFilters = {werknummer:string;projectnaam:string;opdrachtgever:string;plaats:string;afdeling:string;projectleider:string;werkzaamheden:string;startFrom:string;startTo:string;eindFrom:string;eindTo:string;medewerker:string;status:string;};
const EMPTY_FILTERS:ColFilters={werknummer:"",projectnaam:"",opdrachtgever:"",plaats:"",afdeling:"",projectleider:"",werkzaamheden:"",startFrom:"",startTo:"",eindFrom:"",eindTo:"",medewerker:"",status:""};

function ColHeader({label,active,children}:{label:string;active:boolean;children:React.ReactNode}){
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLTableCellElement>(null);
  useEffect(()=>{const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  return <th ref={ref} className="relative px-3 py-3 text-left text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">
    <div className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap" onClick={()=>setOpen(p=>!p)}>
      {label}
      <Filter className={`w-3 h-3 flex-shrink-0 ${active?"text-[#0ABFB8]":"text-[#B8C3D9]"}`}/>
      {active&&<span className="w-1.5 h-1.5 rounded-full bg-[#0ABFB8] flex-shrink-0"/>}
    </div>
    {open&&<div className="absolute left-0 top-full z-50 mt-1 bg-white rounded-xl shadow-lg border border-[rgba(26,39,68,0.1)] p-2 min-w-44" onClick={e=>e.stopPropagation()}>
      {children}
    </div>}
  </th>;
}
function ColSearch({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}){
  return <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#B8C3D9]"/><input autoFocus value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full pl-6 pr-2 py-1.5 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0ABFB8]/50 text-[#1A2744]"/></div>;
}
function ColSelect({value,onChange,options}:{value:string;onChange:(v:string)=>void;options:string[]}){
  return <select value={value} onChange={e=>onChange(e.target.value)} className="w-full py-1.5 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0ABFB8]/50 text-[#1A2744] bg-white">
    <option value="">Alle</option>
    {options.map(o=><option key={o} value={o}>{o}</option>)}
  </select>;
}

// Statuscel: direct wijzigen vanuit de projectrij (desktop + mobiel)
function StatusCell({project,onStatusChange}:{project:Project;onStatusChange:(p:Project,s:ProjectStatus)=>Promise<void>}){
  const [saving,setSaving]=useState(false);
  return <div className="relative inline-flex items-center gap-1" onClick={e=>e.stopPropagation()}>
    <StatusBadge status={project.status}/>
    <ChevronDown className="w-3 h-3 text-[#B8C3D9] flex-shrink-0"/>
    {saving&&<span className="text-[10px] text-[#6B7A99] whitespace-nowrap">Opslaan…</span>}
    <select
      aria-label="Status wijzigen"
      value={project.status}
      disabled={saving}
      onClick={e=>e.stopPropagation()}
      onChange={async e=>{
        const v=e.target.value as ProjectStatus;
        if(v===project.status||saving)return;
        setSaving(true);
        try{await onStatusChange(project,v);}finally{setSaving(false);}
      }}
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-wait">
      {STATS.map(s=><option key={s} value={s}>{s}</option>)}
    </select>
  </div>;
}

function ProjectenView({projects,employees,onAdd,onEdit,onDelete,onOpen,onImport,onStatusChange}:{
  projects:Project[];employees:Employee[];
  onAdd:(prefill?:Partial<Project>)=>void;onEdit:(p:Project)=>void;onDelete:(id:string)=>void;onOpen:(p:Project)=>void;
  onImport:(rows:ImportRow[])=>void;
  onStatusChange:(p:Project,s:ProjectStatus)=>Promise<void>;
}){
  const dc=useDC();
  const [filters,setFilters]=useState<ColFilters>(EMPTY_FILTERS);
  const [del,setDel]=useState<string|null>(null);
  const [showImport,setShowImport]=useState(false);
  const set=(k:keyof ColFilters)=>(v:string)=>setFilters(prev=>({...prev,[k]:v}));
  const activeCount=Object.values(filters).filter(Boolean).length;
  const [showMobileFilters,setShowMobileFilters]=useState(false);

  // Alle voorkomende projectleiders (medewerker-id's én vrije tekst uit Excel kolom K)
  const plOptions=[...new Map(projects.filter(p=>p.projectleider).map(p=>[p.projectleider,plName(p,employees)])).entries()]
    .sort((a,b)=>a[1].localeCompare(b[1]));

  const filtered=projects.filter(p=>{
    const pl=employees.find(e=>e.id===p.projectleider);
    const afds=getAllAfds(p);
    if(filters.werknummer&&!p.werknummer.toLowerCase().includes(filters.werknummer.toLowerCase()))return false;
    if(filters.projectnaam&&!p.projectnaam.toLowerCase().includes(filters.projectnaam.toLowerCase()))return false;
    if(filters.opdrachtgever&&!p.opdrachtgever.toLowerCase().includes(filters.opdrachtgever.toLowerCase()))return false;
    if(filters.plaats&&!p.plaats.toLowerCase().includes(filters.plaats.toLowerCase()))return false;
    if(filters.afdeling&&!afds.includes(filters.afdeling as Afdeling))return false;
    if(filters.projectleider&&p.projectleider!==filters.projectleider)return false;
    if(filters.werkzaamheden&&!p.werkzaamheden.toLowerCase().includes(filters.werkzaamheden.toLowerCase()))return false;
    if(filters.startFrom&&p.startdatum<filters.startFrom)return false;
    if(filters.startTo&&p.startdatum>filters.startTo+"T23:59")return false;
    if(filters.eindFrom&&p.afloopdatum<filters.eindFrom)return false;
    if(filters.eindTo&&p.afloopdatum>filters.eindTo+"T23:59")return false;
    if(filters.medewerker&&!p.medewerkers.includes(filters.medewerker))return false;
    if(filters.status&&p.status!==filters.status)return false;
    return true;
  });

  const uniquePlaatsen=[...new Set(projects.map(p=>p.plaats))].sort();

  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Werken</h1>
        <p className="text-[#6B7A99] text-xs md:text-sm">{filtered.length} van {projects.length} werken{activeCount>0&&<span> · <button onClick={()=>setFilters(EMPTY_FILTERS)} className="text-[#0ABFB8] hover:underline font-medium">Filters wissen ({activeCount})</button></span>}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0 flex-wrap">
        <button onClick={()=>setShowMobileFilters(p=>!p)} className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[rgba(26,39,68,0.15)] text-[#6B7A99] text-sm font-medium">
          <Filter className="w-3.5 h-3.5"/>{activeCount>0&&<span className="w-4 h-4 rounded-full bg-[#0ABFB8] text-white text-xs flex items-center justify-center">{activeCount}</span>}
        </button>
        <Btn variant="secondary" onClick={()=>setShowImport(true)} size="sm"><Table2 className="w-3.5 h-3.5"/>Excel importeren</Btn>
        <Btn onClick={()=>onAdd()}><Plus className="w-4 h-4"/><span className="hidden sm:inline">Nieuw werk</span></Btn>
      </div>
    </div>
    {showMobileFilters&&<div className="md:hidden bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[#1A2744]">Filteren</span>
        {activeCount>0&&<button onClick={()=>setFilters(EMPTY_FILTERS)} className="text-xs text-[#0ABFB8]">Alles wissen</button>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="text-xs text-[#6B7A99] mb-1 block">Afdeling</label><ColSelect value={filters.afdeling} onChange={set("afdeling")} options={AFDS}/></div>
        <div><label className="text-xs text-[#6B7A99] mb-1 block">Status</label><ColSelect value={filters.status} onChange={set("status")} options={STATS}/></div>
        <div><label className="text-xs text-[#6B7A99] mb-1 block">Calculator</label>
          <select value={filters.projectleider} onChange={e=>set("projectleider")(e.target.value)} className="w-full py-1.5 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg text-[#1A2744] bg-white">
            <option value="">Alle</option>{plOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div><label className="text-xs text-[#6B7A99] mb-1 block">Medewerker</label>
          <select value={filters.medewerker} onChange={e=>set("medewerker")(e.target.value)} className="w-full py-1.5 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg text-[#1A2744] bg-white">
            <option value="">Alle</option>{employees.map(e=><option key={e.id} value={e.id}>{e.naam}</option>)}
          </select>
        </div>
      </div>
      <ColSearch value={filters.projectnaam} onChange={set("projectnaam")} placeholder="Zoek werknaam..."/>
      <ColSearch value={filters.opdrachtgever} onChange={set("opdrachtgever")} placeholder="Zoek opdrachtgever..."/>
    </div>}
    {/* Mobile card view */}
    <div className="md:hidden space-y-3">
      {filtered.map(p=>{const pl=plName(p,employees);const afds=getAllAfds(p);return<div key={p.id} className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(26,39,68,0.06)]" style={{borderLeftColor:dc[afds[0]].bg,borderLeftWidth:4}}>
          <span className="font-mono text-xs text-[#6B7A99] flex-shrink-0">{p.werknummer}</span>
          <span className="font-semibold text-[#1A2744] flex-1 truncate">{p.projectnaam}</span>
          <StatusCell project={p} onStatusChange={onStatusChange}/>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm text-[#6B7A99]"><Building2 className="w-3.5 h-3.5 flex-shrink-0"/>{p.opdrachtgever}</div>
          <div className="flex items-center gap-1.5 text-sm text-[#6B7A99]"><MapPin className="w-3.5 h-3.5 flex-shrink-0"/>{p.plaats}</div>
          {pl&&<div className="flex items-center gap-1.5 text-sm text-[#6B7A99]"><UserCircle className="w-3.5 h-3.5 flex-shrink-0"/>{pl}</div>}
          <div className="flex items-center gap-1.5 text-xs text-[#6B7A99]"><Calendar className="w-3 h-3 flex-shrink-0"/>{fmtDate(p.startdatum)} – {fmtDate(p.afloopdatum)}</div>
          <div className="pt-1"><DeptBadges afds={afds}/></div>
        </div>
        <div className="flex border-t border-[rgba(26,39,68,0.06)]">
          <button onClick={()=>onOpen(p)} className="flex-1 py-2.5 text-xs font-semibold text-[#0ABFB8] hover:bg-[#E0F7F6] transition-colors">Openen</button>
          <div className="w-px bg-[rgba(26,39,68,0.06)]"/>
          <button onClick={()=>onEdit(p)} className="flex-1 py-2.5 text-xs font-medium text-[#6B7A99] hover:bg-[#F0F3F8] transition-colors">Bewerken</button>
          <div className="w-px bg-[rgba(26,39,68,0.06)]"/>
          <button onClick={()=>setDel(p.id)} className="flex-1 py-2.5 text-xs font-medium text-[#FF6B5B] hover:bg-[#FFE8E5] transition-colors">Verwijderen</button>
        </div>
      </div>;})}
      {filtered.length===0&&<p className="text-center text-[#6B7A99] text-sm py-12">Geen projecten gevonden</p>}
    </div>
    {/* Desktop table view */}
    <div className="hidden md:block bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-auto">
      <table className="w-full text-sm" style={{minWidth:"1100px"}}>
        <thead className="bg-[#F0F3F8]">
          <tr>
            <ColHeader label="Werknr." active={!!filters.werknummer}><ColSearch value={filters.werknummer} onChange={set("werknummer")} placeholder="Zoek werknummer..."/></ColHeader>
            <ColHeader label="Werk" active={!!filters.projectnaam}><ColSearch value={filters.projectnaam} onChange={set("projectnaam")} placeholder="Zoek werk..."/></ColHeader>
            <ColHeader label="Opdrachtgever" active={!!filters.opdrachtgever}><ColSearch value={filters.opdrachtgever} onChange={set("opdrachtgever")} placeholder="Zoek opdrachtgever..."/></ColHeader>
            <ColHeader label="Plaats" active={!!filters.plaats}><ColSelect value={filters.plaats} onChange={set("plaats")} options={uniquePlaatsen}/></ColHeader>
            <ColHeader label="Afdeling" active={!!filters.afdeling}><ColSelect value={filters.afdeling} onChange={set("afdeling")} options={AFDS}/></ColHeader>
            <ColHeader label="Calculator" active={!!filters.projectleider}>
              <select value={filters.projectleider} onChange={e=>set("projectleider")(e.target.value)} className="w-full py-1.5 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0ABFB8]/50 text-[#1A2744] bg-white">
                <option value="">Alle</option>{plOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </ColHeader>
            <ColHeader label="Werkzaamheden" active={!!filters.werkzaamheden}><ColSearch value={filters.werkzaamheden} onChange={set("werkzaamheden")} placeholder="Zoek werkzaamheden..."/></ColHeader>
            <ColHeader label="Start" active={!!(filters.startFrom||filters.startTo)}>
              <div className="space-y-1.5">
                <div><p className="text-[10px] text-[#6B7A99] mb-0.5">Van</p><input type="date" value={filters.startFrom} onChange={e=>set("startFrom")(e.target.value)} className="w-full py-1 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0ABFB8]/50"/></div>
                <div><p className="text-[10px] text-[#6B7A99] mb-0.5">Tot</p><input type="date" value={filters.startTo} onChange={e=>set("startTo")(e.target.value)} className="w-full py-1 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0ABFB8]/50"/></div>
              </div>
            </ColHeader>
            <ColHeader label="Einde" active={!!(filters.eindFrom||filters.eindTo)}>
              <div className="space-y-1.5">
                <div><p className="text-[10px] text-[#6B7A99] mb-0.5">Van</p><input type="date" value={filters.eindFrom} onChange={e=>set("eindFrom")(e.target.value)} className="w-full py-1 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0ABFB8]/50"/></div>
                <div><p className="text-[10px] text-[#6B7A99] mb-0.5">Tot</p><input type="date" value={filters.eindTo} onChange={e=>set("eindTo")(e.target.value)} className="w-full py-1 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0ABFB8]/50"/></div>
              </div>
            </ColHeader>
            <ColHeader label="Medewerker" active={!!filters.medewerker}>
              <select value={filters.medewerker} onChange={e=>set("medewerker")(e.target.value)} className="w-full py-1.5 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0ABFB8]/50 text-[#1A2744] bg-white">
                <option value="">Alle</option>{employees.map(e=><option key={e.id} value={e.id}>{e.naam}</option>)}
              </select>
            </ColHeader>
            <ColHeader label="Status" active={!!filters.status}><ColSelect value={filters.status} onChange={set("status")} options={STATS}/></ColHeader>
            <th className="px-3 py-3"/>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(26,39,68,0.05)]">
          {filtered.map(p=>{
            const pl=plName(p,employees);
            const afds=getAllAfds(p);
            return <tr key={p.id} onClick={()=>onOpen(p)} className="hover:bg-[#F8F9FC] cursor-pointer transition-colors">
              <td className="px-3 py-3 font-mono text-xs text-[#6B7A99]">{p.werknummer}</td>
              <td className="px-3 py-3"><div className="flex items-center gap-2">
                {afds.length===1
                  ?<div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:dc[afds[0]].bg}}/>
                  :<div className="w-3 h-3 rounded-full flex-shrink-0 overflow-hidden" style={projStyle(p,dc)}/>}
                <span className="font-medium text-[#1A2744]">{p.projectnaam}</span>
              </div></td>
              <td className="px-3 py-3 text-[#6B7A99]">{p.opdrachtgever}</td>
              <td className="px-3 py-3 text-[#6B7A99]">{p.plaats}</td>
              <td className="px-3 py-3"><DeptBadges afds={afds}/></td>
              <td className="px-3 py-3 text-[#1A2744]">{pl||"-"}</td>
              <td className="px-3 py-3 text-[#6B7A99] max-w-32 truncate" title={p.werkzaamheden}>{p.werkzaamheden||"-"}</td>
              <td className="px-3 py-3 text-[#6B7A99] whitespace-nowrap">{fmtDate(p.startdatum)}</td>
              <td className="px-3 py-3 text-[#6B7A99] whitespace-nowrap">{fmtDate(p.afloopdatum)}</td>
              <td className="px-3 py-3 text-[#6B7A99]">{p.medewerkers.map(id=>employees.find(e=>e.id===id)?.naam.split(" ")[0]).filter(Boolean).join(", ")||"-"}</td>
              <td className="px-3 py-3"><StatusCell project={p} onStatusChange={onStatusChange}/></td>
              <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                <div className="flex gap-1">
                  <button onClick={()=>onEdit(p)} className="p-1.5 rounded hover:bg-[#F0F3F8] text-[#6B7A99] hover:text-[#1A2744]"><Pencil className="w-3.5 h-3.5"/></button>
                  <button onClick={()=>setDel(p.id)} className="p-1.5 rounded hover:bg-[#FFE8E5] text-[#6B7A99] hover:text-[#FF6B5B]"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
      {filtered.length===0&&<p className="text-center text-[#6B7A99] text-sm py-12">Geen projecten gevonden</p>}
    </div>
    {del&&<ConfirmModal message="Weet je zeker dat je dit werk wilt verwijderen? Dit kan niet ongedaan worden gemaakt." onConfirm={()=>{onDelete(del);setDel(null);}} onCancel={()=>setDel(null)}/>}
    {showImport&&<ExcelImportModal projects={projects} employees={employees} onImport={rows=>{onImport(rows);setShowImport(false);}} onClose={()=>setShowImport(false)}/>}
  </div>;
}

// ===== AGENDA - MONTH VIEW =====
function MonthView({year,month,projects,employees,schoolRegions,onClickProject,onClickDate,onDropProject,showWeekNumbers}:{
  year:number;month:number;projects:Project[];employees:Employee[];schoolRegions:string[];
  onClickProject:(p:Project)=>void;onClickDate:(d:Date)=>void;
  onDropProject:(id:string,newStart:Date)=>void;showWeekNumbers:boolean;
}){
  const dc=useDC();
  const weeks=getMonthWeeks(year,month);
  const dragRef=useRef<{id:string;offsetDays:number}|null>(null);
  const [dragOverDate,setDragOverDate]=useState<string|null>(null);

  const handleDragStart=(e:React.DragEvent,project:Project,weekDay:Date)=>{
    e.stopPropagation();
    const pStart=new Date(project.startdatum);pStart.setHours(0,0,0,0);
    const clicked=new Date(weekDay);clicked.setHours(0,0,0,0);
    const offset=Math.round((clicked.getTime()-pStart.getTime())/86400000);
    dragRef.current={id:project.id,offsetDays:offset};
    e.dataTransfer.effectAllowed="move";
    e.dataTransfer.setData("text/plain",project.id);
  };
  const handleDrop=(e:React.DragEvent,day:Date)=>{
    e.preventDefault();e.stopPropagation();setDragOverDate(null);
    if(!dragRef.current)return;
    const newStart=new Date(day);
    newStart.setDate(newStart.getDate()-dragRef.current.offsetDays);
    onDropProject(dragRef.current.id,newStart);
    dragRef.current=null;
  };

  return <div>
    <div className={`grid border-b border-[rgba(26,39,68,0.08)]`} style={{gridTemplateColumns:showWeekNumbers?"28px repeat(7,1fr)":"repeat(7,1fr)"}}>
      {showWeekNumbers&&<div className="py-2 text-center text-[9px] font-semibold text-[#B8C3D9] uppercase">Wk</div>}
      {DAYS_NL.map(d=><div key={d} className="py-2 text-center text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">{d}</div>)}
    </div>
    {weeks.map((week,wi)=>{
      const evs=layoutWeek(week,projects);
      const maxSlot=evs.length?Math.max(...evs.map(e=>e.slot)):-1;
      const rowH=Math.max(88,36+(maxSlot+1)*22+6);
      const wn=getWeekNumber(week[0]);
      return <div key={wi} className="relative border-b border-[rgba(26,39,68,0.06)]" style={{height:rowH}}>
        <div className="absolute inset-0" style={{display:"grid",gridTemplateColumns:showWeekNumbers?"28px repeat(7,1fr)":"repeat(7,1fr)"}}>
          {showWeekNumbers&&<div className="border-r border-[rgba(26,39,68,0.06)] flex items-start justify-center pt-1">
            <span className="text-[9px] text-[#B8C3D9] font-medium">W{wn}</span>
          </div>}
          {week.map((day,di)=>{
            const ds=toDateStr(day);
            const isToday=ds===TODAY_STR;
            const inMonth=day.getMonth()===month;
            const hol=getDHol(ds);
            const shols=getSHols(ds,schoolRegions);
            const isDragOver=dragOverDate===ds;
            return <div key={di} className={`border-r border-[rgba(26,39,68,0.06)] p-1 cursor-pointer transition-colors ${!inMonth?"opacity-35":""}${isDragOver?" bg-[#E0F7F6]":hol?" bg-red-50/50":""}`}
              onDragOver={e=>{e.preventDefault();setDragOverDate(ds);}}
              onDragLeave={()=>setDragOverDate(null)}
              onDrop={e=>handleDrop(e,day)}
              onClick={()=>onClickDate(day)}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${isToday?"bg-[#1A2744] text-white":"text-[#1A2744]"}`}>{day.getDate()}</div>
              {hol&&<div className="text-[9px] text-red-500 leading-tight truncate mt-0.5">{hol}</div>}
              {shols.length>0&&<div className="text-[9px] text-purple-500 leading-tight truncate">{shols[0].name.split(" ")[0]}</div>}
            </div>;
          })}
        </div>
        {evs.map(ev=>{
          const offsetCols=showWeekNumbers?1:0;
          const totalCols=7+(showWeekNumbers?1:0);
          const colW=100/totalCols;
          const leftOffset=showWeekNumbers?colW:0;
          const cellW=100/totalCols;
          const left=leftOffset+ev.sc*cellW;
          const width=(ev.ec-ev.sc+1)*cellW;
          const top=36+ev.slot*22;
          const st=agendaProjStyle(ev.project,dc);
          const label=projLabel(ev.project,employees);
          return <div key={ev.project.id} draggable
            onDragStart={e=>handleDragStart(e,ev.project,week[ev.sc])}
            onClick={e=>{e.stopPropagation();onClickProject(ev.project);}}
            className="absolute h-5 rounded flex items-center text-white text-xs font-medium px-1.5 cursor-grab hover:brightness-110 transition-all z-10 overflow-hidden select-none"
            style={{left:`${left+0.3}%`,width:`${width-0.6}%`,top,...st,borderRadius:ev.cl?"0 4px 4px 0":ev.cr?"4px 0 0 4px":"4px"}}>
            {ev.cl&&<span className="mr-1 opacity-70 flex-shrink-0">◀</span>}
            <span className="truncate">{label}</span>
            {ev.cr&&<span className="ml-1 opacity-70 flex-shrink-0">▶</span>}
          </div>;
        })}
      </div>;
    })}
  </div>;
}

// ===== AGENDA - WEEK VIEW =====
function WeekView({weekDays,projects,employees,onClickProject,onClickDateTime,onDropProject,onResizeProject}:{
  weekDays:Date[];projects:Project[];employees:Employee[];
  onClickProject:(p:Project)=>void;onClickDateTime:(d:Date,h:number)=>void;
  onDropProject:(id:string,newStart:Date)=>void;
  onResizeProject:(id:string,newEnd:Date)=>void;
}){
  const dc=useDC();
  const allDayProjects=projects.filter(p=>{const s=new Date(p.startdatum),e=new Date(p.afloopdatum);return!sameDay(s,e)&&weekDays.some(d=>{const ws=new Date(d);ws.setHours(0,0,0,0);const we=new Date(d);we.setHours(23,59,59,999);return s<=we&&e>=ws;});});
  const tdProjects=projects.filter(p=>{const s=new Date(p.startdatum),e=new Date(p.afloopdatum);return sameDay(s,e)&&weekDays.some(d=>sameDay(s,d));});
  const allDayEvs=layoutWeek(weekDays,allDayProjects);
  const maxSlot=allDayEvs.length?Math.max(...allDayEvs.map(e=>e.slot)):-1;
  const adH=Math.max(32,(maxSlot+1)*22+10);
  const dragRef=useRef<{id:string;offsetMin:number}|null>(null);
  const resizeRef=useRef<{id:string;startY:number;origEndMs:number;origStartMs:number}|null>(null);
  const [resizingId,setResizingId]=useState<string|null>(null);
  const [dragOverSlot,setDragOverSlot]=useState<string|null>(null);
  const onResizeProjectRef=useRef(onResizeProject);onResizeProjectRef.current=onResizeProject;
  useEffect(()=>{
    const onMU=(e:MouseEvent)=>{
      if(!resizeRef.current)return;
      const {id,startY,origEndMs,origStartMs}=resizeRef.current;
      const deltaPx=e.clientY-startY;
      const deltaMin=Math.round(deltaPx/(HOUR_HEIGHT/60)/15)*15;
      const newEnd=new Date(origEndMs+deltaMin*60000);
      const minEnd=new Date(origStartMs+30*60000);
      if(newEnd>minEnd)onResizeProjectRef.current(id,newEnd);
      resizeRef.current=null;setResizingId(null);
    };
    window.addEventListener("mouseup",onMU);
    return()=>{window.removeEventListener("mouseup",onMU);};
  },[]);
  const wn=getWeekNumber(weekDays[0]);

  return <div className="flex flex-col h-full overflow-hidden">
    <div className="flex border-b border-[rgba(26,39,68,0.08)]">
      <div className="w-14 flex-shrink-0 flex items-end justify-center pb-1"><span className="text-[9px] text-[#B8C3D9] font-medium">Wk{wn}</span></div>
      {weekDays.map((d,i)=>{const ds=toDateStr(d);const hol=getDHol(ds);const isT=ds===TODAY_STR;return <div key={i} className={`flex-1 py-2 text-center border-l border-[rgba(26,39,68,0.06)] ${hol?"bg-red-50/40":""}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${isT?"text-[#0ABFB8]":"text-[#6B7A99]"}`}>{DAYS_NL[i]}</p>
        <p className={`text-sm font-bold ${isT?"text-[#1A2744]":"text-[#6B7A99]"}`}>{d.getDate()}</p>
        {hol&&<p className="text-[9px] text-red-400 truncate px-1">{hol}</p>}
      </div>;})}
    </div>
    <div className="flex border-b border-[rgba(26,39,68,0.08)]" style={{minHeight:adH}}>
      <div className="w-14 flex-shrink-0 flex items-center justify-end pr-2"><span className="text-[9px] text-[#6B7A99] uppercase">All-day</span></div>
      <div className="flex-1 relative" style={{height:adH}}>
        <div className="grid grid-cols-7 h-full absolute inset-0">{weekDays.map((_,i)=><div key={i} className="border-l border-[rgba(26,39,68,0.06)]"/>)}</div>
        {allDayEvs.map(ev=>{const st=agendaProjStyle(ev.project,dc);const lbl=projLabel(ev.project,employees);return <div key={ev.project.id} onClick={()=>onClickProject(ev.project)} draggable className="absolute h-5 rounded text-white text-xs font-medium px-1.5 flex items-center cursor-pointer hover:brightness-110 z-10 overflow-hidden" style={{left:`${ev.sc/7*100+0.3}%`,width:`${(ev.ec-ev.sc+1)/7*100-0.6}%`,top:6+ev.slot*22,...st}}><span className="truncate">{lbl}</span></div>;})}
      </div>
    </div>
    <div className="flex flex-1 overflow-y-auto">
      <div className="w-14 flex-shrink-0">
        {HOURS.map(h=><div key={h} style={{height:HOUR_HEIGHT}} className="border-b border-[rgba(26,39,68,0.04)] flex items-start justify-end pr-2 pt-0.5"><span className="text-[10px] text-[#B8C3D9]">{String(h).padStart(2,"0")}:00</span></div>)}
      </div>
      <div className="flex-1 grid grid-cols-7">
        {weekDays.map((day,di)=>{
          const dayProjs=tdProjects.filter(p=>sameDay(new Date(p.startdatum),day));
          return <div key={di} className="relative border-l border-[rgba(26,39,68,0.06)]" style={{height:HOURS.length*HOUR_HEIGHT}}>
            {HOURS.map(h=>{
              const slotKey=`${toDateStr(day)}-${h}`;
              return <div key={h} style={{height:HOUR_HEIGHT}} className={`border-b border-[rgba(26,39,68,0.04)] cursor-pointer transition-colors ${dragOverSlot===slotKey?"bg-[#E0F7F6]":""}`}
                onDragOver={e=>{e.preventDefault();setDragOverSlot(slotKey);}}
                onDragLeave={()=>setDragOverSlot(null)}
                onDrop={e=>{e.preventDefault();setDragOverSlot(null);if(!dragRef.current)return;const ns=new Date(day);ns.setHours(h,0,0,0);onDropProject(dragRef.current.id,ns);dragRef.current=null;}}
                onClick={()=>onClickDateTime(day,h)}/>;
            })}
            {dayProjs.map(p=>{
              const s=new Date(p.startdatum),e=new Date(p.afloopdatum);
              const top=Math.max(0,(s.getHours()-BASE_HOUR+s.getMinutes()/60)*HOUR_HEIGHT);
              const durH=(e.getHours()-s.getHours()+(e.getMinutes()-s.getMinutes())/60);
              const h=Math.max(HOUR_HEIGHT/2,durH*HOUR_HEIGHT);
              const st=agendaProjStyle(p,dc);
              const isRes=resizingId===p.id;
              return <div key={p.id} draggable
                onDragStart={ev=>{dragRef.current={id:p.id,offsetMin:0};ev.dataTransfer.effectAllowed="move";}}
                onClick={ev=>{ev.stopPropagation();onClickProject(p);}}
                className="absolute left-0.5 right-0.5 rounded-lg overflow-hidden cursor-grab text-white text-xs z-10 shadow-sm hover:shadow-md transition-shadow"
                style={{top,height:h,...st}}>
                <div className="p-1.5 h-full flex flex-col">
                  <p className="font-semibold truncate">{projLabel(p,employees)}</p>
                  <p className="opacity-80 text-[10px]">{fmtTime(s)} – {fmtTime(e)}</p>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-3 flex items-center justify-center cursor-s-resize opacity-0 hover:opacity-100 transition-opacity"
                  onMouseDown={ev=>{ev.preventDefault();ev.stopPropagation();resizeRef.current={id:p.id,startY:ev.clientY,origEndMs:e.getTime(),origStartMs:s.getTime()};setResizingId(p.id);}}>
                  <div className="w-6 h-0.5 bg-white/60 rounded"/>
                </div>
              </div>;
            })}
          </div>;
        })}
      </div>
    </div>
  </div>;
}

// ===== AGENDA - DAY VIEW =====
function DayView({date,projects,employees,onClickProject,onClickTime,onDropProject,onResizeProject}:{
  date:Date;projects:Project[];employees:Employee[];
  onClickProject:(p:Project)=>void;onClickTime:(h:number)=>void;
  onDropProject:(id:string,newStart:Date)=>void;
  onResizeProject:(id:string,newEnd:Date)=>void;
}){
  const dc=useDC();
  const selectedDateKey=toDateStr(date);
  const dayProjs=projects.filter(p=>datePart(p.startdatum)===selectedDateKey&&!!timePart(p.startdatum));
  const allDay=projects.filter(p=>{const s=new Date(p.startdatum),e=new Date(p.afloopdatum);return!sameDay(s,e)&&(sameDay(s,date)||sameDay(e,date)||s<date&&e>date);});
  const resizeRef=useRef<{id:string;startY:number;origEndMs:number;origStartMs:number}|null>(null);
  const [resizingId,setResizingId]=useState<string|null>(null);
  const dragRef=useRef<string|null>(null);
  const onResizeProjRef=useRef(onResizeProject);onResizeProjRef.current=onResizeProject;
  useEffect(()=>{
    const onMU=(e:MouseEvent)=>{
      if(!resizeRef.current)return;
      const {id,startY,origEndMs,origStartMs}=resizeRef.current;
      const deltaMin=Math.round((e.clientY-startY)/(HOUR_HEIGHT/60)/15)*15;
      const newEnd=new Date(origEndMs+deltaMin*60000);
      if(newEnd>new Date(origStartMs+30*60000))onResizeProjRef.current(id,newEnd);
      resizeRef.current=null;setResizingId(null);
    };
    window.addEventListener("mouseup",onMU);return()=>window.removeEventListener("mouseup",onMU);
  },[]);
  const ds=toDateStr(date);const hol=getDHol(ds);const isT=ds===TODAY_STR;
  const wn=getWeekNumber(date);
  return <div className="flex flex-col h-full">
    <div className={`flex items-center gap-4 p-4 border-b border-[rgba(26,39,68,0.08)] ${hol?"bg-red-50/30":""}`}>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl ${isT?"bg-[#1A2744] text-white":"bg-[#F0F3F8] text-[#1A2744]"}`}>{date.getDate()}</div>
      <div>
        <p className="font-bold text-lg text-[#1A2744]">{DAYS_FULL[(date.getDay()+6)%7]} {date.getDate()} {MONTHS_NL[date.getMonth()]}</p>
        <p className="text-xs text-[#6B7A99]">Week {wn}{hol&&<span className="text-red-500 ml-2">🎉 {hol}</span>}</p>
      </div>
      <div className="flex flex-wrap gap-1 ml-2">
        {allDay.map(p=><button key={p.id} onClick={()=>onClickProject(p)} className="px-3 py-1 rounded-full text-xs font-medium text-white cursor-pointer hover:opacity-80 transition-opacity" style={agendaProjStyle(p,dc)}>{p.projectnaam}</button>)}
      </div>
    </div>
    <div className="flex flex-1 overflow-y-auto">
      <div className="w-16 flex-shrink-0">
        {HOURS.map(h=><div key={h} style={{height:HOUR_HEIGHT}} className="flex items-start justify-end pr-3 pt-0.5 border-b border-[rgba(26,39,68,0.04)]"><span className="text-[10px] text-[#B8C3D9]">{String(h).padStart(2,"0")}:00</span></div>)}
      </div>
      <div className="flex-1 relative border-l border-[rgba(26,39,68,0.08)]" style={{height:HOURS.length*HOUR_HEIGHT}}>
        {HOURS.map(h=><div key={h} style={{height:HOUR_HEIGHT}} className="border-b border-[rgba(26,39,68,0.04)] hover:bg-[#F8F9FC] cursor-pointer transition-colors"
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault();if(!dragRef.current)return;const ns=new Date(date);ns.setHours(h,0,0,0);onDropProject(dragRef.current,ns);dragRef.current=null;}}
          onClick={()=>onClickTime(h)}/>)}
        {dayProjs.map(p=>{
          const s=new Date(p.startdatum),e=new Date(p.afloopdatum);
          const colH=HOURS.length*HOUR_HEIGHT;
          const top=Math.min(colH-HOUR_HEIGHT/2,Math.max(0,(s.getHours()-BASE_HOUR+s.getMinutes()/60)*HOUR_HEIGHT));
          const durH=e.getHours()-s.getHours()+(e.getMinutes()-s.getMinutes())/60;
          const ht=Math.min(colH-top,Math.max(HOUR_HEIGHT/2,durH*HOUR_HEIGHT));
          const st=agendaProjStyle(p,dc);
          return <div key={p.id} draggable onDragStart={()=>{dragRef.current=p.id;}} onClick={ev=>{ev.stopPropagation();onClickProject(p);}}
            className="absolute left-2 right-2 rounded-xl overflow-hidden cursor-grab text-white shadow-sm hover:shadow-md z-10 transition-shadow"
            style={{top,height:ht,...st}}>
            <div className="p-3 h-full">
              <p className="font-bold text-sm truncate">{projLabel(p,employees)}</p>
              <p className="opacity-80 text-xs">{fmtTime(s)} – {fmtTime(e)}</p>
              <p className="opacity-70 text-xs mt-1">{p.opdrachtgever} · {p.plaats}</p>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-4 flex items-center justify-center cursor-s-resize group"
              onMouseDown={ev=>{ev.preventDefault();ev.stopPropagation();resizeRef.current={id:p.id,startY:ev.clientY,origEndMs:e.getTime(),origStartMs:s.getTime()};setResizingId(p.id);}}>
              <div className="w-8 h-0.5 bg-white/60 rounded group-hover:w-16 transition-all"/>
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

// ===== AGENDA - KWARTAAL VIEW =====
function KwartaalView({year,quarter,projects,employees,schoolRegions,onClickProject,onClickDate,onDropProject,showWeekNumbers}:{
  year:number;quarter:number;projects:Project[];employees:Employee[];schoolRegions:string[];
  onClickProject:(p:Project)=>void;onClickDate:(d:Date)=>void;
  onDropProject:(id:string,newStart:Date)=>void;showWeekNumbers:boolean;
}){
  const dc=useDC();
  const months=[quarter*3,quarter*3+1,quarter*3+2];
  const dragRef=useRef<{id:string;offsetDays:number}|null>(null);
  const [dragOverDate,setDragOverDate]=useState<string|null>(null);

  const handleDragStart=(e:React.DragEvent,project:Project,weekDay:Date)=>{
    e.stopPropagation();
    const pStart=new Date(project.startdatum);pStart.setHours(0,0,0,0);
    const clicked=new Date(weekDay);clicked.setHours(0,0,0,0);
    const offset=Math.round((clicked.getTime()-pStart.getTime())/86400000);
    dragRef.current={id:project.id,offsetDays:offset};
    e.dataTransfer.effectAllowed="move";
    e.dataTransfer.setData("text/plain",project.id);
  };
  const handleDrop=(e:React.DragEvent,day:Date)=>{
    e.preventDefault();e.stopPropagation();setDragOverDate(null);
    if(!dragRef.current)return;
    const newStart=new Date(day);
    newStart.setDate(newStart.getDate()-dragRef.current.offsetDays);
    onDropProject(dragRef.current.id,newStart);
    dragRef.current=null;
  };

  return <div className="h-full overflow-y-auto">
    <div className="grid grid-cols-3 min-h-full divide-x divide-[rgba(26,39,68,0.08)]">
      {months.map(month=>{
        const weeks=getMonthWeeks(year,month);
        return <div key={month} className="flex flex-col">
          <div className="px-4 py-3 bg-[#F8F9FC] border-b border-[rgba(26,39,68,0.08)] sticky top-0 z-10">
            <h3 className="font-bold text-sm text-[#1A2744]">{MONTHS_NL[month]} {year}</h3>
          </div>
          <div className="grid border-b border-[rgba(26,39,68,0.06)]" style={{gridTemplateColumns:showWeekNumbers?"24px repeat(7,1fr)":"repeat(7,1fr)"}}>
            {showWeekNumbers&&<div className="py-1.5 text-center text-[8px] font-semibold text-[#B8C3D9]">W</div>}
            {DAYS_NL.map(d=><div key={d} className="py-1.5 text-center text-[9px] font-semibold text-[#6B7A99] uppercase tracking-wide">{d}</div>)}
          </div>
          {weeks.map((week,wi)=>{
            const evs=layoutWeek(week,projects);
            const maxSlot=evs.length?Math.max(...evs.map(e=>e.slot)):-1;
            const rowH=Math.max(60,26+(maxSlot+1)*18+4);
            const wn=getWeekNumber(week[0]);
            return <div key={wi} className="relative border-b border-[rgba(26,39,68,0.05)]" style={{height:rowH}}>
              <div className="absolute inset-0" style={{display:"grid",gridTemplateColumns:showWeekNumbers?"24px repeat(7,1fr)":"repeat(7,1fr)"}}>
                {showWeekNumbers&&<div className="border-r border-[rgba(26,39,68,0.05)] flex items-start justify-center pt-0.5">
                  <span className="text-[8px] text-[#B8C3D9] font-medium">W{wn}</span>
                </div>}
                {week.map((day,di)=>{
                  const ds=toDateStr(day);
                  const isToday=ds===TODAY_STR;
                  const inMonth=day.getMonth()===month;
                  const hol=getDHol(ds);
                  const shols=getSHols(ds,schoolRegions);
                  const isDragOver=dragOverDate===ds;
                  return <div key={di}
                    className={`border-r border-[rgba(26,39,68,0.05)] p-0.5 cursor-pointer transition-colors ${!inMonth?"opacity-30":""}${isDragOver?" bg-[#E0F7F6]":hol?" bg-red-50/60":""}`}
                    onDragOver={e=>{e.preventDefault();setDragOverDate(ds);}}
                    onDragLeave={()=>setDragOverDate(null)}
                    onDrop={e=>handleDrop(e,day)}
                    onClick={()=>onClickDate(day)}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${isToday?"bg-[#1A2744] text-white":"text-[#1A2744]"}`}>{day.getDate()}</div>
                    {hol&&<div className="text-[7px] text-red-500 leading-tight truncate">{hol.split(" ")[0]}</div>}
                    {shols.length>0&&!hol&&<div className="text-[7px] text-purple-400 leading-tight truncate">{shols[0].name.split(" ")[0]}</div>}
                  </div>;
                })}
              </div>
              {evs.map(ev=>{
                const totalCols=7+(showWeekNumbers?1:0);
                const colW=100/totalCols;
                const leftOffset=showWeekNumbers?colW:0;
                const cellW=100/totalCols;
                const left=leftOffset+ev.sc*cellW;
                const width=(ev.ec-ev.sc+1)*cellW;
                const top=26+ev.slot*18;
                const st=agendaProjStyle(ev.project,dc);
                const label=projLabel(ev.project,employees);
                return <div key={ev.project.id} draggable
                  onDragStart={e=>handleDragStart(e,ev.project,week[ev.sc])}
                  onClick={e=>{e.stopPropagation();onClickProject(ev.project);}}
                  className="absolute h-4 rounded flex items-center text-white font-medium px-1 cursor-grab hover:brightness-110 transition-all z-10 overflow-hidden select-none"
                  style={{left:`${left+0.2}%`,width:`${width-0.4}%`,top,...st,fontSize:"9px",borderRadius:ev.cl?"0 3px 3px 0":ev.cr?"3px 0 0 3px":"3px"}}>
                  {ev.cl&&<span className="mr-0.5 opacity-70 flex-shrink-0">◀</span>}
                  <span className="truncate">{label}</span>
                  {ev.cr&&<span className="ml-0.5 opacity-70 flex-shrink-0">▶</span>}
                </div>;
              })}
            </div>;
          })}
        </div>;
      })}
    </div>
  </div>;
}

// ===== AGENDA VIEW =====
function AgendaView({projects,employees,availability,updateProject,onOpenProject,onCreateProject,onSaveManyPlanning}:{
  projects:Project[];employees:Employee[];availability:AvailEntry[];
  updateProject:(id:string,u:Partial<Project>)=>void;
  onOpenProject:(p:Project)=>void;onCreateProject:(prefill:Partial<Project>)=>void;
  onSaveManyPlanning:(entries:AvailEntry[])=>Promise<boolean>;
}){
  const dc=useDC();
  const [view,setView]=useState<CalView>("month");
  const [date,setDate]=useState(new Date());
  const schoolRegions=["Noord","Midden","Zuid"];
  const [afdFilter,setAfdFilter]=useState<string>("");
  const [showWeekNumbers,setShowWeekNumbers]=useState(true);
  const year=date.getFullYear(),month=date.getMonth();
  const quarter=Math.floor(month/3);
  const weekDays=getWeekDays(date);



  const navigate=(dir:number)=>{
    const d=new Date(date);
    if(view==="month")d.setMonth(d.getMonth()+dir);
    else if(view==="week")d.setDate(d.getDate()+dir*7);
    else if(view==="kwartaal")d.setMonth(d.getMonth()+dir*3);
    else d.setDate(d.getDate()+dir);
    setDate(d);
  };
  // Centrale agendafilter: alleen geldige Startdatum vereist (Offerte blijft zichtbaar)
  const filteredProjects=projects.filter(p=>{
    if(!validDate(p.startdatum))return false;
    const afds=getAllAfds(p);
    if(afdFilter&&!afds.includes(afdFilter as Afdeling))return false;
    return true;
  }).map(p=>validDate(p.afloopdatum)?p:{...p,afloopdatum:(()=>{const d=new Date(p.startdatum);d.setHours(17,0,0,0);return d.toISOString();})()});
  // Projecten met planningregels worden per tijdvak getoond: zelfde tijd = één blok, andere tijd = apart blok
  const agendaProjects:Project[]=[];
  filteredProjects.forEach(p=>{
    const rows=projectPlans(availability,p.id);
    if(!rows.length){agendaProjects.push(p);return;}
    const groups=new Map<string,AvailEntry[]>();
    rows.forEach(r=>{const k=`${r.date}|${r.startTime}|${r.endTime}|${r.reeksId||""}|${r.teamId||""}`;groups.set(k,[...(groups.get(k)||[]),r]);});
    [...groups.entries()].forEach(([k,rs])=>{
      const [date,st,et,rk,tm]=k.split("|");
      const ids=[...new Set(rs.map(r=>r.employeeId))].sort();
      agendaProjects.push({...p,id:`${p.id}::${date}::${st}::${et}::${rk}::${tm}`,medewerkers:ids,
        startdatum:combineLocalDT(date,st,8,0),afloopdatum:combineLocalDT(date,et,17,0),
        eersteVanDag:rs.some(r=>r.isFirstOfDay),
        // Agenda kleurt projectblokken uitsluitend op afdeling (geen team-/statuskleur)
        teamKleur:undefined});
    });
  });
  // Agenda toont uitsluitend projecten/projectplanningen; persoonlijke afwezigheid blijft in Personeelsplanning.
  const realId=(id:string)=>id.split("::")[0];
  const openReal=(vp:Project)=>{const real=projects.find(x=>x.id===realId(vp.id));onOpenProject(real||vp);};
  const handleDropProject=(id:string,newStart:Date)=>{
    const p=projects.find(x=>x.id===realId(id));if(!p)return;id=p.id;
    const dur=new Date(p.afloopdatum).getTime()-new Date(p.startdatum).getTime();
    const origStart=new Date(p.startdatum);
    newStart.setHours(origStart.getHours(),origStart.getMinutes(),0,0);
    updateProject(id,{startdatum:newStart.toISOString(),afloopdatum:new Date(newStart.getTime()+dur).toISOString()});
  };
  const handleDropProjectTime=(id:string,newStart:Date)=>{
    const p=projects.find(x=>x.id===realId(id));if(!p)return;id=p.id;
    const dur=new Date(p.afloopdatum).getTime()-new Date(p.startdatum).getTime();
    updateProject(id,{startdatum:newStart.toISOString(),afloopdatum:new Date(newStart.getTime()+dur).toISOString()});
  };
  // Dagweergave: sleep een blok dat uit planningregels komt -> verplaats die planningregels zelf.
  const handleDropProjectDayTime=(id:string,newStart:Date)=>{
    const parts=id.split("::");
    if(parts.length>=4){
      const [pid,oldDate,oldSt,oldEt,oldRk="",oldTm=""]=parts;
      const rows=availability.filter(r=>
        String(r.projectId||"")===String(pid)
        &&String(r.date).slice(0,10)===oldDate
        &&r.startTime===oldSt
        &&r.endTime===oldEt
        &&String(r.reeksId||"")===String(oldRk||"")
        &&String(r.teamId||"")===String(oldTm||""));
      if(rows.length){
        const newDate=toDateStr(newStart);
        const newStartMin=newStart.getHours()*60+newStart.getMinutes();
        const updated=rows.map(r=>{
          const dur=Math.max(15,toMin(r.endTime)-toMin(r.startTime));
          return {...r,date:newDate,startTime:fromMin(newStartMin),endTime:fromMin(Math.min(24*60,newStartMin+dur))};
        });
        void onSaveManyPlanning(updated);
        return;
      }
    }
    handleDropProjectTime(id,newStart);
  };
  const handleResize=(id:string,newEnd:Date)=>{updateProject(realId(id),{afloopdatum:newEnd.toISOString()});};
  const handleClickDate=(d:Date)=>{const s=new Date(d);s.setHours(8,0,0,0);const e=new Date(d);e.setHours(17,0,0,0);onCreateProject({startdatum:s.toISOString(),afloopdatum:e.toISOString()});};
  const handleClickDateTime=(d:Date,h:number)=>{const s=new Date(d);s.setHours(h,0,0,0);const e=new Date(d);e.setHours(h+2,0,0,0);onCreateProject({startdatum:s.toISOString(),afloopdatum:e.toISOString()});};
  const qLabels=["Q1 (jan–mrt)","Q2 (apr–jun)","Q3 (jul–sep)","Q4 (okt–dec)"];
  const titleStr=view==="month"?`${MONTHS_NL[month]} ${year}`:view==="week"?`${weekDays[0].getDate()} ${MONTHS_NL[weekDays[0].getMonth()]} – ${weekDays[6].getDate()} ${MONTHS_NL[weekDays[6].getMonth()]} ${year}`:view==="kwartaal"?`${qLabels[quarter]} ${year}`:`${DAYS_FULL[(date.getDay()+6)%7]} ${date.getDate()} ${MONTHS_NL[date.getMonth()]} ${year}`;

  return <div className="flex flex-col h-full" style={{height:"calc(100vh - 0px)"}}>
    <div className="px-3 md:px-5 py-2 md:py-3 border-b border-[rgba(26,39,68,0.08)] flex-shrink-0 bg-white space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-base md:text-xl font-bold text-[#1A2744]">Agenda</h1>
        <div className="flex items-center gap-1">
          <button onClick={()=>navigate(-1)} className="p-1.5 rounded-lg hover:bg-[#F0F3F8] text-[#6B7A99] hover:text-[#1A2744] transition-colors"><ChevronLeft className="w-4 h-4"/></button>
          <span className="font-semibold text-[#1A2744] text-xs md:text-sm min-w-36 md:min-w-56 text-center">{titleStr}</span>
          <button onClick={()=>navigate(1)} className="p-1.5 rounded-lg hover:bg-[#F0F3F8] text-[#6B7A99] hover:text-[#1A2744] transition-colors"><ChevronRight className="w-4 h-4"/></button>
        </div>
        <button onClick={()=>setDate(new Date())} className="px-2 py-1 text-xs font-medium border border-[rgba(26,39,68,0.15)] rounded-lg text-[#6B7A99] hover:bg-[#F0F3F8]">Vandaag</button>
        <div className="flex-1"/>
        <div className="flex rounded-lg border border-[rgba(26,39,68,0.12)] overflow-hidden">
          {([["month","Maand"],["week","Week"],["day","Dag"],["kwartaal","Kw."]] as [CalView,string][]).map(([v,l])=><button key={v} onClick={()=>setView(v)} className={`px-2 md:px-3 py-1.5 text-xs font-medium transition-colors ${view===v?"bg-[#1A2744] text-white":"text-[#6B7A99] hover:bg-[#F0F3F8]"}`}>{l}</button>)}
        </div>
        <Btn size="sm" onClick={()=>onCreateProject({})}><Plus className="w-3.5 h-3.5"/><span className="hidden sm:inline">Nieuw werk</span></Btn>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={afdFilter} onChange={setAfdFilter} options={AFDS.map(a=>({value:a,label:a}))} className="w-32 md:w-36"/>
        <button onClick={()=>setShowWeekNumbers(p=>!p)} className={`px-2 py-0.5 text-xs rounded-lg font-medium transition-colors ${showWeekNumbers?"bg-[#E0F7F6] text-[#0ABFB8]":"text-[#6B7A99] hover:bg-[#F0F3F8]"}`}>Wk#</button>
      </div>

    </div>
    <div className="flex-1 overflow-hidden bg-white">
      {view==="month"&&<div className="h-full overflow-y-auto">
        <MonthView year={year} month={month} projects={agendaProjects} employees={employees} schoolRegions={schoolRegions}
          onClickProject={openReal} onClickDate={handleClickDate} onDropProject={handleDropProject} showWeekNumbers={showWeekNumbers}/>
      </div>}
      {view==="week"&&<WeekView weekDays={weekDays} projects={agendaProjects} employees={employees}
        onClickProject={openReal} onClickDateTime={handleClickDateTime}
        onDropProject={handleDropProjectTime} onResizeProject={handleResize}/>}
      {view==="day"&&<DayView date={date} projects={agendaProjects} employees={employees}
        onClickProject={openReal} onClickTime={h=>handleClickDateTime(date,h)}
        onDropProject={handleDropProjectDayTime} onResizeProject={handleResize}/>}
      {view==="kwartaal"&&<div className="h-full overflow-y-auto">
        <KwartaalView year={year} quarter={quarter} projects={agendaProjects} employees={employees} schoolRegions={schoolRegions}
          onClickProject={openReal} onClickDate={handleClickDate} onDropProject={handleDropProject} showWeekNumbers={showWeekNumbers}/>
      </div>}
    </div>
  </div>;
}

// ===== MEDEWERKER INPLANNEN =====
function PlanEmployeeModal({employees,projects,availability,empId,date,startTime,endTime,projectId,editId,onSave,onDelete,onClose}:{
  employees:Employee[];projects:Project[];availability:AvailEntry[];
  empId:string;date:string;startTime:string;endTime:string;projectId?:string;editId?:string;
  onSave:(entry:AvailEntry)=>Promise<void>;onDelete?:(id:string)=>Promise<void>;onClose:()=>void;
}){
  const [emp,setEmp]=useState(empId);
  const [d,setD]=useState(date);
  const [st,setSt]=useState(startTime);
  const [et,setEt]=useState(endTime);
  const [q,setQ]=useState("");
  const [sel,setSel]=useState<Project|null>(projectId?projects.find(p=>p.id===projectId)||null:null);
  const [busy,setBusy]=useState(false);
  const results=q.trim().length===0?[]:projects.filter(p=>{
    const s=q.trim().toLowerCase();
    return (p.werknummer||"").toLowerCase().includes(s)||(p.projectnr||"").toLowerCase().includes(s)||
      (p.projectnaam||"").toLowerCase().includes(s)||(p.werkzaamheden||"").toLowerCase().includes(s);
  }).slice(0,20);
  const conflicts=sel?findConflicts(availability,employees,projects,emp,d,st,et,editId):[];
  const blockers=blockingOnly(conflicts);
  const warnings=warningsOnly(conflicts);
  const [confirmed,setConfirmed]=useState(false);
  const needsConfirm=warnings.length>0&&!confirmed;
  const canSave=!!sel&&!!emp&&!!d&&st<et&&blockers.length===0&&!needsConfirm&&!busy;
  const save=async()=>{
    if(!sel||busy)return;
    setBusy(true);
    await onSave({
      id:editId||("plan-"+nid()),employeeId:emp,date:d,startTime:st,endTime:et,
      status:"Ingepland",note:`${sel.werknummer} – ${sel.projectnaam}`,projectId:sel.id,
    });
    setBusy(false);
  };
  return <Modal title="Medewerker inplannen" onClose={onClose} width="max-w-2xl">
    <div className="p-4 md:p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select label="Medewerker" value={emp} onChange={setEmp} options={employees.map(e=>({value:e.id,label:e.naam}))}/>
        <Input label="Datum" value={d} onChange={setD} type="date"/>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Begintijd" value={st} onChange={setSt} type="time"/>
          <Input label="Eindtijd" value={et} onChange={setEt} type="time"/>
        </div>
      </div>
      {!sel?<div>
        <Input label="Werk zoeken" value={q} onChange={setQ} placeholder="Werknummer, werknaam of werkzaamheden..."/>
        {q.trim()&&<div className="mt-2 border border-[rgba(26,39,68,0.1)] rounded-xl divide-y divide-[rgba(26,39,68,0.06)] max-h-64 overflow-y-auto">
          {results.length===0&&<p className="p-3 text-xs text-[#6B7A99]">Geen projecten gevonden.</p>}
          {results.map(p=><button key={p.id} type="button" onClick={()=>setSel(p)} className="w-full text-left p-3 hover:bg-[#F8F9FC]">
            <p className="text-sm font-semibold text-[#1A2744]">{p.werknummer} – {p.projectnaam}</p>
            <p className="text-xs text-[#6B7A99] truncate">{p.werkzaamheden||"Geen omschrijving"}</p>
          </button>)}
        </div>}
      </div>:<div className="border border-[rgba(26,39,68,0.1)] rounded-xl p-4 space-y-2 bg-[#F8F9FC]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#1A2744]">{sel.werknummer} – {sel.projectnaam}</p>
            <p className="text-xs text-[#6B7A99]">{sel.werkzaamheden||"Geen omschrijving"}</p>
          </div>
          {!projectId&&<button type="button" onClick={()=>{setSel(null);setQ("");}} className="text-xs text-[#0ABFB8] font-semibold flex-shrink-0">Wijzigen</button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div><span className="text-[#6B7A99]">Afdeling</span><p className="font-semibold text-[#1A2744]">{getAllAfds(sel).join(", ")}</p></div>
          <div><span className="text-[#6B7A99]">Calculator</span><p className="font-semibold text-[#1A2744]">{plName(sel,employees)||"—"}</p></div>
          <div><span className="text-[#6B7A99]">Status</span><p className="font-semibold text-[#1A2744]">{sel.status}</p></div>
        </div>
      </div>}
      {blockers.length>0&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-1">
        <p className="text-xs font-bold text-red-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>Conflict — inplannen is niet mogelijk</p>
        {blockers.map((c,i)=><p key={i} className="text-xs text-red-700">{c.employee} · {c.label} · {c.time}</p>)}
      </div>}
      {blockers.length===0&&warnings.length>0&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
        <p className="text-xs font-bold text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>Let op — deze medewerker staat al op een ander project in dit tijdvak</p>
        {warnings.map((c,i)=><p key={i} className="text-xs text-amber-800">{c.employee} · {c.label} · {c.time}</p>)}
        {!confirmed
          ?<div className="flex gap-2 pt-1"><Btn size="sm" onClick={()=>setConfirmed(true)}>Planning toch opslaan</Btn><Btn size="sm" variant="secondary" onClick={onClose}>Annuleren</Btn></div>
          :<p className="text-xs text-amber-800 font-semibold">Bevestigd — je kunt nu opslaan.</p>}
      </div>}
      {st>=et&&<p className="text-xs text-red-600">Eindtijd moet na de begintijd liggen.</p>}
      <div className="flex justify-between gap-2 pt-1">
        <div>{editId&&onDelete&&<Btn variant="danger" onClick={async()=>{setBusy(true);await onDelete(editId);setBusy(false);}} disabled={busy}><Trash2 className="w-3.5 h-3.5"/>Planning verwijderen</Btn>}</div>
        <div className="flex gap-2">
          <Btn variant="secondary" onClick={onClose}>Annuleren</Btn>
          <Btn onClick={save} disabled={!canSave}>{busy?"Opslaan…":"Inplannen"}</Btn>
        </div>
      </div>
    </div>
  </Modal>;
}

// ===== FILTERBEHEER =====
function FilterManagerModal({filters,onSave,onClose}:{filters:PlanFilter[];onSave:(f:PlanFilter[])=>void;onClose:()=>void}){
  const [list,setList]=useState<PlanFilter[]>(filters.length?filters:DEFAULT_PLAN_FILTERS);
  const upd=(id:string,u:Partial<PlanFilter>)=>setList(prev=>prev.map(f=>f.id===id?{...f,...u}:f));
  const move=(i:number,dir:number)=>setList(prev=>{const n=[...prev];const j=i+dir;if(j<0||j>=n.length)return prev;[n[i],n[j]]=[n[j],n[i]];return n;});
  return <Modal title="Filters beheren" onClose={onClose} width="max-w-xl">
    <div className="p-4 md:p-6 space-y-3">
      {list.map((f,i)=><div key={f.id} className="flex items-center gap-2 border border-[rgba(26,39,68,0.1)] rounded-xl p-2">
        <input type="color" value={f.kleur} onChange={e=>upd(f.id,{kleur:e.target.value})} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" title="Filterkleur"/>
        <input value={f.naam} onChange={e=>upd(f.id,{naam:e.target.value})} className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-[rgba(26,39,68,0.12)] rounded-lg text-[#1A2744]"/>
        <select value={f.afdeling} onChange={e=>upd(f.id,{afdeling:e.target.value})} className="px-2 py-1.5 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg text-[#6B7A99]">
          <option value="">Alle afdelingen</option>
          {AFDS.map(a=><option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={()=>upd(f.id,{actief:!f.actief})} className={`px-2 py-1 rounded-lg text-xs font-semibold ${f.actief?"bg-[#E0F7F6] text-[#0ABFB8]":"bg-[#F0F3F8] text-[#B8C3D9]"}`}>{f.actief?"Actief":"Uit"}</button>
        <button onClick={()=>move(i,-1)} className="p-1 text-[#6B7A99] hover:text-[#1A2744]" title="Omhoog">↑</button>
        <button onClick={()=>move(i,1)} className="p-1 text-[#6B7A99] hover:text-[#1A2744]" title="Omlaag">↓</button>
        <button onClick={()=>setList(prev=>prev.filter(x=>x.id!==f.id))} className="p-1 text-[#B8C3D9] hover:text-[#FF6B5B]" title="Verwijderen"><Trash2 className="w-3.5 h-3.5"/></button>
      </div>)}
      <Btn variant="secondary" size="sm" onClick={()=>setList(prev=>[...prev,{id:"pf"+nid(),naam:"Nieuw filter",kleur:"#0ABFB8",afdeling:"",actief:true}])}><Plus className="w-3.5 h-3.5"/>Filter toevoegen</Btn>
      <div className="flex justify-end gap-2 pt-2">
        <Btn variant="secondary" onClick={onClose}>Annuleren</Btn>
        <Btn onClick={()=>{onSave(list);onClose();}}>Opslaan</Btn>
      </div>
    </div>
  </Modal>;
}

// ===== AFWEZIGHEID (vakantie, ziek, vrij, bezet) =====
interface AbsenceDraft{periodeId?:string;employeeId:string;startDate:string;endDate:string;startTime:string;endTime:string;status:AvailStatus;note:string;wholeDay:boolean;}
function AbsenceModal({employees,availability,projects,draft,onSave,onDelete,onClose}:{
  employees:Employee[];availability:AvailEntry[];projects:Project[];draft:AbsenceDraft;
  onSave:(d:AbsenceDraft)=>Promise<void>;onDelete?:(periodeId:string)=>Promise<void>;onClose:()=>void;
}){
  const [f,setF]=useState<AbsenceDraft>(draft);
  const [busy,setBusy]=useState(false);
  const upd=(u:Partial<AbsenceDraft>)=>setF(p=>({...p,...u}));
  const st=f.wholeDay?"00:00":f.startTime,et=f.wholeDay?"23:59":f.endTime;
  const days=(f.startDate&&f.endDate&&f.startDate<=f.endDate)?getDatesInRange(new Date(f.startDate),new Date(f.endDate)):[];
  const own=f.periodeId?availability.filter(a=>a.periodeId===f.periodeId).map(a=>a.id):[];
  const conflicts=days.flatMap(d=>findConflictsMulti(availability,employees,projects,f.employeeId,d,st,et,own));
  const canSave=!!f.employeeId&&days.length>0&&st<et&&!busy;
  return <Modal title={f.periodeId?"Afwezigheid bewerken":"Afwezigheid toevoegen"} onClose={onClose} width="max-w-xl">
    <div className="p-4 md:p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Medewerker" value={f.employeeId} onChange={v=>upd({employeeId:v})} options={employees.map(e=>({value:e.id,label:e.naam}))}/>
        <Select label="Status" value={f.status} onChange={v=>upd({status:v as AvailStatus})} options={ABSENCE_STATS.map(s=>({value:s,label:s}))}/>
        <Input label="Startdatum" value={f.startDate} onChange={v=>upd({startDate:v})} type="date"/>
        <Input label="Einddatum" value={f.endDate} onChange={v=>upd({endDate:v})} type="date"/>
      </div>
      <label className="flex items-center gap-2 text-xs text-[#6B7A99]">
        <input type="checkbox" checked={f.wholeDay} onChange={e=>upd({wholeDay:e.target.checked})}/>
        Hele dagen (geen tijden — de volledige geselecteerde periode geldt)
      </label>
      {!f.wholeDay&&<div className="grid grid-cols-2 gap-3">
        <Input label="Starttijd" value={f.startTime} onChange={v=>upd({startTime:v})} type="time"/>
        <Input label="Eindtijd" value={f.endTime} onChange={v=>upd({endTime:v})} type="time"/>
      </div>}
      <Input label="Notitie" value={f.note} onChange={v=>upd({note:v})} placeholder="Optioneel"/>
      <p className="text-xs text-[#6B7A99]">{days.length>0?`${days.length} dag${days.length>1?"en":""} · ${st}–${et}`:"Kies een geldige periode."}</p>
      {conflicts.length>0&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
        <p className="text-xs font-bold text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>Let op — bestaande blokken in deze periode</p>
        {conflicts.slice(0,6).map((c,i)=><p key={i} className="text-xs text-amber-800">{c.employee} · {c.status} · {fmtDate(c.date)} · {c.time} · {c.label}</p>)}
      </div>}
      <div className="flex justify-between gap-2 pt-1">
        <div>{f.periodeId&&onDelete&&<Btn variant="danger" disabled={busy} onClick={async()=>{setBusy(true);await onDelete(f.periodeId!);setBusy(false);}}><Trash2 className="w-3.5 h-3.5"/>Periode verwijderen</Btn>}</div>
        <div className="flex gap-2">
          <Btn variant="secondary" onClick={onClose}>Annuleren</Btn>
          <Btn disabled={!canSave} onClick={async()=>{setBusy(true);await onSave({...f,startTime:st,endTime:et});setBusy(false);}}>{busy?"Opslaan…":"Opslaan"}</Btn>
        </div>
      </div>
    </div>
  </Modal>;
}
// Conflicten voor een dag, meerdere eigen records uitgesloten (bij het bewerken van een periode)
function findConflictsMulti(av:AvailEntry[],employees:Employee[],projects:Project[],empId:string,date:string,start:string,end:string,ignoreIds:string[]):PlanConflict[]{
  return findConflicts(av.filter(a=>!ignoreIds.includes(a.id)),employees,projects,empId,date,start,end);
}

// ===== KLEUREN BEHEREN =====
function ColorManagerModal({settings,projects,teams,onSave,onClose}:{
  settings:AppSettings;projects:Project[];teams:{key:string;label:string}[];
  onSave:(s:AppSettings)=>void;onClose:()=>void;
}){
  const [s,setS]=useState<AppSettings>(settings);
  const statusColors=s.statusColors||{};
  const projectColors=s.projectColors||{};
  const teamColors=s.teamColors||{};
  const borderColors=s.borderColors||{};
  const badgeColors=s.badgeColors||{};
  const filters=s.planFilters?.length?s.planFilters:DEFAULT_PLAN_FILTERS;
  const row=(key:string,naam:string,kleur:string,onChange:(c:string)=>void,onReset:()=>void)=>
    <div key={key} className="flex items-center gap-2 border border-[rgba(26,39,68,0.08)] rounded-xl px-2 py-1.5">
      <input type="color" value={kleur} onChange={e=>onChange(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0"/>
      <span className="flex-1 min-w-0 truncate text-xs text-[#1A2744] font-medium">{naam}</span>
      <span className="px-2 py-0.5 rounded text-[10px] font-semibold text-white" style={{backgroundColor:kleur}}>Voorbeeld</span>
      <button onClick={onReset} className="text-[10px] text-[#6B7A99] hover:text-[#1A2744] font-semibold">Standaard</button>
    </div>;
  const section=(title:string,children:React.ReactNode)=><div className="space-y-2"><h3 className="text-xs font-bold uppercase tracking-wide text-[#6B7A99]">{title}</h3><div className="space-y-1.5">{children}</div></div>;
  return <Modal title="Kleuren beheren" onClose={onClose} width="max-w-2xl">
    <div className="p-4 md:p-6 space-y-5 max-h-[70vh] overflow-y-auto">
      {section("Statussen",AVAIL_STATS.map(st=>row("st-"+st,st,statusColorOf(st,statusColors),
        c=>setS(p=>({...p,statusColors:{...(p.statusColors||{}),[st]:c}})),
        ()=>setS(p=>{const n={...(p.statusColors||{})};delete n[st];return{...p,statusColors:n};}))))}
      {section("Afdelingen",AFDS.map(a=>row("af-"+a,a,s.deptColors[a].bg,
        c=>setS(p=>({...p,deptColors:{...p.deptColors,[a]:{...p.deptColors[a],bg:c,border:c}}})),
        ()=>setS(p=>({...p,deptColors:{...p.deptColors,[a]:DEFAULT_DC[a]}})))))}
      {section("Filters",filters.map(f=>row("fl-"+f.id,f.naam,f.kleur,
        c=>setS(p=>({...p,planFilters:filters.map(x=>x.id===f.id?{...x,kleur:c}:x)})),
        ()=>setS(p=>({...p,planFilters:filters.map(x=>x.id===f.id?{...x,kleur:DEFAULT_DC[(x.afdeling as Afdeling)]?.bg||"#0ABFB8"}:x)})))))}
      {teams.length>0&&section("Teams",teams.map(t=>row("tm-"+t.key,t.label,teamColor(t.key,teamColors),
        c=>setS(p=>({...p,teamColors:{...(p.teamColors||{}),[t.key]:c}})),
        ()=>setS(p=>{const n={...(p.teamColors||{})};delete n[t.key];return{...p,teamColors:n};}))))}
      {section("Dagranden (hele dag afwezig)",ABSENCE_STATS.map(st=>row("bd-"+st,st,borderColorOf(st,borderColors,statusColors),
        c=>setS(p=>({...p,borderColors:{...(p.borderColors||{}),[st]:c}})),
        ()=>setS(p=>{const n={...(p.borderColors||{})};delete n[st];return{...p,borderColors:n};}))))}
      {section("Badges (planningsstatus)",(Object.keys(DEFAULT_BADGE_COLORS) as PlanStatus[]).map(st=>row("bg-"+st,PLAN_STATUS_LABEL[st],badgeColorOf(st,badgeColors),
        c=>setS(p=>({...p,badgeColors:{...(p.badgeColors||{}),[st]:c}})),
        ()=>setS(p=>{const n={...(p.badgeColors||{})};delete n[st];return{...p,badgeColors:n};}))))}
      {projects.length>0&&section("Werken",projects.slice(0,40).map(pr=>row("pr-"+pr.id,`${pr.werknummer} – ${pr.projectnaam}`,projectColors[pr.id]||DEFAULT_DC[primaryAfd(pr)].bg,
        c=>setS(p=>({...p,projectColors:{...(p.projectColors||{}),[pr.id]:c}})),
        ()=>setS(p=>{const n={...(p.projectColors||{})};delete n[pr.id];return{...p,projectColors:n};}))))}
    </div>
    <div className="flex justify-between gap-2 px-4 md:px-6 py-3 border-t border-[rgba(26,39,68,0.08)]">
      <Btn variant="ghost" onClick={()=>setS(p=>({...p,deptColors:DEFAULT_DC,planFilters:(p.planFilters?.length?p.planFilters:DEFAULT_PLAN_FILTERS).map(f=>({...f,kleur:DEFAULT_DC[(f.afdeling as Afdeling)]?.bg||"#0ABFB8"})),teamColors:{},statusColors:{},projectColors:{},borderColors:{},badgeColors:{}}))}>Alles standaard herstellen</Btn>
      <div className="flex gap-2">
        <Btn variant="secondary" onClick={onClose}>Annuleren</Btn>
        <Btn onClick={()=>{onSave(s);onClose();}}>Opslaan</Btn>
      </div>
    </div>
  </Modal>;
}


// ===== VASTE VRIJE DAGEN =====
interface FixedFreeDraft{periodeId?:string;employeeId:string;weekdays:number[];startDate:string;endDate:string;}
function FixedFreeDaysModal({employees,series,draft,onSave,onDelete,onClose}:{
  employees:Employee[];series:FixedFreeSeries[];draft:FixedFreeDraft;
  onSave:(d:FixedFreeDraft)=>Promise<void>;onDelete:(periodeId:string)=>Promise<void>;onClose:()=>void;
}){
  const [f,setF]=useState<FixedFreeDraft>(draft);
  const [busy,setBusy]=useState(false);
  const own=series.filter(s=>s.employeeId===f.employeeId);
  const toggleWd=(i:number)=>setF(p=>({...p,weekdays:p.weekdays.includes(i)?p.weekdays.filter(x=>x!==i):[...p.weekdays,i].sort((a,b)=>a-b)}));
  const canSave=!!f.employeeId&&f.weekdays.length>0&&!!f.startDate&&!!f.endDate&&f.startDate<=f.endDate&&!busy;
  return <Modal title={f.periodeId?"Vaste vrije dagen wijzigen":"Vaste vrije dagen"} onClose={onClose} width="max-w-xl">
    <div className="p-4 md:p-6 space-y-4">
      <Select label="Medewerker" value={f.employeeId} onChange={v=>setF(p=>({...p,employeeId:v,periodeId:undefined}))} options={employees.map(e=>({value:e.id,label:e.naam}))}/>
      <div>
        <p className="text-xs font-semibold text-[#6B7A99] mb-1.5">Vaste vrije weekdagen</p>
        <div className="flex flex-wrap gap-1.5">
          {WD_LABELS.map((l,i)=><button key={l} type="button" onClick={()=>toggleWd(i)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${f.weekdays.includes(i)?"bg-[#1A2744] text-white border-transparent":"bg-white text-[#6B7A99] border-[rgba(26,39,68,0.12)]"}`}>{l}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Vanaf datum" type="date" value={f.startDate} onChange={v=>setF(p=>({...p,startDate:v}))}/>
        <Input label="Tot en met datum" type="date" value={f.endDate} onChange={v=>setF(p=>({...p,endDate:v}))}/>
      </div>
      <p className="text-xs text-[#6B7A99]">Op deze dagen wordt de medewerker automatisch als hele dag <b>Vrij</b> gezet. Bestaande projectplanning en losse uitzonderingen blijven altijd staan.</p>
      {own.length>0&&<div className="space-y-1.5">
        <p className="text-xs font-semibold text-[#6B7A99]">Bestaande reeksen</p>
        {own.map(s=><div key={s.periodeId} className="flex items-center gap-2 border border-[rgba(26,39,68,0.08)] rounded-xl px-3 py-2">
          <span className="flex-1 min-w-0 truncate text-xs text-[#1A2744]">{s.serieWeekdays.map(i=>WD_FULL[i]).join(", ")} — {fmtDate(s.serieStartDate)} t/m {fmtDate(s.serieEndDate)}</span>
          <button className="text-[11px] font-semibold text-[#0ABFB8]" onClick={()=>setF({periodeId:s.periodeId,employeeId:s.employeeId,weekdays:[...s.serieWeekdays],startDate:s.serieStartDate,endDate:s.serieEndDate})}>Wijzigen</button>
          <button className="text-[11px] font-semibold text-red-600" disabled={busy} onClick={async()=>{setBusy(true);await onDelete(s.periodeId);setBusy(false);}}>Verwijderen</button>
        </div>)}
      </div>}
      <div className="flex justify-end gap-2 pt-1">
        <Btn variant="secondary" onClick={onClose}>Annuleren</Btn>
        <Btn disabled={!canSave} onClick={async()=>{setBusy(true);await onSave(f);setBusy(false);}}>{busy?"Opslaan…":"Opslaan"}</Btn>
      </div>
    </div>
  </Modal>;
}

// ===== PERSONEELSPLANNING =====
type PlanView="dag"|"week"|"maand"|"kwartaal";
// Greep rechts op een blok: slepen (week) of het venster "Periode aanpassen" (kleine cellen)
// Periode/tijd van een blok aanpassen via een venster (kleine cellen of mobiel)
function PeriodResizeModal({block,start,end,onClose,onSave}:{block:AvailEntry;start:string;end:string;onClose:()=>void;onSave:(p:{endTime?:string;endDate?:string})=>Promise<void>;}){
  const [endDate,setEndDate]=useState(end);
  const [endTime,setEndTime]=useState(block.endTime);
  return <Modal title="Periode aanpassen" onClose={onClose} width="max-w-md">
    <div className="p-4 md:p-6 space-y-4">
      <p className="text-sm text-[#6B7A99]">Startdatum <b>{fmtDate(start)}</b> · begintijd <b>{block.startTime}</b></p>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Einddatum" type="date" value={endDate} onChange={v=>setEndDate(v)}/>
        <Input label="Eindtijd" type="time" value={endTime} onChange={v=>setEndTime(v)}/>
      </div>
      <div className="flex justify-end gap-2">
        <Btn variant="secondary" onClick={onClose}>Annuleren</Btn>
        <Btn onClick={async()=>{
          if(toMin(endTime)<toMin(block.startTime)+15){toast.error("De eindtijd moet minimaal 15 minuten na de begintijd liggen.");return;}
          if(endDate<start){toast.error("De einddatum mag niet vóór de startdatum liggen.");return;}
          await onSave({endDate,endTime});
        }}>Opslaan</Btn>
      </div>
    </div>
  </Modal>;
}

function ResizeHandle({small,active,label,onStart,onOpen}:{small:boolean;active:boolean;label?:string;onStart:(ev:React.PointerEvent)=>void;onOpen:()=>void;}){
  return <>
    <span title={small?"Periode aanpassen":"Sleep om de einddatum aan te passen"}
      onPointerDown={ev=>{if(small)return;onStart(ev);}}
      onClick={ev=>{ev.stopPropagation();if(small)onOpen();}}
      className={`absolute right-0 top-0 h-full flex items-center justify-center touch-none ${small?"w-3 cursor-pointer":"w-2.5 cursor-ew-resize"} opacity-100 md:opacity-0 md:group-hover:opacity-100`}>
      <span className="w-1 h-3/4 rounded-full bg-white/90 ring-1 ring-[#0ABFB8]"/>
    </span>
    {active&&label&&<span className="absolute -top-4 right-0 z-20 whitespace-nowrap rounded bg-[#1A2744] px-1 text-[9px] text-white">{label}</span>}
  </>;
}

function PersoneelsplanningView({projects,employees,availability,settings,onSaveSettings,onSavePlanning,onSaveManyPlanning,onResizePlanning,onDeletePlanning,onSaveAbsence,onDeleteAbsence,onOpenProject,onVacImport}:{
  projects:Project[];employees:Employee[];availability:AvailEntry[];
  settings:AppSettings;onSaveSettings:(s:AppSettings)=>void;
  onSavePlanning:(e:AvailEntry)=>Promise<boolean>;onSaveManyPlanning:(e:AvailEntry[])=>Promise<boolean>;
  onResizePlanning:(e:AvailEntry[],removeIds:string[])=>Promise<boolean>;
  onDeletePlanning:(id:string)=>Promise<void>;
  onSaveAbsence:(d:AbsenceDraft)=>Promise<void>;onDeleteAbsence:(periodeId:string)=>Promise<void>;
  onOpenProject:(p:Project)=>void;onVacImport:()=>void;
}){
  const dc=useDC();
  const [view,setView]=useState<PlanView>("week");
  const [refDate,setRefDate]=useState(()=>{const d=new Date();d.setHours(0,0,0,0);return d;});
  const [showFilters,setShowFilters]=useState(false);
  const [showColors,setShowColors]=useState(false);
  const [dragProject,setDragProject]=useState<string|null>(null);
  const [dragBlock,setDragBlock]=useState<AvailEntry|null>(null);
  const [planModal,setPlanModal]=useState<{empId:string;date:string;startTime:string;endTime:string;projectId?:string;editId?:string}|null>(null);
  const [projMenu,setProjMenu]=useState<Project|null>(null);
  const [absModal,setAbsModal]=useState<AbsenceDraft|null>(null);
  const [rangeStart,setRangeStart]=useState<{empId:string;date:string}|null>(null);
  
  const [cellMenu,setCellMenu]=useState<{empId:string;date:string;x:number;y:number;startTime?:string;endTime?:string;block?:AvailEntry}|null>(null);
  const menuRef=useRef<HTMLDivElement|null>(null);
  const [menuH,setMenuH]=useState(260);
  useEffect(()=>{if(!cellMenu)return;const el=menuRef.current;if(el)setMenuH(el.offsetHeight);
    const onKey=(ev:KeyboardEvent)=>{if(ev.key==="Escape")setCellMenu(null);};
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[cellMenu]);
  const openCellMenu=(ev:React.MouseEvent,empId:string,date:string,block?:AvailEntry)=>{
    ev.preventDefault();ev.stopPropagation();
    setCellMenu({empId,date,x:ev.clientX,y:ev.clientY,startTime:block?.startTime,endTime:block?.endTime,block});
  };
  const [teamChoice,setTeamChoice]=useState<{block:AvailEntry;empId:string;date:string;teamRows:AvailEntry[]}|null>(null);
  const [overlapAsk,setOverlapAsk]=useState<{entries:AvailEntry[];warnings:PlanConflict[];removeIds?:string[];checkFirst?:boolean}|null>(null);
  const filters=settings.planFilters?.length?settings.planFilters:DEFAULT_PLAN_FILTERS;
  const teamColors=settings.teamColors||{};
  const statusColors=settings.statusColors||{};
  const projectColors=settings.projectColors||{};
  const borderColors=settings.borderColors||{};
  const badgeColors=settings.badgeColors||{};
  const activeAfds=filters.filter(f=>f.actief&&f.afdeling).map(f=>f.afdeling);
  const afdKey=activeAfds.join("|");
  const visEmp=employees.filter(e=>activeAfds.length===0||activeAfds.includes(e.afdeling));
  // Eén projectbron voor de hele pagina: alles volgt activeAfds
  const visProjects=useMemo(()=>projects.filter(p=>activeAfds.length===0||getAllAfds(p).some(a=>activeAfds.includes(a))),[projects,afdKey]);
  const visProj=(id?:string)=>id?visProjects.find(p=>p.id===id):undefined;
  const visEmpIds=useMemo(()=>new Set(visEmp.map(e=>e.id)),[employees,afdKey]);
  const FILTER_MSG="Dit werk valt niet meer binnen de actieve afdelingsfilter.";
  // Guard: geen projectactie op een project of medewerker die buiten de filter valt
  const canAct=(projectId?:string|null,empId?:string|null)=>{
    if(!projectId)return true; // afwezigheid is niet projectgebonden
    if(!visProj(projectId)){toast.error(FILTER_MSG);return false;}
    if(empId&&!visEmpIds.has(empId)){toast.error(FILTER_MSG);return false;}
    return true;
  };
  const rowsAllowed=(rows:{projectId?:string;employeeId:string}[])=>rows.every(r=>canActSilent(r.projectId,r.employeeId));
  const canActSilent=(projectId?:string|null,empId?:string|null)=>!projectId||(!!visProj(projectId)&&(!empId||visEmpIds.has(empId)));

  const saveFilters=(list:PlanFilter[])=>onSaveSettings({...settings,planFilters:list});
  const toggleFilter=(id:string)=>saveFilters(filters.map(f=>f.id===id?{...f,actief:!f.actief}:f));
  const setTeamColor=(key:string,kleur:string)=>onSaveSettings({...settings,teamColors:{...teamColors,[key]:kleur}});
  const navigate=(dir:number)=>{const d=new Date(refDate);if(view==="dag")d.setDate(d.getDate()+dir);else if(view==="week")d.setDate(d.getDate()+dir*7);else if(view==="maand")d.setMonth(d.getMonth()+dir);else d.setMonth(d.getMonth()+dir*3);setRefDate(d);};

  // Alles komt uit dezelfde planningregels (availability met projectId)
  const rowsFor=(empId:string,ds:string)=>planRows(availability).filter(a=>a.employeeId===empId&&a.date===ds).sort(byVolgorde);
  const getEmpProjsDate=(empId:string,date:Date)=>{
    const ds=toDateStr(date);
    return rowsFor(empId,ds).map(a=>({row:a,proj:visProj(a.projectId)})).filter(x=>!!x.proj) as {row:AvailEntry;proj:Project}[];
  };
  const getEmpProjsWeek=(empId:string,wk:Date)=>{
    const days=Array.from({length:7},(_,i)=>{const d=new Date(wk);d.setDate(wk.getDate()+i);return toDateStr(d);});
    const seen=new Set<string>();const out:Project[]=[];
    planRows(availability).filter(a=>a.employeeId===empId&&days.includes(a.date)).forEach(a=>{
      const p=visProj(a.projectId);
      if(p&&!seen.has(p.id)){seen.add(p.id);out.push(p);}
    });
    return out;
  };

  // Afwezigheidsregels (vakantie/ziek/vrij/bezet) horen bij dezelfde bron
  const absFor=(empId:string,ds:string)=>availability.filter(a=>!a.projectId&&a.employeeId===empId&&a.date===ds&&ABSENCE_STATS.includes(a.status)).sort((a,b)=>a.startTime.localeCompare(b.startTime));
  // Kleur van een planningregel: nooit afhankelijk van datum, rij-index of record-id.
  // Volgorde: opgeslagen teamkleur (teamId) → opgeslagen projectkleur → stabiele kleur op projectId.
  const rowColor=(a:AvailEntry)=>{
    if(a.teamId&&teamColors[a.teamId])return teamColors[a.teamId];
    if(a.projectId&&projectColors[a.projectId])return projectColors[a.projectId];
    if(a.teamId)return teamColor(a.teamId,teamColors);
    return teamColor(a.projectId||"",teamColors);
  };

  const openPlan=(empId:string,date:string,startTime="08:00",endTime="17:00",projectId?:string)=>setPlanModal({empId,date,startTime,endTime,projectId});
  const openEditPlan=(a:AvailEntry)=>{if(!canAct(a.projectId,a.employeeId))return;setPlanModal({empId:a.employeeId,date:a.date,startTime:a.startTime,endTime:a.endTime,projectId:a.projectId,editId:a.id});};
  const openAbsence=(empId:string,startDate:string,endDate:string)=>setAbsModal({employeeId:empId,startDate,endDate,startTime:"08:00",endTime:"17:00",status:"Vakantie",note:"",wholeDay:true});
  const openEditAbsence=(a:AvailEntry)=>{
    const rows=a.periodeId?availability.filter(x=>x.periodeId===a.periodeId):[a];
    const dates=rows.map(r=>r.date).sort();
    setAbsModal({periodeId:a.periodeId,employeeId:a.employeeId,startDate:dates[0],endDate:dates[dates.length-1],
      startTime:a.startTime,endTime:a.endTime,status:a.status,note:a.note||"",wholeDay:a.startTime==="00:00"&&a.endTime==="23:59"});
  };
  // Cel aanklikken: normaal inplannen, met Shift een periode selecteren
  const cellClick=(empId:string,ds:string,ev:React.MouseEvent)=>{
    if(ev.shiftKey||rangeStart){
      if(rangeStart&&rangeStart.empId===empId){
        const [a,b]=[rangeStart.date,ds].sort();
        setRangeStart(null);openAbsence(empId,a,b);
      }else setRangeStart({empId,date:ds});
      return;
    }
    const vv=availability.find(a=>a.employeeId===empId&&a.date===ds&&a.serieType==="vastevrij"&&!!a.periodeId&&a.status==="Vrij");
    if(vv){setVrijAsk(vv);return;}
    openPlan(empId,ds);
  };

  // ===== Opslaan met conflictcontrole (blokkerend vs. waarschuwing) =====
  const evaluate=(entries:AvailEntry[],extraIgnore:string[]=[]):PlanConflict[]=>{
    const ids=[...entries.map(e=>e.id),...extraIgnore];
    const base=availability.filter(a=>!ids.includes(a.id));
    return entries.flatMap(e=>findConflicts(base,employees,projects,e.employeeId,e.date,e.startTime,e.endTime));
  };
  const commitPlanning=async(entries:AvailEntry[],removeIds?:string[],checkFirst=false)=>{
    // Laatste controle: nooit opslaan voor een project buiten de actieve filter
    if(!rowsAllowed(entries)){toast.error(FILTER_MSG);return false;}
    const rem=removeIds||[];
    const list=normalizeFirstOfDay(availability,entries,rem);

    const ok=rem.length?await onResizePlanning(list,rem):await onSaveManyPlanning(list);
    if(!ok){toast.error("Opslaan mislukt — de planning blijft ongewijzigd.");return ok;}
    if(checkFirst){
      const m=firstStartMismatch(availability,list,rem);
      if(m)setFirstAsk({kind:"start",rows:m.rows,target:m.target});
    }
    return ok;
  };
  const tryCommit=async(entries:AvailEntry[],removeIds:string[]=[],checkFirst=false)=>{
    if(!rowsAllowed(entries)){toast.error(FILTER_MSG);return;}
    const c=evaluate(entries,removeIds);
    const b=blockingOnly(c);
    if(b.length){toast.error(`Conflict: ${conflictLine(b[0])}`);return;}
    const w=warningsOnly(c);
    if(w.length){setOverlapAsk({entries,warnings:w,removeIds,checkFirst});return;}
    await commitPlanning(entries,removeIds,checkFirst);
  };
  // "Als eerste uitvoeren" markeren of juist weghalen
  const [firstAsk,setFirstAsk]=useState<{kind:"start"|"reorder";rows:AvailEntry[];target:AvailEntry;fallback?:AvailEntry[]}|null>(null);
  const markFirstOfDay=async(row:AvailEntry,on:boolean)=>{
    if(!canAct(row.projectId,row.employeeId))return;
    const rows=dayPlanRows(availability,row.employeeId,row.date);
    await onSaveManyPlanning(applyFirstOfDay(rows,on?row.id:null));
  };


  // ===== Blokken doortrekken (resize) =====
  const seriesRows=(b:AvailEntry)=>{
    if(b.projectId)return b.reeksId?availability.filter(a=>a.reeksId===b.reeksId&&a.employeeId===b.employeeId):[b];
    return b.periodeId?availability.filter(a=>a.periodeId===b.periodeId):[b];
  };
  const seriesDates=(b:AvailEntry)=>seriesRows(b).map(r=>r.date).sort();
  const seriesStart=(b:AvailEntry)=>seriesDates(b)[0]||b.date;
  const seriesEnd=(b:AvailEntry)=>{const d=seriesDates(b);return d[d.length-1]||b.date;};

  // Bouwt de nieuwe reeks: bestaande dagregels bijwerken, ontbrekende toevoegen,
  // overtollige verwijderen. Ontdubbeld op medewerker+project+reeksId+datum+tijdvak.
  const buildResize=(baseRows:AvailEntry[],patch:{endTime?:string;endDate?:string})=>{
    const ups:AvailEntry[]=[];const rem:string[]=[];const seen=new Set<string>();
    baseRows.forEach(row=>{
      const reeks=row.reeksId||"rk-"+nid();
      const rows=seriesRows(row);
      const dts=rows.map(r=>r.date).sort();
      const start=dts[0]||row.date;
      const endDate=patch.endDate&&patch.endDate>=start?patch.endDate:(patch.endDate?start:(dts[dts.length-1]||row.date));
      const endTime=patch.endTime||row.endTime;
      const span=getDatesInRange(new Date(start+"T12:00"),new Date(endDate+"T12:00"));
      span.forEach(d=>{
        const key=`${row.employeeId}|${row.projectId}|${reeks}|${d}|${row.startTime}|${endTime}`;
        if(seen.has(key))return;seen.add(key);
        const ex=rows.find(r=>r.date===d);
        ups.push({...(ex||row),id:ex?ex.id:"plan-"+nid(),employeeId:row.employeeId,date:d,startTime:row.startTime,
          endTime,status:"Ingepland",projectId:row.projectId,teamId:row.teamId,reeksId:span.length>1?reeks:row.reeksId,note:row.note,
          // Nieuwe dagen in de reeks nemen de markering niet mee
          isFirstOfDay:ex?ex.isFirstOfDay:false,volgorde:ex?ex.volgorde:undefined});
      });
      rows.filter(r=>!span.includes(r.date)).forEach(r=>rem.push(r.id));
    });
    return {ups,rem};
  };
  const commitResize=async(baseRows:AvailEntry[],patch:{endTime?:string;endDate?:string})=>{
    const {ups,rem}=buildResize(baseRows,patch);
    await tryCommit(ups,rem,true);
  };
  const applyResize=async(block:AvailEntry,patch:{endTime?:string;endDate?:string})=>{
    if(!block.projectId){
      const dts=seriesDates(block);
      const endTime=patch.endTime||block.endTime;
      await onSaveAbsence({periodeId:block.periodeId,employeeId:block.employeeId,startDate:dts[0]||block.date,
        endDate:patch.endDate||dts[dts.length-1]||block.date,startTime:block.startTime,endTime,
        status:block.status,note:block.note||"",wholeDay:block.startTime==="00:00"&&endTime==="23:59"});
      return;
    }
    if(!canAct(block.projectId,block.employeeId))return;
    const teamRows=teamRowsForDay(availability,block.projectId,block.date);
    if(teamRows.length>1){setResizeTeam({patch,teamRows,block});return;}
    await commitResize([block],patch);
  };


  const resizeRef=useRef<{block:AvailEntry;mode:"time"|"date";x:number;y:number;preview:string;raw:string}|null>(null);
  const [resizePv,setResizePv]=useState<{id:string;label:string}|null>(null);
  const [lateAsk,setLateAsk]=useState<{block:AvailEntry;endTime:string;fallback:string}|null>(null);
  const [resizeTeam,setResizeTeam]=useState<{block:AvailEntry;patch:{endTime?:string;endDate?:string};teamRows:AvailEntry[]}|null>(null);
  const [periodModal,setPeriodModal]=useState<AvailEntry|null>(null);
  const colW=view==="week"?80:44;
  const startResize=(ev:React.PointerEvent,block:AvailEntry,mode:"time"|"date")=>{
    ev.preventDefault();ev.stopPropagation();
    const cur=mode==="time"?block.endTime:seriesEnd(block);
    resizeRef.current={block,mode,x:ev.clientX,y:ev.clientY,preview:cur,raw:cur};
    setResizePv({id:block.id,label:mode==="time"?cur:fmtDate(cur)});
  };
  useEffect(()=>{
    const onMove=(ev:PointerEvent)=>{
      const r=resizeRef.current;if(!r)return;
      if(r.mode==="time"){
        const steps=Math.round((ev.clientY-r.y)/8);
        const min=toMin(r.block.startTime)+15;
        const raw=Math.min(23*60+59,Math.max(min,toMin(r.block.endTime)+steps*15));
        r.raw=fromMin(raw);
        r.preview=fromMin(Math.min(raw,Math.max(min,toMin(WORKDAY_END))));
      }else{
        const steps=Math.round((ev.clientX-r.x)/colW);
        const start=seriesStart(r.block);
        let ds=shiftDate(seriesEnd(r.block),steps);
        if(ds<start)ds=start;
        r.preview=ds;r.raw=ds;
      }
      setResizePv({id:r.block.id,label:r.mode==="time"?r.preview:fmtDate(r.preview)});
    };
    const onUp=async()=>{
      const r=resizeRef.current;if(!r)return;
      resizeRef.current=null;setResizePv(null);
      if(r.mode==="time"){
        if(r.raw!==r.preview){setLateAsk({block:r.block,endTime:r.raw,fallback:r.preview});return;}
        if(r.preview!==r.block.endTime)await applyResize(r.block,{endTime:r.preview});
      }else if(r.preview!==seriesEnd(r.block))await applyResize(r.block,{endDate:r.preview});
    };
    window.addEventListener("pointermove",onMove);
    window.addEventListener("pointerup",onUp);
    return()=>{window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onUp);};
  });


  // Volgorde binnen één dag handmatig aanpassen
  const reorderDayPlans=async(row:AvailEntry,dir:number)=>{
    if(!canAct(row.projectId,row.employeeId))return;
    const list=rowsFor(row.employeeId,row.date);
    const i=list.findIndex(x=>x.id===row.id);
    const j=i+dir;
    if(i<0||j<0||j>=list.length)return;
    const next=[...list];[next[i],next[j]]=[next[j],next[i]];
    // Alleen de bovenste regel kan de markering houden; wie zakt verliest hem.
    const renum=next.map((r,idx)=>({...r,volgorde:idx,isFirstOfDay:idx===0?!!r.isFirstOfDay:false}));
    if(renum[0].id===row.id&&!row.isFirstOfDay){
      setFirstAsk({kind:"reorder",rows:renum,target:renum[0],fallback:renum});
      return;
    }
    await commitPlanning(renum);
  };

  const moveBlocks=async(rows:AvailEntry[],empId:string,ds:string)=>{
    if(!visEmpIds.has(empId)||rows.some(r=>!canActSilent(r.projectId,r.employeeId))){toast.error(FILTER_MSG);return;}
    // Bij verplaatsen naar een andere dag/medewerker vervalt de markering; de nieuwe dag wordt genormaliseerd.
    await tryCommit(rows.map(r=>({...r,employeeId:rows.length>1?r.employeeId:empId,date:ds,isFirstOfDay:false,volgorde:undefined})),[],true);
  };


  const dropOnCell=async(empId:string,ds:string)=>{
    const block=dragBlock;const pid=dragProject;
    setDragProject(null);setDragBlock(null);
    if(block){
      if(block.employeeId===empId&&block.date===ds)return;
      if(!canAct(block.projectId,block.employeeId)||!visEmpIds.has(empId)){if(block.projectId)toast.error(FILTER_MSG);return;}
      const teamRows=block.projectId?teamRowsForDay(availability,block.projectId,block.date):[];
      if(teamRows.length>1){setTeamChoice({block,empId,date:ds,teamRows});return;}
      await tryCommit([{...block,employeeId:empId,date:ds,isFirstOfDay:false,volgorde:undefined}],[],true);
      return;
    }
    if(!pid)return;
    const p=visProj(pid);if(!p||!visEmpIds.has(empId)){toast.error(FILTER_MSG);return;}
    const st=timePart(p.startdatum)||"08:00";const et=timePart(p.afloopdatum)||"17:00";
    await tryCommit([{id:"plan-"+nid(),employeeId:empId,date:ds,startTime:st,endTime:et<=st?"17:00":et,status:"Ingepland",note:`${p.werknummer} – ${p.projectnaam}`,projectId:p.id}],[],true);
  };

  // Planning verwijderen: de dag hernummeren en zo nodig het volgende project promoveren
  const deletePlanRow=async(b:AvailEntry)=>{
    if(!canAct(b.projectId,b.employeeId))return;
    const rest=b.projectId?dayPlanRows(availability,b.employeeId,b.date).filter(r=>r.id!==b.id):[];
    await onDeletePlanning(b.id);
    if(!rest.length)return;
    const keep=rest.find(r=>r.isFirstOfDay);
    const target=keep?keep.id:(b.isFirstOfDay?(rest[0]?.id||null):null);
    await onSaveManyPlanning(applyFirstOfDay(rest,target));
  };



  // Snelmenu op een cel: direct een afwezigheidsstatus zetten of inplannen
  const quickStatus=async(empId:string,ds:string,status:AvailStatus)=>{
    setCellMenu(null);
    await onSaveAbsence({employeeId:empId,startDate:ds,endDate:ds,startTime:"00:00",endTime:"23:59",status,note:"",wholeDay:true});
  };

  // ===== Vaste vrije dagen =====
  const fixedSeries=settings.fixedFreeSeries||[];
  const [ffModal,setFfModal]=useState<FixedFreeDraft|null>(null);
  const [ffAsk,setFfAsk]=useState<{draft:FixedFreeDraft;dates:string[]}|null>(null);
  const [dayOrSeries,setDayOrSeries]=useState<AvailEntry|null>(null);
  const [vrijAsk,setVrijAsk]=useState<AvailEntry|null>(null);
  const [vrijEx,setVrijEx]=useState<{row:AvailEntry;periodeId:string}|null>(null);
  const stripSeries=(a:AvailEntry):AvailEntry=>{
    const n:AvailEntry={...a};
    delete n.isSeriesException;delete n.serieType;delete n.serieWeekdays;delete n.serieStartDate;delete n.serieEndDate;delete n.periodeId;
    return n;
  };
  const isSeriesVrij=(a?:AvailEntry|null)=>!!a&&a.serieType==="vastevrij"&&!!a.periodeId;
  const clickAbsence=(a:AvailEntry)=>{if(isSeriesVrij(a))setDayOrSeries(a);else openEditAbsence(a);};
  const openFixedFree=(empId?:string)=>setFfModal({employeeId:empId||visEmp[0]?.id||employees[0]?.id||"",weekdays:[],startDate:toDateStr(refDate),endDate:toDateStr(new Date(refDate.getFullYear(),11,31))});
  // Reeks (her)opbouwen: oude gegenereerde dagen weg, uitzonderingen en projecten behouden
  const buildFixedFree=(d:FixedFreeDraft)=>{
    const pid=d.periodeId||"vv-"+nid();
    const inSeries=(ds:string)=>ds>=d.startDate&&ds<=d.endDate&&d.weekdays.includes(weekdayIdx(ds));
    const ups:AvailEntry[]=[];const rem:string[]=[];const projectDates:string[]=[];
    const meta={serieType:"vastevrij" as const,serieWeekdays:d.weekdays,serieStartDate:d.startDate,serieEndDate:d.endDate};
    availability.filter(a=>a.periodeId===pid&&!a.projectId).forEach(a=>{
      if(a.status==="Vrij"&&!a.isSeriesException){rem.push(a.id);return;}
      if(a.employeeId===d.employeeId&&inSeries(a.date))ups.push({...a,...meta,isSeriesException:true});
      else ups.push(stripSeries(a));
    });
    availability.filter(a=>a.projectId&&(a.vasteVrijExceptionIds||[]).includes(pid)).forEach(a=>{
      if(a.employeeId===d.employeeId&&inSeries(a.date))return;
      ups.push({...a,vasteVrijExceptionIds:(a.vasteVrijExceptionIds||[]).filter(x=>x!==pid)});
    });
    getDatesInRange(new Date(d.startDate+"T12:00"),new Date(d.endDate+"T12:00")).filter(inSeries).forEach(ds=>{
      const rows=availability.filter(a=>a.employeeId===d.employeeId&&a.date===ds);
      if(rows.some(a=>a.periodeId===pid&&a.isSeriesException))return;
      const proj=rows.find(a=>a.projectId);
      if(proj){
        projectDates.push(ds);
        const i=ups.findIndex(u=>u.id===proj.id);
        const cur=i>=0?ups[i]:proj;
        const merged={...cur,vasteVrijExceptionIds:[...new Set([...(cur.vasteVrijExceptionIds||[]),pid])]};
        if(i>=0)ups[i]=merged;else ups.push(merged);
        return;
      }
      // Een echte personeelsstatus (Ziek, Vakantie, Bezet) blijft altijd staan
      if(rows.some(a=>!a.projectId&&ABSENCE_STATS.includes(a.status)))return;
      ups.push({id:"av-"+nid(),employeeId:d.employeeId,date:ds,startTime:"00:00",endTime:"23:59",status:"Vrij",periodeId:pid,...meta});
    });
    return {pid,ups,rem,projectDates};
  };
  const commitFixedFree=async(d:FixedFreeDraft)=>{
    const {pid,ups,rem}=buildFixedFree(d);
    const ok=await onResizePlanning(ups,rem);
    if(!ok)return;
    onSaveSettings({...settings,fixedFreeSeries:[...fixedSeries.filter(s=>s.periodeId!==pid),
      {periodeId:pid,employeeId:d.employeeId,serieWeekdays:d.weekdays,serieStartDate:d.startDate,serieEndDate:d.endDate}]});
    setFfModal(null);setFfAsk(null);
  };
  const saveFixedFree=async(d:FixedFreeDraft)=>{
    const {projectDates}=buildFixedFree(d);
    if(projectDates.length){setFfAsk({draft:d,dates:projectDates});return;}
    await commitFixedFree(d);
  };
  const deleteFixedFree=async(pid:string)=>{
    const ups:AvailEntry[]=[];const rem:string[]=[];
    availability.filter(a=>a.periodeId===pid&&!a.projectId).forEach(a=>{
      if(a.status==="Vrij"||a.status==="Beschikbaar")rem.push(a.id);
      else ups.push(stripSeries(a));
    });
    availability.filter(a=>a.projectId&&(a.vasteVrijExceptionIds||[]).includes(pid))
      .forEach(a=>ups.push({...a,vasteVrijExceptionIds:(a.vasteVrijExceptionIds||[]).filter(x=>x!==pid)}));
    const ok=await onResizePlanning(ups,rem);
    if(!ok)return;
    onSaveSettings({...settings,fixedFreeSeries:fixedSeries.filter(s=>s.periodeId!==pid)});
  };
  const editSeries=(pid:string)=>{
    const s=fixedSeries.find(x=>x.periodeId===pid);
    if(!s){toast.error("Deze reeks is niet meer beschikbaar.");return;}
    setFfModal({periodeId:s.periodeId,employeeId:s.employeeId,weekdays:[...s.serieWeekdays],startDate:s.serieStartDate,endDate:s.serieEndDate});
  };
  // Eén dag van de reeks als uitzondering een andere status geven
  const exceptionStatus=async(a:AvailEntry,status:AvailStatus)=>{
    await onResizePlanning([{...a,status,startTime:"00:00",endTime:"23:59",isSeriesException:true}],[]);
  };
  // Project inplannen op een vaste vrije dag: de Vrij-regel van die ene dag verdwijnt eerst
  const startVrijException=async(a:AvailEntry)=>{
    const ok=await onResizePlanning([],[a.id]);
    if(!ok)return;
    setVrijEx({row:a,periodeId:a.periodeId||""});
    openPlan(a.employeeId,a.date);
  };
  const cancelVrijException=async()=>{
    const v=vrijEx;setVrijEx(null);
    if(v)await onResizePlanning([v.row],[]);
  };



  const getDayBlocks=(empId:string,date:Date)=>{
    const ds=toDateStr(date);
    const abs=availability.filter(a=>a.employeeId===empId&&a.date===ds&&!planRows([a]).length)
      .map(av=>({av,proj:undefined as Project|undefined})).sort((a,b)=>a.av.startTime.localeCompare(b.av.startTime));
    const plans=rowsFor(empId,ds).map(av=>({av,proj:visProj(av.projectId)})).filter(x=>!!x.proj);
    return [...abs,...plans];
  };


  const year=refDate.getFullYear(),month=refDate.getMonth();
  const quarter=Math.floor(month/3);
  let dates:Date[]=[];const weeks:Date[]=[];
  if(view==="dag")dates=[new Date(refDate)];
  else if(view==="week")dates=getWeekDays(refDate);
  else if(view==="maand"){const dm=new Date(year,month+1,0).getDate();dates=Array.from({length:dm},(_,i)=>new Date(year,month,i+1));}
  else{const qStart=new Date(year,quarter*3,1);const qEnd=new Date(year,quarter*3+3,0);const wk=new Date(getWeekDays(qStart)[0]);while(wk<=qEnd){weeks.push(new Date(wk));wk.setDate(wk.getDate()+7);}}
  const wd7=getWeekDays(refDate);
  const titleStr=view==="dag"?`${DAYS_FULL[(refDate.getDay()+6)%7]} ${refDate.getDate()} ${MONTHS_NL[month]} ${year}`:view==="week"?`${wd7[0].getDate()} ${MONTHS_NL[wd7[0].getMonth()].slice(0,3)} – ${wd7[6].getDate()} ${MONTHS_NL[wd7[6].getMonth()].slice(0,3)} ${year}`:view==="maand"?`${MONTHS_NL[month]} ${year}`:`Q${quarter+1} ${year}`;

  // ===== Periode =====
  const periodStart=view==="kwartaal"?new Date(year,quarter*3,1):dates[0];
  const periodEnd=view==="kwartaal"?new Date(year,quarter*3+3,0):dates[dates.length-1];

  // ===== Doorlopende meerdaagse balken =====
  // Alleen regels met hetzelfde reeksId (of aantoonbaar dezelfde doortrekactie) worden
  // visueel aan elkaar geplakt. Zonder reeksId blijft elke regel een los blok.
  const visDates=new Set(dates.map(toDateStr));
  const shiftDay=(ds:string,n:number)=>{const d=new Date(ds+"T12:00");d.setDate(d.getDate()+n);return toDateStr(d);};
  const linkedOn=(row:AvailEntry,ds:string)=>{
    if(!row.reeksId||!row.projectId)return false;
    return availability.some(a=>a.date===ds&&a.employeeId===row.employeeId&&a.projectId===row.projectId
      &&a.reeksId===row.reeksId&&(a.teamId||"")===(row.teamId||"")
      &&a.startTime===row.startTime&&a.endTime===row.endTime);
  };
  // Elk blok weet of het links/rechts doorloopt naar een aansluitende dag in beeld
  const segInfo=(row:AvailEntry)=>{
    if(!row.reeksId)return{prev:false,next:false};
    const pd=shiftDay(row.date,-1),nd=shiftDay(row.date,1);
    return{prev:visDates.has(pd)&&linkedOn(row,pd),next:visDates.has(nd)&&linkedOn(row,nd)};
  };

  // Openstaande projecten = planningslijst: uitsluitend de status "Afgerond" verbergt een project.
  // Inplannen, slepen, datums, aantallen en badges beïnvloeden de zichtbaarheid nooit.
  // Geen sortering: de volgorde van visProjects blijft leidend, zodat een regel na het
  // inplannen op exact dezelfde positie blijft staan.
  const openProjects=visProjects.filter(p=>String(p.status||"").trim().toLowerCase()!=="afgerond").map(p=>{
    const n=assignedEmpIds(availability,p.id).length;
    const nodig=benodigd(p);
    return{p,st:planStatusOf(p,availability),n,nodig,rest:Math.max(0,nodig-n)};
  });
  // Teams (unieke combinaties) in deze periode, voor de legenda
  const teams:{key:string;kleur:string;label:string}[]=[];
  planRows(availability).forEach(a=>{
    const d=new Date(a.date);const ps=new Date(periodStart);ps.setHours(0,0,0,0);const pe=new Date(periodEnd);pe.setHours(23,59,59,999);
    if(d<ps||d>pe)return;
    const ids=teamForDay(availability,a.projectId||"",a.date);
    if(ids.length<2)return;
    const key=teamKey(a.projectId||"",a.date,ids);
    if(teams.some(t=>t.key===key))return;
    teams.push({key,kleur:teamColor(key,teamColors),label:ids.map(id=>employees.find(e=>e.id===id)?.naam||"?").map(abbrevName).join(" + ")});
  });

  // Bij een filterwijziging: tijdelijke state die naar een verborgen project verwijst opruimen
  useEffect(()=>{
    setDragProject(d=>d&&!visProj(d)?null:d);
    setDragBlock(b=>b&&!canActSilent(b.projectId,b.employeeId)?null:b);
    setCellMenu(m=>m&&(!visEmpIds.has(m.empId)||(m.block&&!canActSilent(m.block.projectId,m.block.employeeId)))?null:m);
    setProjMenu(p=>p&&!visProj(p.id)?null:p);
    setPlanModal(m=>m&&(!visEmpIds.has(m.empId)||(m.projectId&&!visProj(m.projectId)))?null:m);
    setTeamChoice(t=>t&&!canActSilent(t.block.projectId,t.block.employeeId)?null:t);
    setResizeTeam(r=>r&&!canActSilent(r.block.projectId,r.block.employeeId)?null:r);
    setPeriodModal(p=>p&&!canActSilent(p.projectId,p.employeeId)?null:p);
    setLateAsk(l=>l&&!canActSilent(l.block.projectId,l.block.employeeId)?null:l);
    setOverlapAsk(o=>o&&o.entries.some(e=>!canActSilent(e.projectId,e.employeeId))?null:o);
    setFirstAsk(f=>f&&!canActSilent(f.target.projectId,f.target.employeeId)?null:f);
    if(resizeRef.current&&!canActSilent(resizeRef.current.block.projectId,resizeRef.current.block.employeeId)){resizeRef.current=null;setResizePv(null);}
  },[afdKey]);


  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Personeelsplanning</h1><p className="text-[#6B7A99] text-xs md:text-sm">Bezetting per medewerker · klik = inplannen, shift-klik op twee dagen = afwezigheid</p></div>
      <div className="flex gap-2 flex-wrap">
        <Btn variant="secondary" onClick={onVacImport} size="sm"><Table2 className="w-3.5 h-3.5"/>Vakantie importeren</Btn>
        <Btn variant="secondary" size="sm" onClick={()=>openAbsence(visEmp[0]?.id||employees[0]?.id||"",toDateStr(refDate),toDateStr(refDate))}><CalendarDays className="w-3.5 h-3.5"/>Afwezigheid</Btn>
        <Btn variant="secondary" size="sm" onClick={()=>openFixedFree()}><CalendarDays className="w-3.5 h-3.5"/>Vaste vrije dagen</Btn>
        <Btn variant="secondary" size="sm" onClick={()=>setShowColors(true)}><Palette className="w-3.5 h-3.5"/>Kleuren beheren</Btn>
      </div>
    </div>
    <div className="flex gap-2 items-center flex-wrap">
      <div className="flex items-center gap-1 border border-[rgba(26,39,68,0.12)] rounded-lg overflow-hidden">
        <button onClick={()=>navigate(-1)} className="p-1.5 hover:bg-[#F0F3F8] text-[#6B7A99]"><ChevronLeft className="w-4 h-4"/></button>
        <span className="text-xs md:text-sm px-2 md:px-3 text-[#1A2744] font-medium min-w-36 md:min-w-52 text-center">{titleStr}</span>
        <button onClick={()=>navigate(1)} className="p-1.5 hover:bg-[#F0F3F8] text-[#6B7A99]"><ChevronRight className="w-4 h-4"/></button>
      </div>
      <div className="flex rounded-lg border border-[rgba(26,39,68,0.12)] overflow-hidden">
        {(["dag","week","maand","kwartaal"] as PlanView[]).map(v=><button key={v} onClick={()=>setView(v)} className={`px-2 md:px-3 py-1.5 text-xs font-medium transition-colors ${view===v?"bg-[#1A2744] text-white":"text-[#6B7A99] hover:bg-[#F0F3F8]"}`}>{v==="kwartaal"?"Kw.":v.charAt(0).toUpperCase()+v.slice(1)}</button>)}
      </div>
      <div className="flex gap-1.5 items-center flex-wrap">
        {filters.map(f=><button key={f.id} onClick={()=>toggleFilter(f.id)} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-opacity ${f.actief?"border-transparent text-white":"border-[rgba(26,39,68,0.12)] text-[#B8C3D9] bg-white"}`} style={f.actief?{backgroundColor:f.kleur}:undefined}>
          <span className="w-2 h-2 rounded-full" style={{backgroundColor:f.actief?"rgba(255,255,255,0.9)":f.kleur}}/>{f.naam}
        </button>)}
        <Btn variant="secondary" size="sm" onClick={()=>setShowFilters(true)}><Settings className="w-3.5 h-3.5"/>Filters</Btn>
      </div>
    </div>

    {view==="dag"&&<div className="space-y-3">
      {visEmp.map(e=>{
        const blocks=getDayBlocks(e.id,refDate);
        const ds=toDateStr(refDate);
        return <div key={e.id} className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden" onContextMenu={ev=>openCellMenu(ev,e.id,ds)}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(26,39,68,0.06)]" style={{borderLeftColor:dc[e.afdeling].bg,borderLeftWidth:4}}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
            <div className="flex-1"><p className="font-semibold text-[#1A2744] text-sm">{e.naam}</p><p className="text-xs text-[#6B7A99]">{e.functie}</p></div>
            <Btn variant="secondary" size="sm" onClick={()=>openPlan(e.id,ds)}><Plus className="w-3.5 h-3.5"/>Inplannen</Btn>
          </div>
          {blocks.length===0
            ?<button onClick={()=>openPlan(e.id,ds)} onContextMenu={ev=>openCellMenu(ev,e.id,ds)} className="w-full text-left px-4 py-3 text-xs text-[#B8C3D9] hover:bg-[#F8F9FC]">Geen tijdblokken — klik om in te plannen</button>
            :<div className="divide-y divide-[rgba(26,39,68,0.05)]">
              {blocks.map(({av:b,proj})=>(
                <div key={b.id} draggable={!!proj} onDragStart={()=>proj&&setDragBlock(b)} onDragEnd={()=>setDragBlock(null)}
                  onContextMenu={ev=>openCellMenu(ev,e.id,ds,b)}
                  className="group relative flex items-center gap-3 px-4 py-2.5 pb-4 md:pb-2.5 cursor-pointer hover:bg-[#F8F9FC]" onClick={()=>proj?openEditPlan(b):ABSENCE_STATS.includes(b.status)?clickAbsence(b):openPlan(e.id,ds)}>
                  {b.isFirstOfDay&&<Star className="w-3.5 h-3.5 text-[#F2A65A] flex-shrink-0" fill="currentColor" aria-label="Als eerste uitvoeren"/>}
                  <span className="text-xs font-mono text-[#6B7A99] whitespace-nowrap w-28 flex-shrink-0">{b.startTime}–{resizePv?.id===b.id?resizePv.label:b.endTime}</span>
                  {proj&&<span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor:rowColor(b)}}/>}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0" style={{backgroundColor:statusBgOf(b.status,statusColors),color:AS[b.status].text}}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor:statusColorOf(b.status,statusColors)}}/>
                    {b.status}
                  </span>
                  <span className="text-xs text-[#1A2744] truncate flex-1">{proj?`${proj.werknummer} – ${proj.projectnaam}`:(b.note||"")}</span>
                  {resizePv?.id===b.id&&<span className="text-[10px] font-semibold text-[#0ABFB8] flex-shrink-0">tot {resizePv.label}</span>}
                  {proj&&<button onClick={ev=>{ev.stopPropagation();onOpenProject(proj);}} className="text-[10px] text-[#0ABFB8] font-semibold flex-shrink-0">Project</button>}
                  {/* Resize-handle: eindtijd doortrekken */}
                  <span onPointerDown={ev=>startResize(ev,b,"time")} onClick={ev=>ev.stopPropagation()} title="Sleep om de eindtijd aan te passen"
                    className="absolute left-0 right-0 bottom-0 h-3 md:h-2 flex items-center justify-center cursor-ns-resize touch-none opacity-100 md:opacity-0 md:group-hover:opacity-100">
                    <span className="w-14 h-1 rounded-full bg-[#0ABFB8]"/>
                  </span>
                </div>
              ))}
            </div>
          }
        </div>;
      })}
    </div>}

    {(view==="week"||view==="maand")&&(
    <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-auto">
      <table className={`text-xs ${view==="week"?"w-full":""}`} style={{minWidth:`${180+dates.length*(view==="week"?90:44)}px`}}>
        <thead className="bg-[#F0F3F8] sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left text-[#6B7A99] font-semibold uppercase tracking-wide sticky left-0 bg-[#F0F3F8] z-20 w-44 min-w-44">Medewerker</th>
            {dates.map(d=>{const ds=toDateStr(d);const hol=getDHol(ds);const isT=ds===TODAY_STR;const isWE=d.getDay()===0||d.getDay()===6;return<th key={ds}
              style={{...(view==="week"?{width:`calc((100% - 176px) / ${dates.length})`,minWidth:90}:null),...(hol?{backgroundColor:withAlpha(holColor,0.1),borderTop:`2px solid ${holColor}`,color:holColor}:null)}}
              className={`py-2 text-center font-semibold min-w-10 ${isT?"text-[#0ABFB8]":isWE?"text-[#B8C3D9]":"text-[#6B7A99]"} ${isWE&&!hol?"bg-[#F8F8FB]":""}`} title={hol||undefined}>
              <div>{DAYS_NL[(d.getDay()+6)%7]}</div>
              <div className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center ${isT?"bg-[#1A2744] text-white":""}`}>{d.getDate()}</div>
              {hol&&view!=="maand"&&<div className="text-[8px] truncate mx-auto" style={{color:holColor}}>{hol}</div>}
              {hol&&view==="maand"&&<div className="w-1.5 h-1.5 rounded-full mx-auto mt-0.5" style={{backgroundColor:holColor}}/>}
            </th>;})}
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(26,39,68,0.05)]">
          {visEmp.map(e=><tr key={e.id} className="hover:bg-[#F8F9FC]">
            <td className="px-4 py-2.5 sticky left-0 bg-white z-10 border-r border-[rgba(26,39,68,0.06)]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
                <div><p className="font-semibold text-[#1A2744]">{e.naam}</p><p className="text-[#6B7A99]">{e.functie}</p></div>
              </div>
            </td>
            {dates.map(d=>{const ds=toDateStr(d);const ps=getEmpProjsDate(e.id,d);const isWE=d.getDay()===0||d.getDay()===6;const abs=absFor(e.id,ds);const sel=rangeStart&&rangeStart.empId===e.id&&rangeStart.date===ds;
            const blockState=dayBlockState(availability,e.id,ds);
            // Cellen met een doorlopende reeks krijgen geen horizontale padding, zodat de balk aansluit
            const linkedCell=ps.some(x=>{const s=segInfo(x.row);return s.prev||s.next;});
            return<td key={ds} onClick={ev=>cellClick(e.id,ds,ev)} onContextMenu={ev=>{ev.preventDefault();setCellMenu({empId:e.id,date:ds,x:ev.clientX,y:ev.clientY});}}
              onDragOver={ev=>{if(dragProject||dragBlock)ev.preventDefault();}} onDrop={()=>dropOnCell(e.id,ds)}
              style={blockState?{boxShadow:`inset 0 0 0 2px ${borderColorOf(blockState,borderColors,statusColors)}`}:undefined}
              className={`py-1 ${linkedCell?"px-0":"px-0.5"} text-center align-middle cursor-pointer ${isWE?"bg-[#F8F8FB]":""} ${sel?"ring-2 ring-inset ring-[#0ABFB8]":""} ${dragProject||dragBlock?"hover:bg-[#E0F7F6]":"hover:bg-[#F0F3F8]"}`} title="Klik = inplannen · shift-klik = periode afwezigheid · rechtsklik = snelmenu">
              <div className="space-y-0.5">
                {abs.map(a=><div key={a.id} className="group relative">
                  <button onClick={ev=>{ev.stopPropagation();clickAbsence(a);}}
                    className="rounded px-1 py-0.5 text-[10px] font-semibold truncate block w-full text-left hover:opacity-90"
                    style={absenceStyle(a.status,statusColors)} title={`${a.status}${a.note?" – "+a.note:""} (${a.startTime}–${a.endTime})`}>{a.status.slice(0,4)}</button>
                  {seriesEnd(a)===ds&&<ResizeHandle small={view!=="week"} active={resizePv?.id===a.id} label={resizePv?.id===a.id?resizePv.label:undefined}
                    onStart={ev=>{if(view==="week")startResize(ev,a,"date");}} onOpen={()=>setPeriodModal(a)}/>}
                </div>)}
                {ps.map(({row,proj},bi)=>{const seg=segInfo(row);return<div key={row.id} className="group relative">

                  <button draggable onDragStart={ev=>{ev.stopPropagation();setDragBlock(row);}} onDragEnd={()=>setDragBlock(null)}
                  onContextMenu={ev=>openCellMenu(ev,e.id,ds,row)}
                  onClick={ev=>{ev.stopPropagation();openEditPlan(row);}} className={`text-white px-1 py-0.5 text-[10px] font-medium truncate hover:opacity-80 transition-opacity flex items-center gap-0.5 w-full text-left cursor-grab active:cursor-grabbing ${dragBlock?.id===row.id?"opacity-50":""}`} style={{backgroundColor:rowColor(row),borderTopLeftRadius:seg.prev?0:4,borderBottomLeftRadius:seg.prev?0:4,borderTopRightRadius:seg.next?0:4,borderBottomRightRadius:seg.next?0:4}} title={`${row.isFirstOfDay?"Als eerste uitvoeren · ":""}${proj.werknummer} – ${proj.projectnaam} (${row.startTime}–${row.endTime})`}>
                    {row.isFirstOfDay&&!seg.prev&&<Star className="w-2.5 h-2.5 flex-shrink-0" fill="currentColor"/>}
                    <span className="truncate">{seg.prev?"\u00A0":proj.projectnaam.slice(0,4)+".."}</span>
                  </button>

                  {ps.length>1&&<span className="hidden group-hover:flex absolute -left-0.5 top-0 h-full flex-col justify-center">
                    <button onClick={ev=>{ev.stopPropagation();reorderDayPlans(row,-1);}} disabled={bi===0} className="text-[8px] leading-none text-white/90 disabled:opacity-30 px-0.5" title="Omhoog">▲</button>
                    <button onClick={ev=>{ev.stopPropagation();reorderDayPlans(row,1);}} disabled={bi===ps.length-1} className="text-[8px] leading-none text-white/90 disabled:opacity-30 px-0.5" title="Omlaag">▼</button>
                  </span>}
                  {seriesEnd(row)===ds&&<ResizeHandle small={view!=="week"} active={resizePv?.id===row.id} label={resizePv?.id===row.id?resizePv.label:undefined}
                    onStart={ev=>{if(view==="week")startResize(ev,row,"date");}} onOpen={()=>setPeriodModal(row)}/>}
                </div>;})}

                {abs.length===0&&ps.length===0&&<span className="text-[10px] text-[#E2E7F0]">+</span>}
              </div>

            </td>;})}
          </tr>)}
        </tbody>
      </table>
    </div>
    )}

    {view==="kwartaal"&&(
    <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-auto">
      <table className="text-xs" style={{minWidth:`${180+weeks.length*72}px`}}>
        <thead className="bg-[#F0F3F8] sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left text-[#6B7A99] font-semibold uppercase tracking-wide sticky left-0 bg-[#F0F3F8] z-20 min-w-40">Medewerker</th>
            {weeks.map((wk,i)=>{const wn=getWeekNumber(wk);return<th key={i} className="py-2 px-1 text-center font-semibold text-[#6B7A99] min-w-16">
              <div className="text-[9px] text-[#B8C3D9] mb-0.5">Wk{wn}</div>
              <div className="text-[10px]">{wk.getDate()} {MONTHS_NL[wk.getMonth()].slice(0,3)}</div>
            </th>;})}
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(26,39,68,0.05)]">
          {visEmp.map(e=><tr key={e.id} className="hover:bg-[#F8F9FC]">
            <td className="px-4 py-2.5 sticky left-0 bg-white z-10 border-r border-[rgba(26,39,68,0.06)]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
                <div><p className="font-semibold text-[#1A2744]">{e.naam}</p><p className="text-[#6B7A99]">{e.functie}</p></div>
              </div>
            </td>
            {weeks.map((wk,i)=>{const ps=getEmpProjsWeek(e.id,wk);return<td key={i} onClick={()=>openPlan(e.id,toDateStr(wk))} className="py-1.5 px-1 text-center align-middle cursor-pointer hover:bg-[#F0F3F8]">
              {ps.length>0?<div className="space-y-0.5">
                {ps.slice(0,2).map(p=><button key={p.id} onClick={ev=>{ev.stopPropagation();onOpenProject(p);}} className="rounded text-white px-1 py-0.5 text-[9px] font-medium truncate hover:opacity-80 transition-opacity block w-full text-left" style={projStyle(p,dc)} title={`${p.werknummer} – ${p.projectnaam}`}>
                  {p.projectnaam.slice(0,7)}
                </button>)}
                {ps.length>2&&<div className="text-[9px] text-[#6B7A99]">+{ps.length-2}</div>}
              </div>:<span className="text-[10px] text-[#E2E7F0]">+</span>}
            </td>;})}
          </tr>)}
        </tbody>
      </table>
    </div>
    )}

    {/* ===== Openstaande projecten ===== */}
    <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[rgba(26,39,68,0.06)] flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-[#1A2744] text-sm">Openstaande werken</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#6B7A99]">{openProjects.length} werk{openProjects.length!==1?"en":""} · sleep naar een cel</span>
        </div>
      </div>
      {openProjects.length===0?<p className="px-4 py-3 text-xs text-[#B8C3D9]">Geen openstaande werken.</p>
      :<div className="divide-y divide-[rgba(26,39,68,0.05)] max-h-80 overflow-y-auto">
        {openProjects.map(({p,st,n,nodig,rest})=>(
          <div key={p.id} draggable onDragStart={()=>setDragProject(p.id)} onDragEnd={()=>setDragProject(null)}
            className={`flex items-center gap-3 px-4 py-2.5 cursor-grab active:cursor-grabbing hover:bg-[#F8F9FC] ${dragProject===p.id?"opacity-50":""}`}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={projStyle(p,dc)}/>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#1A2744] truncate">{p.werknummer} – {p.projectnaam}</p>
              <p className="text-xs text-[#6B7A99] truncate">{fmtDate(p.startdatum)} – {fmtDate(p.afloopdatum)} · {p.werkzaamheden||"—"}</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0" style={badgeStyle(st,badgeColors)}>
              {PLAN_STATUS_LABEL[st]}{rest>0?` · nog ${rest}`:""}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0" style={badgeStyle(st,badgeColors)}>{n}/{nodig}</span>
            <button onClick={()=>onOpenProject(p)} className="text-xs text-[#0ABFB8] font-semibold flex-shrink-0">Openen</button>
            <button onClick={()=>setProjMenu(p)} className="text-xs text-[#6B7A99] font-semibold flex-shrink-0">Inplannen</button>
          </div>
        ))}
      </div>}
    </div>

    <div className="flex items-center gap-4 flex-wrap">
      {filters.map(f=><div key={f.id} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{backgroundColor:f.kleur}}/><span className="text-xs text-[#6B7A99]">{f.naam}</span></div>)}
      {AVAIL_STATS.filter(s=>s!=="Vrij").map(s=><div key={s} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor:statusColorOf(s,statusColors)}}/><span className="text-xs text-[#6B7A99]">{s}</span></div>)}
    </div>
    {teams.length>0&&<div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] p-4">
      <h3 className="text-xs font-bold text-[#1A2744] uppercase tracking-wide mb-2">Teams in deze periode</h3>
      <div className="flex flex-wrap gap-3">
        {teams.map(t=><div key={t.key} className="flex items-center gap-1.5">
          <input type="color" value={t.kleur} onChange={ev=>setTeamColor(t.key,ev.target.value)} className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent p-0" title="Teamkleur aanpassen"/>
          <span className="text-xs text-[#6B7A99]">{t.label}</span>
        </div>)}
      </div>
    </div>}

    {showFilters&&<FilterManagerModal filters={filters} onSave={saveFilters} onClose={()=>setShowFilters(false)}/>}
    {projMenu&&<PlanEmployeeModal employees={visEmp.length?visEmp:employees} projects={visProjects} availability={availability}
      empId={visEmp[0]?.id||employees[0]?.id||""} date={toDateStr(validDate(projMenu.startdatum)?new Date(projMenu.startdatum):refDate)}
      startTime={timePart(projMenu.startdatum)||"08:00"} endTime={timePart(projMenu.afloopdatum)||"17:00"} projectId={projMenu.id}
      onSave={async e=>{setProjMenu(null);await commitPlanning([e],undefined,true);}} onClose={()=>setProjMenu(null)}/>}
    {planModal&&<PlanEmployeeModal employees={visEmp.length?visEmp:employees} projects={visProjects} availability={availability}
      empId={planModal.empId} date={planModal.date} startTime={planModal.startTime} endTime={planModal.endTime}
      projectId={planModal.projectId} editId={planModal.editId}
      onSave={async e=>{
        const prev=availability.find(a=>a.id===e.id);
        // Bij bewerken blijven volgorde en markering behouden; bij een andere dag/medewerker vervallen ze
        const same=prev&&prev.employeeId===e.employeeId&&prev.date===e.date;
        // Vaste vrije dag waarop nu een project komt: alleen deze datum is een uitzondering
        const vv=vrijEx&&vrijEx.row.employeeId===e.employeeId&&vrijEx.row.date===e.date?vrijEx.periodeId:null;
        setVrijEx(null);setPlanModal(null);
        await commitPlanning([{...e,volgorde:same?prev.volgorde:undefined,isFirstOfDay:same?prev.isFirstOfDay:false,reeksId:prev?.reeksId,teamId:prev?.teamId,
          vasteVrijExceptionIds:vv?[...new Set([...(prev?.vasteVrijExceptionIds||[]),vv])]:prev?.vasteVrijExceptionIds}],undefined,true);
      }}
      onDelete={async id=>{const b=availability.find(a=>a.id===id);setPlanModal(null);if(b)await deletePlanRow(b);else await onDeletePlanning(id);}}
      onClose={async()=>{setPlanModal(null);await cancelVrijException();}}/>}
    {ffModal&&<FixedFreeDaysModal employees={visEmp.length?visEmp:employees} series={fixedSeries} draft={ffModal}
      onSave={saveFixedFree} onDelete={async pid=>{await deleteFixedFree(pid);setFfModal(null);}} onClose={()=>setFfModal(null)}/>}
    {ffAsk&&<Modal title="Er staat al werk gepland" onClose={()=>setFfAsk(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#6B7A99]">Op deze vaste vrije dagen staat al projectplanning. De planning blijft volledig staan; deze datums worden geen vrije dag.</p>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1 max-h-40 overflow-y-auto">
          {ffAsk.dates.map(d=><p key={d} className="text-xs text-amber-800">{fmtDate(d)}</p>)}
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={()=>setFfAsk(null)}>Annuleren</Btn>
          <Btn onClick={async()=>{const a=ffAsk;setFfAsk(null);await commitFixedFree(a.draft);}}>Doorgaan</Btn>
        </div>
      </div>
    </Modal>}
    {dayOrSeries&&<Modal title="Vaste vrije dag" onClose={()=>setDayOrSeries(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#6B7A99]">{fmtDate(dayOrSeries.date)} hoort bij een vaste vrije reeks. Wil je alleen deze dag wijzigen of de hele reeks?</p>
        <div className="flex flex-col gap-2">
          {(["Beschikbaar","Bezet","Ziek","Vakantie"] as AvailStatus[]).map(s=>
            <Btn key={s} variant="secondary" onClick={async()=>{const b=dayOrSeries;setDayOrSeries(null);await exceptionStatus(b,s);}}>Alleen deze dag: {s}</Btn>)}
          <Btn variant="secondary" onClick={()=>{const b=dayOrSeries;setDayOrSeries(null);setVrijAsk(b);}}>Alleen deze dag: project inplannen</Btn>
          <Btn onClick={()=>{const b=dayOrSeries;setDayOrSeries(null);editSeries(b.periodeId!);}}>Hele reeks wijzigen — dit raakt alle vaste vrije dagen</Btn>
          <Btn variant="ghost" onClick={()=>setDayOrSeries(null)}>Annuleren</Btn>
        </div>
      </div>
    </Modal>}
    {vrijAsk&&<Modal title="Project inplannen op een vrije dag" onClose={()=>setVrijAsk(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#6B7A99]">Deze medewerker is normaal op deze dag Vrij. Alleen deze datum beschikbaar maken en een project inplannen?</p>
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={()=>setVrijAsk(null)}>Annuleren</Btn>
          <Btn onClick={async()=>{const v=vrijAsk;setVrijAsk(null);await startVrijException(v);}}>Ja, inplannen</Btn>
        </div>
      </div>
    </Modal>}
    {absModal&&<AbsenceModal employees={employees} availability={availability} projects={projects} draft={absModal}
      onSave={async d=>{await onSaveAbsence(d);setAbsModal(null);}}
      onDelete={async pid=>{await onDeleteAbsence(pid);setAbsModal(null);}}
      onClose={()=>setAbsModal(null)}/>}
    {showColors&&<ColorManagerModal settings={settings} projects={projects} teams={teams.map(t=>({key:t.key,label:t.label}))}
      onSave={s=>onSaveSettings(s)} onClose={()=>setShowColors(false)}/>}
    {rangeStart&&<div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-[#1A2744] text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-3">
      Kies de einddag voor de afwezigheid
      <button className="underline" onClick={()=>setRangeStart(null)}>Annuleren</button>
    </div>}

    {/* Snelmenu op een cel */}
    {cellMenu&&<>
      <div className="fixed inset-0 z-40" onClick={()=>setCellMenu(null)} onContextMenu={ev=>{ev.preventDefault();setCellMenu(null);}}/>
      <div ref={menuRef} className="fixed z-50 bg-white rounded-xl border border-[rgba(26,39,68,0.12)] shadow-lg py-1 text-xs min-w-44"
        style={{left:Math.max(8,Math.min(cellMenu.x,window.innerWidth-200)),top:Math.max(8,Math.min(cellMenu.y,window.innerHeight-menuH-8))}}>
        <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-[#B8C3D9]">{employees.find(e=>e.id===cellMenu.empId)?.naam} · {fmtDate(cellMenu.date)}{cellMenu.block?` · ${cellMenu.block.startTime}–${cellMenu.block.endTime}`:""}</p>
        {cellMenu.block&&<>
          {cellMenu.block.projectId&&<button className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3F8] text-[#1A2744] flex items-center gap-2" onClick={async()=>{const b=cellMenu.block!;setCellMenu(null);await markFirstOfDay(b,!b.isFirstOfDay);}}>
            <Star className="w-3.5 h-3.5 text-[#F2A65A]" fill="currentColor"/>{cellMenu.block.isFirstOfDay?"Markering verwijderen":"Als eerste uitvoeren"}
          </button>}
          <button className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3F8] text-[#1A2744]" onClick={()=>{const b=cellMenu.block!;setCellMenu(null);if(b.projectId)openEditPlan(b);else clickAbsence(b);}}>Bewerken…</button>
          {isSeriesVrij(cellMenu.block)&&<button className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3F8] text-[#1A2744]" onClick={()=>{const b=cellMenu.block!;setCellMenu(null);editSeries(b.periodeId!);}}>Vaste vrije reeks wijzigen…</button>}
          <button className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3F8] text-[#1A2744]" onClick={()=>{const b=cellMenu.block!;setCellMenu(null);setPeriodModal(b);}}>Periode aanpassen…</button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3F8] text-red-600" onClick={async()=>{const b=cellMenu.block!;setCellMenu(null);if(b.projectId)await deletePlanRow(b);else if(b.periodeId)await onDeleteAbsence(b.periodeId);else await onDeletePlanning(b.id);}}>Verwijderen</button>
          <div className="my-1 border-t border-[rgba(26,39,68,0.08)]"/>
        </>}
        <button className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3F8] text-[#1A2744]" onClick={()=>{
          const c=cellMenu;setCellMenu(null);
          const vrij=availability.find(a=>a.employeeId===c.empId&&a.date===c.date&&isSeriesVrij(a)&&a.status==="Vrij");
          if(vrij){setVrijAsk(vrij);return;}
          openPlan(c.empId,c.date,c.startTime||"08:00",c.endTime||"17:00");
        }}>Project inplannen…</button>
        {ABSENCE_STATS.map(s=><button key={s} className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3F8] text-[#1A2744] flex items-center gap-2" onClick={()=>quickStatus(cellMenu.empId,cellMenu.date,s)}>
          <span className="w-2 h-2 rounded-full" style={{backgroundColor:statusColorOf(s,statusColors)}}/>{s} (hele dag)
        </button>)}
        <button className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3F8] text-[#6B7A99]" onClick={()=>{const c=cellMenu;setCellMenu(null);openAbsence(c.empId,c.date,c.date);}}>Afwezigheid met periode…</button>
        <button className="w-full text-left px-3 py-1.5 hover:bg-[#F0F3F8] text-[#6B7A99]" onClick={()=>{const c=cellMenu;setCellMenu(null);openFixedFree(c.empId);}}>Vaste vrije dagen…</button>
      </div>
    </>}

    {/* Keuze bij het slepen van een teamblok */}
    {teamChoice&&<Modal title="Planning verplaatsen" onClose={()=>setTeamChoice(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#6B7A99]">Deze dag werken {teamChoice.teamRows.length} medewerkers samen aan dit project. Standaard verplaatst het hele team mee.</p>
        <div className="flex flex-col gap-2">
          <Btn onClick={async()=>{const t=teamChoice;setTeamChoice(null);await moveBlocks(t.teamRows,t.empId,t.date);}}>Hele team verplaatsen</Btn>
          <Btn variant="secondary" onClick={async()=>{const t=teamChoice;setTeamChoice(null);await moveBlocks([t.block],t.empId,t.date);}}>Alleen deze medewerker verplaatsen</Btn>
          <Btn variant="ghost" onClick={()=>setTeamChoice(null)}>Annuleren</Btn>
        </div>
      </div>
    </Modal>}

    {/* Waarschuwing bij dubbele projectplanning */}
    {overlapAsk&&<Modal title="Let op — dubbele planning" onClose={()=>setOverlapAsk(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#6B7A99]">Deze medewerker staat in dit tijdvak al op een ander project:</p>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
          {overlapAsk.warnings.slice(0,6).map((c,i)=><p key={i} className="text-xs text-amber-800">{conflictLine(c)}</p>)}
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={()=>setOverlapAsk(null)}>Annuleren</Btn>
          <Btn onClick={async()=>{const o=overlapAsk;setOverlapAsk(null);await commitPlanning(o.entries,o.removeIds,o.checkFirst);}}>Planning toch opslaan</Btn>
        </div>
      </div>
    </Modal>}

    {/* Als eerste uitvoeren: bevestiging */}
    {firstAsk&&<Modal title="Als eerste uitvoeren" onClose={()=>setFirstAsk(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#6B7A99]">{firstAsk.kind==="start"
          ?"Er is nu een werk dat eerder begint. Wilt u dit werk automatisch als eerste uitvoeren markeren?"
          :"Dit project als eerste uitvoeren?"}</p>
        <div className="rounded-xl border border-[rgba(26,39,68,0.1)] bg-[#F8F9FC] p-3 text-xs text-[#1A2744]">
          {projects.find(p=>p.id===firstAsk.target.projectId)?.projectnaam||firstAsk.target.note||"Werk"} · {firstAsk.target.startTime}–{firstAsk.target.endTime} · {fmtDate(firstAsk.target.date)}
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={async()=>{const f=firstAsk;setFirstAsk(null);if(f.kind==="reorder"&&f.fallback)await commitPlanning(f.fallback);}}>Nee</Btn>
          <Btn onClick={async()=>{const f=firstAsk;setFirstAsk(null);await commitPlanning(applyFirstOfDay(f.rows,f.target.id));}}>Ja</Btn>
        </div>
      </div>
    </Modal>}

    {/* Buiten werktijd doorplannen */}
    {lateAsk&&<Modal title="Buiten werktijd" onClose={()=>setLateAsk(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#6B7A99]">Je trekt dit blok door tot <b>{lateAsk.endTime}</b>, na de standaard werkdag ({WORKDAY_END}).</p>
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={async()=>{const l=lateAsk;setLateAsk(null);if(l.fallback!==l.block.endTime)await applyResize(l.block,{endTime:l.fallback});}}>Stoppen om {lateAsk.fallback}</Btn>
          <Btn onClick={async()=>{const l=lateAsk;setLateAsk(null);await applyResize(l.block,{endTime:l.endTime});}}>Doorplannen tot {lateAsk.endTime}</Btn>
        </div>
      </div>
    </Modal>}

    {/* Alleen deze medewerker of het hele team verlengen */}
    {resizeTeam&&<Modal title="Hele team aanpassen?" onClose={()=>setResizeTeam(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#6B7A99]">Er staan {resizeTeam.teamRows.length} medewerkers op dit project in dit tijdvak.</p>
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={async()=>{const r=resizeTeam;setResizeTeam(null);await commitResize([r.block],r.patch);}}>Alleen deze medewerker</Btn>
          <Btn onClick={async()=>{const r=resizeTeam;setResizeTeam(null);await commitResize(r.teamRows,r.patch);}}>Hele team</Btn>
        </div>
      </div>
    </Modal>}

    {/* Periode aanpassen zonder slepen (kleine cellen / mobiel) */}
    {periodModal&&<PeriodResizeModal block={periodModal} start={seriesStart(periodModal)} end={seriesEnd(periodModal)}
      onClose={()=>setPeriodModal(null)}
      onSave={async(patch)=>{const b=periodModal;setPeriodModal(null);await applyResize(b,patch);}}/>}

  </div>;
}

// ===== PERSOONLIJKE NOTITIES =====
// Privé per ingelogde gebruiker: alleen de eigenaar ziet zijn eigen notities.
function NotitiesView(){
  const {user}=useAuth();
  const realUserId=user&&/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(user.id)?user.id:null;
  const [notes,setNotes]=useState<PersonalNote[]>([]);
  const [loading,setLoading]=useState(true);
  const [datum,setDatum]=useState(TODAY_STR);
  const [tekst,setTekst]=useState("");
  const [editId,setEditId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    if(!realUserId){setLoading(false);return;}
    let alive=true;
    loadPersonalNotes().then(n=>{if(alive)setNotes(n);}).catch(()=>toast.error("Notities konden niet worden geladen."))
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[realUserId]);

  const reset=()=>{setEditId(null);setTekst("");setDatum(TODAY_STR);};
  const save=async()=>{
    if(!realUserId||!tekst.trim()||busy)return;
    setBusy(true);
    try{
      const saved=await savePersonalNote(realUserId,datum,tekst.trim(),editId||undefined);
      setNotes(prev=>{const rest=prev.filter(n=>n.id!==saved.id);return [saved,...rest].sort((a,b)=>b.datum.localeCompare(a.datum));});
      reset();toast.success("Notitie opgeslagen.");
    }catch{toast.error("Notitie kon niet worden opgeslagen.");}
    setBusy(false);
  };
  const remove=async(id:string)=>{
    setBusy(true);
    try{await deletePersonalNote(id);setNotes(prev=>prev.filter(n=>n.id!==id));if(editId===id)reset();toast.success("Notitie verwijderd.");}
    catch{toast.error("Notitie kon niet worden verwijderd.");}
    setBusy(false);
  };

  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div>
      <h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Persoonlijke notities</h1>
      <p className="text-[#6B7A99] text-xs md:text-sm">Alleen jij ziet deze notities — ze zijn gekoppeld aan jouw account.</p>
    </div>
    {!realUserId
      ?<div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] p-6 text-sm text-[#6B7A99]">
        Persoonlijke notities werken alleen met een echt account. Log in met je Microsoft-account om je eigen notities veilig op te slaan.
      </div>
      :<>
        <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Datum" value={datum} onChange={setDatum} type="date"/>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#6B7A99]">Notitie</label>
            <textarea value={tekst} onChange={e=>setTekst(e.target.value)} rows={4} placeholder="Waar wil je aan denken?"
              className="w-full px-3 py-2 bg-white border border-[rgba(26,39,68,0.1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0ABFB8]/40"/>
          </div>
          <div className="flex justify-end gap-2">
            {editId&&<Btn variant="secondary" onClick={reset}>Annuleren</Btn>}
            <Btn onClick={save} disabled={busy||!tekst.trim()}>{editId?"Notitie bijwerken":"Notitie opslaan"}</Btn>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
          {loading?<p className="px-4 py-3 text-xs text-[#B8C3D9]">Laden…</p>
          :notes.length===0?<p className="px-4 py-3 text-xs text-[#B8C3D9]">Nog geen notities.</p>
          :<div className="divide-y divide-[rgba(26,39,68,0.05)]">
            {notes.map(n=><div key={n.id} className="flex items-start gap-3 px-4 py-3">
              <span className="text-xs font-mono text-[#6B7A99] w-24 flex-shrink-0">{fmtDate(n.datum)}</span>
              <p className="text-sm text-[#1A2744] flex-1 whitespace-pre-wrap">{n.tekst}</p>
              <button onClick={()=>{setEditId(n.id);setDatum(n.datum);setTekst(n.tekst);}} className="text-xs text-[#0ABFB8] font-semibold flex-shrink-0">Bewerken</button>
              <button onClick={()=>remove(n.id)} className="text-[#B8C3D9] hover:text-[#FF6B5B] flex-shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>)}
          </div>}
        </div>
      </>}
  </div>;
}

// ===== MEDEWERKERS =====
function MedewerkersView({employees,onAdd,onEdit,onDelete,onVacImport}:{
  employees:Employee[];onAdd:()=>void;onEdit:(e:Employee)=>void;onDelete:(id:string)=>void;
  onVacImport:()=>void;
}){
  const dc=useDC();
  const [search,setSearch]=useState("");const [afdFilter,setAfdFilter]=useState<string>("");
  const [del,setDel]=useState<string|null>(null);
  const filtered=employees.filter(e=>{const q=search.toLowerCase();return(!q||e.naam.toLowerCase().includes(q)||e.functie.toLowerCase().includes(q))&&(!afdFilter||e.afdeling===afdFilter);});
  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Medewerkers</h1><p className="text-[#6B7A99] text-xs md:text-sm">{employees.length} medewerkers</p></div>
      <div className="flex gap-2 flex-shrink-0">
        <Btn variant="secondary" onClick={onVacImport} size="sm"><Table2 className="w-3.5 h-3.5"/>Vakantie importeren</Btn>
        <Btn onClick={onAdd}><Plus className="w-4 h-4"/><span className="hidden sm:inline">Nieuwe medewerker</span></Btn>
      </div>
    </div>
    <div className="flex gap-2 flex-wrap">
      <div className="relative flex-1 min-w-0"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7A99]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Zoeken..." className="w-full pl-9 pr-3 py-2 bg-white border border-[rgba(26,39,68,0.1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0ABFB8]/40"/></div>
      <Select value={afdFilter} onChange={setAfdFilter} options={AFDS.map(a=>({value:a,label:a}))} className="w-36 md:w-40"/>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      {filtered.map(e=><div key={e.id} className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] p-5 hover:shadow-md transition-all">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-lg font-bold" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
            <div><p className="font-bold text-[#1A2744]">{e.naam}</p><p className="text-xs text-[#6B7A99]">{e.functie}</p></div>
          </div>
          <div className="flex gap-1">
            <button onClick={()=>onEdit(e)} className="p-1.5 rounded-lg hover:bg-[#F0F3F8] text-[#6B7A99]"><Pencil className="w-3.5 h-3.5"/></button>
            <button onClick={()=>setDel(e.id)} className="p-1.5 rounded-lg hover:bg-[#FFE8E5] text-[#6B7A99] hover:text-[#FF6B5B]"><Trash2 className="w-3.5 h-3.5"/></button>
          </div>
        </div>
        <div className="mb-3"><DeptBadge afd={e.afdeling}/></div>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-[#6B7A99]"><Phone className="w-3.5 h-3.5"/>{e.telefoon||"—"}</div>
          <div className="flex items-center gap-2 text-[#6B7A99]"><Mail className="w-3.5 h-3.5"/>{e.email||"—"}</div>
        </div>
        {e.competenties.length>0&&<div className="mt-3 flex flex-wrap gap-1">
          {e.competenties.slice(0,3).map(c=><span key={c} className="px-2 py-0.5 bg-[#F0F3F8] text-[#6B7A99] rounded-full text-xs">{c}</span>)}
          {e.competenties.length>3&&<span className="px-2 py-0.5 bg-[#F0F3F8] text-[#6B7A99] rounded-full text-xs">+{e.competenties.length-3}</span>}
        </div>}
      </div>)}
    </div>
    {del&&<ConfirmModal message="Weet je zeker dat je deze medewerker wilt verwijderen? De medewerker wordt verwijderd uit alle werken en tijdblokken." onConfirm={()=>{onDelete(del);setDel(null);}} onCancel={()=>setDel(null)}/>}
  </div>;
}

// ===== FACTURATIE =====
function FacturatieView({projects}:{projects:Project[]}){
  const dc=useDC();
  const [filter,setFilter]=useState<string>("");
  const facItems=projects.filter(p=>(!filter||p.status===filter));
  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div><h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Facturatie</h1><p className="text-[#6B7A99] text-xs md:text-sm">Termijnoverzicht per project</p></div>
    <div className="flex gap-1.5 flex-wrap">
      {["","Offerte","Bevestigd","In uitvoering","Afgerond","Gefactureerd"].map(s=><button key={s} onClick={()=>setFilter(s)} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter===s?"bg-[#1A2744] text-white":"bg-white border border-[rgba(26,39,68,0.1)] text-[#6B7A99] hover:bg-[#F0F3F8]"}`}>{s||"Alle"}</button>)}
    </div>
    <div className="space-y-4">
      {facItems.map(p=>{
        const afds=getAllAfds(p);
        return <div key={p.id} className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
          <div className="flex items-center gap-2 px-4 md:px-5 py-3 md:py-3.5 border-b border-[rgba(26,39,68,0.06)]" style={{borderLeftColor:dc[afds[0]].bg,borderLeftWidth:4}}>
            <span className="font-mono text-xs text-[#6B7A99] hidden sm:inline">{p.werknummer}</span>
            <span className="font-semibold text-[#1A2744] text-sm truncate flex-1">{p.projectnaam}</span>
            <span className="text-[#6B7A99] text-xs hidden md:inline">— {p.opdrachtgever}</span>
            <div className="ml-auto flex-shrink-0"><StatusBadge status={p.status}/></div>
          </div>
          <FacturatieTermijnen projectId={p.id}/>
        </div>;
      })}
      {facItems.length===0&&<p className="text-center text-[#6B7A99] py-12">Geen projecten gevonden</p>}
    </div>
  </div>;
}

// ===== INSTELLINGEN =====
function InstellingenView({settings,onSave}:{settings:AppSettings;onSave:(s:AppSettings)=>void}){
  const [form,setForm]=useState<AppSettings>(settings);
  const [saved,setSaved]=useState(false);
  const [activeTab,setActiveTab]=useState<"bedrijf"|"kleuren">("bedrijf");

  // sync if settings prop changes
  useEffect(()=>{setForm(settings);},[settings]);

  const save=()=>{
    onSave(form);
    setSaved(true);
    setTimeout(()=>setSaved(false),2500);
  };

  const setDeptColor=(afd:Afdeling,hex:string)=>{
    // derive light from hex
    setForm(prev=>({...prev,deptColors:{...prev.deptColors,[afd]:{bg:hex,light:hex+"22",border:hex}}}));
  };

  return <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-2xl">
    <div>
      <h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Instellingen</h1>
      <p className="text-[#6B7A99] text-xs md:text-sm">Bedrijfsinstellingen en voorkeuren</p>
    </div>
    <div className="flex gap-1 bg-[#F0F3F8] p-1 rounded-xl w-fit">
      {(["bedrijf","kleuren"] as const).map(t=><button key={t} onClick={()=>setActiveTab(t)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab===t?"bg-white text-[#1A2744] shadow-sm":"text-[#6B7A99] hover:text-[#1A2744]"}`}>{t==="bedrijf"?"Bedrijfsgegevens":"Kleuren"}</button>)}
    </div>
    {activeTab==="bedrijf"&&<div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] p-4 md:p-6 space-y-4">
      <Input label="Bedrijfsnaam" value={form.bedrijfsnaam} onChange={v=>setForm(p=>({...p,bedrijfsnaam:v}))}/>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Adres" value={form.adres} onChange={v=>setForm(p=>({...p,adres:v}))}/>
        <Input label="Postcode" value={form.postcode} onChange={v=>setForm(p=>({...p,postcode:v}))}/>
      </div>
      <Input label="Plaats" value={form.plaats} onChange={v=>setForm(p=>({...p,plaats:v}))}/>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Telefoon" value={form.telefoon} onChange={v=>setForm(p=>({...p,telefoon:v}))}/>
        <Input label="E-mail" value={form.email} onChange={v=>setForm(p=>({...p,email:v}))}/>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">Primaire kleur</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.primaryColor} onChange={e=>setForm(p=>({...p,primaryColor:e.target.value}))} className="w-10 h-10 rounded-lg border border-[rgba(26,39,68,0.1)] cursor-pointer p-0.5 bg-[#F0F3F8]"/>
            <span className="text-sm text-[#1A2744] font-mono">{form.primaryColor}</span>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">Accentkleur</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.accentColor} onChange={e=>setForm(p=>({...p,accentColor:e.target.value}))} className="w-10 h-10 rounded-lg border border-[rgba(26,39,68,0.1)] cursor-pointer p-0.5 bg-[#F0F3F8]"/>
            <span className="text-sm text-[#1A2744] font-mono">{form.accentColor}</span>
          </div>
        </div>
      </div>
    </div>}
    {activeTab==="kleuren"&&<div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] p-4 md:p-6 space-y-4">
      <p className="text-sm text-[#6B7A99]">Stel de kleur in voor elke afdeling. Wijzigingen zijn direct zichtbaar na opslaan.</p>
      {AFDS.map(a=><div key={a} className="flex items-center gap-4 p-3 rounded-xl border border-[rgba(26,39,68,0.08)]">
        <input type="color" value={form.deptColors[a].bg} onChange={e=>setDeptColor(a,e.target.value)} className="w-12 h-12 rounded-xl border-0 cursor-pointer p-0.5 flex-shrink-0" style={{backgroundColor:form.deptColors[a].bg}}/>
        <div className="flex-1">
          <p className="font-semibold text-[#1A2744]">{a}</p>
          <p className="text-xs text-[#6B7A99] font-mono">{form.deptColors[a].bg}</p>
        </div>
        <div className="w-8 h-8 rounded-lg" style={{backgroundColor:form.deptColors[a].bg}}/>
      </div>)}
    </div>}
    <div className="flex gap-3">
      <Btn onClick={save}>
        {saved?<><Check className="w-4 h-4"/>Opgeslagen!</>:<>Instellingen opslaan</>}
      </Btn>
      {saved&&<p className="text-sm text-emerald-600 flex items-center gap-1"><Check className="w-4 h-4"/>Wijzigingen opgeslagen</p>}
    </div>
  </div>;
}

// ===== APP =====
export default function PlanningApp(){
  const [nav,setNav]=useState<Nav>("dashboard");
  const [projects,setProjects]=useState<Project[]>(INIT_PROJ);
  const [employees,setEmployees]=useState<Employee[]>(INIT_EMP);
  const [avail,setAvail]=useState<AvailEntry[]>(INIT_AVAIL);
  const [detailProject,setDetailProject]=useState<Project|null>(null);
  const [editProject,setEditProject]=useState<Partial<Project>|null>(null);
  const [editEmployee,setEditEmployee]=useState<Partial<Employee>|null>(null);
  const [isNewProject,setIsNewProject]=useState(false);
  const [isNewEmployee,setIsNewEmployee]=useState(false);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [settings,setSettings]=useState<AppSettings>(INIT_SETTINGS);
  const [showVacImport,setShowVacImport]=useState(false);
  const [dbReady,setDbReady]=useState(false);
  const [dbError,setDbError]=useState<string>("");

  // ===== DATABASE: eenmalig laden, daarna elke wijziging opslaan =====
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const res=await loadAll<Project,Employee,AvailEntry,AppSettings>();
        if(cancelled)return;
        if(res.empty){
          // Eerste keer: demo-data als startpunt wegschrijven
          await Promise.all([
            syncTable("projects",INIT_PROJ),
            syncTable("employees",INIT_EMP),
            syncTable("availability",INIT_AVAIL),
            syncSettings(INIT_SETTINGS),
          ]);
        }else{
          setProjects(res.projects);
          setEmployees(res.employees);
          setAvail(res.availability);
          if(res.settings){
            setSettings(res.settings);
            (Object.keys(res.settings.deptColors||{}) as Afdeling[]).forEach(afd=>{DC[afd]=res.settings!.deptColors[afd];});
          }
        }
      }catch(err){
        if(!cancelled)setDbError(err instanceof Error?err.message:"Onbekende fout");
      }finally{
        if(!cancelled)setDbReady(true);
      }
    })();
    return()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    if(!dbReady)return;
    const t=setTimeout(()=>{syncTable("projects",projects).catch((e:unknown)=>setDbError(e instanceof Error?e.message:String(e)));},150);
    return()=>clearTimeout(t);
  },[projects,dbReady]);
  useEffect(()=>{
    if(!dbReady)return;
    const t=setTimeout(()=>{syncTable("employees",employees).catch((e:unknown)=>setDbError(e instanceof Error?e.message:String(e)));},150);
    return()=>clearTimeout(t);
  },[employees,dbReady]);
  useEffect(()=>{
    if(!dbReady)return;
    const t=setTimeout(()=>{syncTable("availability",avail).catch((e:unknown)=>setDbError(e instanceof Error?e.message:String(e)));},150);
    return()=>clearTimeout(t);
  },[avail,dbReady]);
  useEffect(()=>{
    if(!dbReady)return;
    const t=setTimeout(()=>{syncSettings(settings).catch((e:unknown)=>setDbError(e instanceof Error?e.message:String(e)));},150);
    return()=>clearTimeout(t);
  },[settings,dbReady]);

  const addProject=(p:Project)=>{setProjects(prev=>[...prev,p]);setIsNewProject(false);setEditProject(null);};
  const updateProject=(id:string,u:Partial<Project>)=>setProjects(prev=>prev.map(p=>p.id===id?{...p,...u}:p));
  // Status direct wijzigen vanuit de projectlijst: zelfde projectrecord, zelfde tabel
  const changeProjectStatus=async(p:Project,status:ProjectStatus)=>{
    const prevStatus=p.status;
    const next=projects.map(x=>x.id===p.id?{...x,status}:x);
    setProjects(next);
    try{
      await syncTable("projects",next);
      toast.success("Projectstatus is bijgewerkt.");
    }catch{
      setProjects(cur=>cur.map(x=>x.id===p.id?{...x,status:prevStatus}:x));
      toast.error("De projectstatus kon niet worden bijgewerkt.");
    }
  };
  const deleteProject=(id:string)=>{setProjects(prev=>prev.filter(p=>p.id!==id));setAvail(prev=>prev.filter(a=>a.projectId!==id));if(detailProject?.id===id)setDetailProject(null);};
  const saveProject=(p:Project)=>{
    if(projects.find(x=>x.id===p.id))updateProject(p.id,p);else addProject(p);
    setEditProject(null);setIsNewProject(false);
  };

  // ===== PLANNINGREGELS = enige bron van waarheid =====
  // Projecten krijgen hun medewerkers en periode uit de planningregels.
  const viewProjects=useMemo(()=>projects.map(p=>{
    const rows=projectPlans(avail,p.id);
    if(!rows.length)return p;
    const per=planPeriod(rows);
    return{...p,medewerkers:assignedEmpIds(avail,p.id),startdatum:per?per.start:p.startdatum,afloopdatum:per?per.end:p.afloopdatum};
  }),[projects,avail]);

  // Alleen de projectperiode wordt afgeleid; medewerkers en alle overige projectvelden
  // (status, afdeling(en), calculator, werkzaamheden, werknummer, opdrachtgever) blijven ongewijzigd.
  const applyDerivedDates=(nextAvail:AvailEntry[],projectId:string)=>{
    const rows=projectPlans(nextAvail,projectId);
    const per=planPeriod(rows);
    if(!per)return projects; // laatste planning verwijderd: datums bewust behouden
    return projects.map(p=>p.id===projectId?{...p,startdatum:per.start,afloopdatum:per.end}:p);
  };


  const savePlanning=async(entry:AvailEntry)=>{
    const exists=avail.some(a=>a.id===entry.id);
    const prevAvail=avail,prevProjects=projects;
    const nextAvail=exists?avail.map(a=>a.id===entry.id?entry:a):[...avail,entry];
    const oldPid=exists?avail.find(a=>a.id===entry.id)?.projectId:undefined;
    let nextProjects=entry.projectId?applyDerivedDates(nextAvail,entry.projectId):projects;
    if(oldPid&&oldPid!==entry.projectId){
      const tmp=applyDerivedDates(nextAvail,oldPid);
      nextProjects=nextProjects.map(p=>p.id===oldPid?tmp.find(x=>x.id===oldPid)!:p);
    }
    setAvail(nextAvail);setProjects(nextProjects);
    try{
      await Promise.all([syncTable("availability",nextAvail),syncTable("projects",nextProjects)]);
      toast.success("Planning opgeslagen.");
      return true;
    }catch{
      setAvail(prevAvail);setProjects(prevProjects);
      toast.error("Planning kon niet worden opgeslagen.");
      return false;
    }
  };

  // Meerdere planningregels in één keer (teamverplaatsing, volgorde wijzigen)
  const savePlanningMany=async(entries:AvailEntry[])=>{
    if(entries.length===0)return true;
    if(entries.length===1)return savePlanning(entries[0]);
    const prevAvail=avail,prevProjects=projects;
    const map=new Map(entries.map(e=>[e.id,e]));
    const nextAvail=[...avail.map(a=>map.get(a.id)||a),...entries.filter(e=>!avail.some(a=>a.id===e.id))];
    const pids=[...new Set([...entries.map(e=>e.projectId),...avail.filter(a=>map.has(a.id)).map(a=>a.projectId)])].filter(Boolean) as string[];
    let nextProjects=projects;
    pids.forEach(pid=>{
      const tmp=applyDerivedDates(nextAvail,pid);
      nextProjects=nextProjects.map(p=>p.id===pid?(tmp.find(x=>x.id===pid)||p):p);
    });
    setAvail(nextAvail);setProjects(nextProjects);
    try{
      await Promise.all([syncTable("availability",nextAvail),syncTable("projects",nextProjects)]);
      toast.success("Planning opgeslagen.");
      return true;
    }catch{
      setAvail(prevAvail);setProjects(prevProjects);
      toast.error("Planning kon niet worden opgeslagen.");
      return false;
    }
  };

  // Reeks bijwerken bij doortrekken/inkorten: regels toevoegen/bijwerken én
  // overtollige dagregels van dezelfde reeks verwijderen, in één opslag.
  const savePlanningResize=async(entries:AvailEntry[],removeIds:string[])=>{
    const prevAvail=avail,prevProjects=projects;
    const map=new Map(entries.map(e=>[e.id,e]));
    const nextAvail=[...avail.filter(a=>!removeIds.includes(a.id)).map(a=>map.get(a.id)||a),
      ...entries.filter(e=>!avail.some(a=>a.id===e.id))];
    const touched=avail.filter(a=>map.has(a.id)||removeIds.includes(a.id)).map(a=>a.projectId);
    const pids=[...new Set([...entries.map(e=>e.projectId),...touched])].filter(Boolean) as string[];
    let nextProjects=projects;
    pids.forEach(pid=>{
      const tmp=applyDerivedDates(nextAvail,pid);
      nextProjects=nextProjects.map(p=>p.id===pid?(tmp.find(x=>x.id===pid)||p):p);
    });
    setAvail(nextAvail);setProjects(nextProjects);
    try{
      await Promise.all([syncTable("availability",nextAvail),syncTable("projects",nextProjects)]);
      toast.success("Planning bijgewerkt.");
      return true;
    }catch{
      setAvail(prevAvail);setProjects(prevProjects);
      toast.error("Planning kon niet worden opgeslagen.");
      return false;
    }
  };


  // Afwezigheid als één periode: elke dag krijgt een regel met hetzelfde periodeId
  const saveAbsence=async(d:AbsenceDraft)=>{
    const dates=getDatesInRange(new Date(d.startDate+"T12:00"),new Date(d.endDate+"T12:00"));
    const pid=d.periodeId||"per-"+nid();
    const kept=avail.filter(a=>a.periodeId!==pid);
    // geen dubbele regels: bestaande regel voor dezelfde medewerker/dag/status vervangen
    const base=kept.filter(a=>!(a.employeeId===d.employeeId&&!a.projectId&&dates.includes(a.date)&&a.status===d.status));
    const rows:AvailEntry[]=dates.map(date=>({id:"av-"+nid(),employeeId:d.employeeId,date,startTime:d.startTime,endTime:d.endTime,status:d.status,note:d.note||undefined,periodeId:pid}));
    const nextAvail=[...base,...rows];
    setAvail(nextAvail);
    try{await syncTable("availability",nextAvail);toast.success("Afwezigheid opgeslagen.");}
    catch{setAvail(avail);toast.error("Afwezigheid kon niet worden opgeslagen.");}
  };

  const deleteAbsence=async(periodeId:string)=>{
    const nextAvail=avail.filter(a=>a.periodeId!==periodeId);
    setAvail(nextAvail);
    try{await syncTable("availability",nextAvail);toast.success("Afwezigheid verwijderd.");}
    catch{setAvail(avail);toast.error("Afwezigheid kon niet worden verwijderd.");}
  };

  const deletePlanning=async(id:string)=>{
    const row=avail.find(a=>a.id===id);
    const nextAvail=avail.filter(a=>a.id!==id);
    const pid=row?.projectId;
    const rest=pid?projectPlans(nextAvail,pid):[];
    const nextProjects=pid?applyDerivedDates(nextAvail,pid):projects;
    setAvail(nextAvail);setProjects(nextProjects);
    try{
      await Promise.all([syncTable("availability",nextAvail),syncTable("projects",nextProjects)]);
      if(pid&&rest.length===0)toast.info("Laatste planning verwijderd — de projectdatums blijven staan tot je ze zelf aanpast.");
      else toast.success("Planning verwijderd.");
    }catch{toast.error("Planning kon niet worden verwijderd.");}
  };


  const handleImport=async(rows:ImportRow[])=>{
    const createProjectFromImportRow=(r:ImportRow):Project=>{
      // Projectleider (kolom K): exacte celtekst, altijd als platte tekst opslaan
      const pl=r.projectleider;
      const afdelingen=r.afdelingen.length?r.afdelingen:["Stoffering" as Afdeling];
      const primaryAfd=afdelingen[0];
      // Agenda-datums komen uitsluitend uit Startdatum/Einddatum (+ tijden); geen fallback
      const sd=r.startdatum||"";
      const ed=sd?(r.einddatum||(()=>{const d=new Date(sd);d.setHours(17,0,0,0);return d.toISOString();})()):"";
      return{
        id:nid(),
        projectnr:r.projectnr,
        werknummer:r.werknummer||r.projectnr,
        projectnaam:r.projectnaam,
        opdrachtgever:r.opdrachtgever||r.contactpersoon||"",
        adres:"",plaats:"",
        afdeling:primaryAfd,afdelingen,
        projectleider:pl,
        werkzaamheden:r.werkzaamheden||"",

        startdatum:sd,
        afloopdatum:ed,
        medewerkers:[],
        status:"Offerte" as ProjectStatus,
        notities:r.contactpersoon&&r.opdrachtgever?`Contactpersoon: ${r.contactpersoon}`:"",
        uurprijs:65,uren:8,
      };
    };

    // Upsert op Projectnr.: bestaand project bijwerken, anders nieuw aanmaken
    const next=[...projects];
    rows.forEach(r=>{
      const nr=normalizeProjectnr(r.projectnr);
      const idx=nr?next.findIndex(p=>normalizeProjectnr(p.projectnr)===nr):-1;
      if(idx>=0){
        next[idx]={...next[idx],projectleider:r.projectleider,werkzaamheden:r.werkzaamheden};
      }else{
        next.push(createProjectFromImportRow(r));
      }
    });

    setProjects(next);
    try{
      await syncTable("projects",next);
      const refreshed=await loadAll<Project,Employee,AvailEntry,AppSettings>();
      setProjects(refreshed.projects);
    }catch(e:unknown){
      setDbError(e instanceof Error?e.message:String(e));
    }
  };

  const addEmployee=(e:Employee)=>{setEmployees(prev=>[...prev,e]);setIsNewEmployee(false);setEditEmployee(null);};
  const updateEmployee=(id:string,u:Partial<Employee>)=>setEmployees(prev=>prev.map(e=>e.id===id?{...e,...u}:e));
  const deleteEmployee=(id:string)=>{
    setEmployees(prev=>prev.filter(e=>e.id!==id));
    setAvail(prev=>prev.filter(a=>a.employeeId!==id));
    setProjects(prev=>prev.map(p=>({
      ...p,
      medewerkers:p.medewerkers.filter(mid=>mid!==id),
      projectleider:p.projectleider===id?"":p.projectleider,
    })));
  };
  const saveEmployee=(e:Employee)=>{
    if(employees.find(x=>x.id===e.id))updateEmployee(e.id,e);else addEmployee(e);
    setEditEmployee(null);setIsNewEmployee(false);
  };

  const openEditProject=(p:Project)=>{setDetailProject(null);setEditProject(p);setIsNewProject(false);};
  const openNewProject=(prefill:Partial<Project>={})=>{setEditProject({...prefill});setIsNewProject(true);};
  const openDetailProject=(p:Project)=>setDetailProject(p);

  const handleVacImport=(entries:AvailEntry[])=>{
    setAvail(prev=>{
      const existKeys=new Set(prev.map(a=>`${a.employeeId}|${a.date}|${a.startTime}|${a.endTime}|${a.status}`));
      const toAdd=entries.filter(e=>!existKeys.has(`${e.employeeId}|${e.date}|${e.startTime}|${e.endTime}|${e.status}`));
      return [...prev,...toAdd];
    });
    setShowVacImport(false);
  };

  const handleSaveSettings=(s:AppSettings)=>{
    setSettings(s);
    // update DC in place so all components re-render with new colors
    (Object.keys(s.deptColors) as Afdeling[]).forEach(afd=>{
      DC[afd]=s.deptColors[afd];
    });
  };

  return <DeptColorCtx.Provider value={settings.deptColors}>
    <div className="flex h-screen bg-[#F0F3F8] overflow-hidden" style={{fontFamily:"'Inter',system-ui,sans-serif"}}>
      <Sidebar active={nav} onNav={setNav} mobileOpen={mobileMenuOpen} onMobileClose={()=>setMobileMenuOpen(false)}/>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <MobileTopBar onOpenMenu={()=>setMobileMenuOpen(true)} nav={nav}/>
        {dbError&&<div className="bg-red-50 text-red-700 text-sm px-4 py-2 border-b border-red-200">Opslaan mislukt: {dbError}</div>}
        <div className={`flex-1 min-h-0 ${nav==="agenda"?"overflow-hidden flex flex-col":"overflow-auto"}`}>
          {nav==="dashboard"&&<Dashboard projects={viewProjects} employees={employees} availability={avail} onNav={setNav} onOpenProject={openDetailProject}/>}
          {nav==="projecten"&&<ProjectenView projects={viewProjects} employees={employees} onAdd={openNewProject} onEdit={openEditProject} onDelete={deleteProject} onOpen={openDetailProject} onImport={handleImport} onStatusChange={changeProjectStatus}/>}
          {nav==="agenda"&&<AgendaView projects={viewProjects} employees={employees} availability={avail} updateProject={updateProject} onOpenProject={openDetailProject} onCreateProject={openNewProject} onSaveManyPlanning={savePlanningMany}/>}
          {nav==="personeelsplanning"&&<PersoneelsplanningView projects={viewProjects} employees={employees} availability={avail} settings={settings} onSaveSettings={setSettings} onSavePlanning={savePlanning} onSaveManyPlanning={savePlanningMany} onResizePlanning={savePlanningResize} onDeletePlanning={deletePlanning} onSaveAbsence={saveAbsence} onDeleteAbsence={deleteAbsence} onOpenProject={openDetailProject} onVacImport={()=>setShowVacImport(true)}/>}
          {nav==="medewerkers"&&<MedewerkersView employees={employees} onAdd={()=>{setEditEmployee({});setIsNewEmployee(true);}} onEdit={e=>{setEditEmployee(e);setIsNewEmployee(false);}} onDelete={deleteEmployee} onVacImport={()=>setShowVacImport(true)}/>}
          {nav==="notities"&&<NotitiesView/>}
          {nav==="facturatie"&&<FacturatieView projects={viewProjects}/>}
          {nav==="instellingen"&&<InstellingenView settings={settings} onSave={handleSaveSettings}/>}
        </div>
      </div>
      {(isNewProject||editProject)&&editProject!==null&&(
        <Modal title={isNewProject?"Nieuw werk aanmaken":"Werk bewerken"} onClose={()=>{setEditProject(null);setIsNewProject(false);}}>
          <ProjectForm initial={editProject} employees={employees} projects={projects} availability={avail} onSave={saveProject} onCancel={()=>{setEditProject(null);setIsNewProject(false);}}/>
        </Modal>
      )}
      {detailProject&&<ProjectDetail project={viewProjects.find(p=>p.id===detailProject.id)||detailProject} employees={employees} availability={avail} teamColors={settings.teamColors||{}} badgeColors={settings.badgeColors||{}} onEdit={()=>openEditProject(projects.find(p=>p.id===detailProject.id)||detailProject)} onDelete={deleteProject} onClose={()=>setDetailProject(null)}/>}
      {(isNewEmployee||editEmployee)&&editEmployee!==null&&(
        <Modal title={isNewEmployee?"Nieuwe medewerker":"Medewerker bewerken"} onClose={()=>{setEditEmployee(null);setIsNewEmployee(false);}}>
          <EmployeeForm initial={editEmployee} onSave={saveEmployee} onCancel={()=>{setEditEmployee(null);setIsNewEmployee(false);}}/>
        </Modal>
      )}
      {showVacImport&&<VacationImportModal employees={employees} projects={projects} availability={avail} onImport={handleVacImport} onClose={()=>setShowVacImport(false)}/>}
    </div>
  </DeptColorCtx.Provider>;
}
