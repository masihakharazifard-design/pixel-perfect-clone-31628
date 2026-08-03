import { useState, useRef, useEffect, createContext, useContext } from "react";
import {
  LayoutDashboard, FolderOpen, CalendarDays, Users, Clock3,
  Receipt, Settings, ChevronLeft, ChevronRight, Plus, Pencil,
  Trash2, X, Search, MapPin, Phone, Mail, Layers,
  FileText, MessageSquare, CreditCard, Check, Upload,
  ChevronDown, UserCircle, Filter, MoreVertical,
  Calendar, Grid3X3, UserCheck, AlertTriangle, Building2,
  Tag, Star, Eye, Briefcase, Clock, Menu, Download, Table2
} from "lucide-react";
import * as XLSX from "xlsx";
import { loadAll, syncTable, syncSettings } from "@/lib/planning-store";

// ===== TYPES =====
type Nav = "dashboard"|"projecten"|"agenda"|"personeelsplanning"|"beschikbaarheid"|"medewerkers"|"facturatie"|"instellingen";
type Afdeling = "Stoffering"|"Schilderwerk"|"Zonwering";
type ProjectStatus = "Offerte"|"Bevestigd"|"In uitvoering"|"Afgerond"|"Gefactureerd";
type AvailStatus = "Beschikbaar"|"Ingepland"|"Niet beschikbaar"|"Vakantie"|"Ziek"|"Vrij";
type Functie = "Stoffeerder"|"Schilder"|"Monteur zonwering"|"Allround"|"Projectleider";
type CalView = "month"|"week"|"day"|"kwartaal";

interface Project {
  id:string; werknummer:string; projectnr?:string; projectnaam:string; opdrachtgever:string;
  adres?:string; plaats:string; afdeling:Afdeling;
  afdelingen?:Afdeling[];
  projectleider:string;
  werkzaamheden:string; startdatum:string; afloopdatum:string;
  medewerkers:string[]; status:ProjectStatus; notities:string;
  uurprijs:number; uren:number; region?:string;
}
interface Employee {
  id:string; naam:string; functie:Functie; afdeling:Afdeling;
  telefoon:string; email:string; competenties:string[];
}
interface AvailEntry { id:string; employeeId:string; date:string; startTime:string; endTime:string; status:AvailStatus; note?:string; projectId?:string; }
interface AppSettings {
  bedrijfsnaam:string; adres:string; postcode:string; plaats:string;
  telefoon:string; email:string; primaryColor:string; accentColor:string;
  deptColors:Record<Afdeling,{bg:string;light:string;border:string}>;
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
  "Niet beschikbaar": {bg:"#FEE2E2",text:"#991B1B",dot:"#EF4444"},
  Vakantie:           {bg:"#EDE9FE",text:"#5B21B6",dot:"#8B5CF6"},
  Ziek:               {bg:"#FEF3C7",text:"#92400E",dot:"#F59E0B"},
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
const AVAIL_STATS:AvailStatus[] = ["Beschikbaar","Ingepland","Niet beschikbaar","Vakantie","Ziek","Vrij"];
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
function fmtDate(d:string|Date){const dt=typeof d==="string"?new Date(d):d;return dt.toLocaleDateString("nl-NL",{day:"2-digit",month:"2-digit",year:"numeric"});}
function fmtTime(d:string|Date){const dt=typeof d==="string"?new Date(d):d;return dt.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"});}
function toDateStr(d:Date){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function toDTLocal(iso:string){const d=new Date(iso);const p=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
function sameDay(a:Date,b:Date){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function getDHol(s:string){return DUTCH_HOL.find(h=>h.date===s)?.name||null;}
function getSHols(s:string,regions:string[]){const d=new Date(s);return SCHOOL_HOL.filter(h=>{const st=new Date(h.start),en=new Date(h.end);return d>=st&&d<=en&&h.regions.some(r=>regions.includes(r));});}
function nid(){return Math.random().toString(36).slice(2,9);}
function nextWN(ps:Project[]){const yr=new Date().getFullYear();const ns=ps.filter(p=>p.werknummer.startsWith(yr+"-")).map(p=>parseInt(p.werknummer.split("-")[1]));return `${yr}-${String((ns.length?Math.max(...ns):0)+1).padStart(3,"0")}`;}
function abbrevName(naam:string):string{const parts=naam.split(" ");return parts.length<=1?naam:parts[0][0]+". "+parts.slice(1).join(" ");}
function projLabel(p:Project,employees:Employee[]):string{const pl=employees.find(e=>e.id===p.projectleider);const pn=pl?abbrevName(pl.naam):"";return pn?`${p.werknummer} – ${p.projectnaam} – ${pn}`:`${p.werknummer} – ${p.projectnaam}`;}
function getDatesInRange(start:Date,end:Date):string[]{const dates:string[]=[];const cur=new Date(start);cur.setHours(0,0,0,0);const endD=new Date(end);endD.setHours(0,0,0,0);while(cur<=endD){dates.push(toDateStr(new Date(cur)));cur.setDate(cur.getDate()+1);}return dates;}
function getDominantStatus(avails:AvailEntry[]):AvailStatus{const pri:AvailStatus[]=["Ziek","Vakantie","Niet beschikbaar","Ingepland","Vrij","Beschikbaar"];for(const s of pri){if(avails.some(a=>a.status===s))return s;}return "Beschikbaar";}
function fmtHM(h:number,m:number){return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;}
function getWeekNumber(d:Date):number{const date=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const dayNum=date.getUTCDay()||7;date.setUTCDate(date.getUTCDate()+4-dayNum);const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));return Math.ceil((((date.getTime()-yearStart.getTime())/86400000)+1)/7);}

function getAllAfds(p:Project):Afdeling[]{return p.afdelingen?.length?p.afdelingen:[p.afdeling];}
function projStyle(p:Project,dc:Record<Afdeling,{bg:string;light:string;border:string}>):React.CSSProperties{
  const afds=getAllAfds(p);
  if(afds.length===1)return{backgroundColor:dc[afds[0]].bg};
  if(afds.length===2)return{background:`linear-gradient(135deg, ${dc[afds[0]].bg} 50%, ${dc[afds[1]].bg} 50%)`};
  return{background:`linear-gradient(90deg, ${dc[afds[0]].bg} 33.3%, ${dc[afds[1]].bg} 33.3% 66.6%, ${dc[afds[2]].bg} 66.6%)`};
}
function primaryAfd(p:Project):Afdeling{return getAllAfds(p)[0];}

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
  projectleider:string;   // Calculator
  startdatum:string;      // Startdatum
  datumOpdracht:string;   // Datum opdracht
  werknummer:string;      // Werknr. (may be empty)
  rawDept:string;         // Second Omschrijving — raw department string
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

// Cell value → trimmed string, empty if null/undefined
function cellStr(v:unknown):string{
  if(v==null)return "";
  return String(v).trim();
}

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
        // Track first vs second occurrence of "omschrijving"
        let omschrijvingCount=0;
        let col_projectnr=-1,col_omschr1=-1,col_omschr2=-1,col_opdrachtgever=-1;
        let col_contactpersoon=-1,col_calculator=-1,col_datum_opdracht=-1;
        let col_startdatum=-1,col_werknr=-1;

        headerRow.forEach((h,i)=>{
          const norm=h.replace(/\s+/g,"").replace(/\.$/,"");
          if(norm==="projectnr"&&col_projectnr===-1)col_projectnr=i;
          else if(h==="omschrijving"){
            omschrijvingCount++;
            if(omschrijvingCount===1)col_omschr1=i;
            else if(omschrijvingCount===2)col_omschr2=i;
          }
          else if(norm==="naamopdrachtgever"||norm==="opdrachtgever")col_opdrachtgever=i;
          else if(h==="contactpersoon")col_contactpersoon=i;
          else if(h==="calculator")col_calculator=i;
          else if(norm==="datumopdracht"||h==="datum opdracht")col_datum_opdracht=i;
          else if(h==="startdatum")col_startdatum=i;
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
        const existingNrs=new Set([
          ...projects.map(p=>p.projectnr||"").filter(Boolean),
          ...projects.map(p=>p.werknummer).filter(Boolean),
        ]);

        const allRows:ImportRow[]=[];
        const dataRows=raw.slice(headerRowIdx+1);

        dataRows.forEach((rawRow,relIdx)=>{
          const row=rawRow as unknown[];
          // Skip completely empty rows
          if(!row||row.every(c=>c==null||cellStr(c)===""))return;

          const absRow=headerRowIdx+2+relIdx; // 1-based Excel row number

          const projectnr=col_projectnr>=0?cellStr(row[col_projectnr]):"";
          const projectnaam=col_omschr1>=0?cellStr(row[col_omschr1]):"";
          const rawDeptCell=col_omschr2>=0?cellStr(row[col_omschr2]):"";
          const opdrachtgever=col_opdrachtgever>=0?cellStr(row[col_opdrachtgever]):"";
          const contactpersoon=col_contactpersoon>=0?cellStr(row[col_contactpersoon]):"";
          const calculator=col_calculator>=0?cellStr(row[col_calculator]):"";
          const startdatumRaw=col_startdatum>=0?row[col_startdatum]:null;
          const datumOpdrachtRaw=col_datum_opdracht>=0?row[col_datum_opdracht]:null;
          const werknrRaw=col_werknr>=0?cellStr(row[col_werknr]):"";

          // Validation: alleen Projectnr. is verplicht
          let invalidReason="";
          if(!projectnr&&!projectnaam)return; // skip truly blank rows silently
          if(!projectnr)invalidReason=`Rij ${absRow}: Projectnr. ontbreekt`;

          const{afdelingen,turnkey}=resolveDept(rawDeptCell);

          allRows.push({
            projectnr,
            projectnaam:projectnaam||projectnr,

            opdrachtgever,
            contactpersoon,
            projectleider:calculator,
            startdatum:parseXlDate(startdatumRaw as string|number|null),
            datumOpdracht:parseXlDate(datumOpdrachtRaw as string|number|null),
            werknummer:werknrRaw||projectnr,
            rawDept:rawDeptCell,
            afdelingen,
            turnkey,
            rowIndex:absRow,
            invalidReason,
          });
        });

        const ongeldig=allRows.filter(r=>r.invalidReason);
        const valid=allRows.filter(r=>!r.invalidReason&&r.projectnr);
        const nieuw=valid.filter(r=>!existingNrs.has(r.projectnr));
        const bestaand=valid.filter(r=>existingNrs.has(r.projectnr));

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

  const handleImport=()=>{if(preview?.nieuw)onImport(preview.nieuw);};

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
                ["Calculator","Projectleider",""],
                ["Datum opdracht","Datum opdracht",""],
                ["Startdatum","Startdatum",""],
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
            <p className="text-[10px] text-amber-600 font-medium">Al bestaand</p>
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
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-2">Overgeslagen — al bestaand ({preview.bestaand.length})</p>
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
          <Btn onClick={handleImport} disabled={preview.nieuw.length===0}>
            <Download className="w-4 h-4"/>
            {preview.nieuw.length} project{preview.nieuw.length!==1?"en":""} importeren
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
    startdatum:initial.startdatum||new Date().toISOString(),
    afloopdatum:initial.afloopdatum||new Date().toISOString(),
    medewerkers:initial.medewerkers||[],status:initial.status||"Offerte",
    notities:initial.notities||"",uurprijs:initial.uurprijs||65,uren:initial.uren||8,
    region:initial.region||"",
  });
  const [assignAfd,setAssignAfd]=useState<Afdeling>(f.afdeling);
  const [assignComps,setAssignComps]=useState<string[]>([]);
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
  const valid=f.projectnaam&&f.opdrachtgever&&f.afdelingen?.length&&f.projectleider;
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
      <Input label="Projectnaam" value={f.projectnaam} onChange={v=>set("projectnaam",v)} required placeholder="Naam van het project"/>
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
      <Select label="Projectleider" value={f.projectleider} onChange={v=>set("projectleider",v)} required options={employees.filter(e=>e.functie==="Projectleider").map(e=>({value:e.id,label:e.naam}))}/>
      <Select label="Status" value={f.status} onChange={v=>set("status",v as ProjectStatus)} options={STATS.map(s=>({value:s,label:s}))}/>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <Input label="Regio / Vestiging" value={f.region||""} onChange={v=>set("region",v)} placeholder="bijv. West, Noord, Zuid"/>
      <Input label="Startdatum & tijd" value={toDTLocal(f.startdatum)} onChange={v=>set("startdatum",new Date(v).toISOString())} type="datetime-local" required/>
      <Input label="Afloopdatum & tijd" value={toDTLocal(f.afloopdatum)} onChange={v=>set("afloopdatum",new Date(v).toISOString())} type="datetime-local" required/>
    </div>
    <Textarea label="Werkzaamheden" value={f.werkzaamheden} onChange={v=>set("werkzaamheden",v)} rows={3} placeholder="Omschrijving van de werkzaamheden..."/>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Input label="Uurprijs (€)" value={String(f.uurprijs)} onChange={v=>set("uurprijs",parseFloat(v)||0)} type="number"/>
      <Input label="Geschatte uren" value={String(f.uren)} onChange={v=>set("uren",parseFloat(v)||0)} type="number"/>
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
      <Btn onClick={()=>{if(valid)onSave(f);}} disabled={!valid}>{isEdit?"Opslaan":"Project aanmaken"}</Btn>
    </div>
  </div>;
}

// ===== PROJECT DETAIL =====
type ProjTab="overzicht"|"werkzaamheden"|"planning"|"medewerkers"|"documenten"|"facturatie"|"notities";
function ProjectDetail({project,employees,onEdit,onDelete,onClose}:{
  project:Project;employees:Employee[];onEdit:()=>void;onDelete:(id:string)=>void;onClose:()=>void;
}){
  const dc=useDC();
  const [tab,setTab]=useState<ProjTab>("overzicht");
  const [notities,setNotities]=useState(project.notities);
  const [docs,setDocs]=useState<string[]>([]);
  const [confirmDel,setConfirmDel]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const pl=employees.find(e=>e.id===project.projectleider);
  const meds=employees.filter(e=>project.medewerkers.includes(e.id));
  const totaal=project.uurprijs*project.uren;
  const dur=Math.ceil((new Date(project.afloopdatum).getTime()-new Date(project.startdatum).getTime())/86400000);
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
          {[["Opdrachtgever",project.opdrachtgever],["Adres",project.adres||project.plaats],["Startdatum",fmtDate(project.startdatum)+" "+fmtTime(project.startdatum)],["Afloopdatum",fmtDate(project.afloopdatum)+" "+fmtTime(project.afloopdatum)],["Duur",`${dur} dag${dur!==1?"en":""}`],["Totaal",`€ ${totaal.toLocaleString("nl-NL")}`]].map(([k,v])=>
            <div key={k} className="bg-[#F0F3F8] rounded-xl p-3">
              <p className="text-xs text-[#6B7A99] mb-0.5">{k}</p>
              <p className="font-semibold text-[#1A2744] text-sm">{v}</p>
            </div>
          )}
        </div>
        {pl&&<div className="flex items-center gap-3 p-3 bg-[#E0F7F6] rounded-xl">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{backgroundColor:primaryDc.bg}}>{pl.naam.slice(0,1)}</div>
          <div><p className="font-semibold text-[#1A2744] text-sm">{pl.naam}</p><p className="text-xs text-[#6B7A99]">Projectleider</p></div>
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
        {meds.length===0&&<p className="text-[#6B7A99] text-sm">Geen medewerkers toegewezen.</p>}
        {meds.map(e=><div key={e.id} className="flex items-center gap-3 p-3 border border-[rgba(26,39,68,0.08)] rounded-xl">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
          <div className="flex-1"><p className="font-semibold text-[#1A2744] text-sm">{e.naam}</p><p className="text-xs text-[#6B7A99]">{e.functie}</p></div>
          <DeptBadge afd={e.afdeling}/>
        </div>)}
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
  const toggle=(key:string)=>setStatus(prev=>({...prev,[key]:!prev[key]}));
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
  ["dashboard",LayoutDashboard,"Dashboard"],["projecten",FolderOpen,"Projecten"],
  ["agenda",CalendarDays,"Agenda"],["personeelsplanning",Users,"Personeelsplanning"],
  ["beschikbaarheid",Clock3,"Beschikbaarheid"],["medewerkers",UserCircle,"Medewerkers"],
  ["facturatie",Receipt,"Facturatie"],["instellingen",Settings,"Instellingen"],
];
function SidebarContent({active,onNav}:{active:Nav;onNav:(n:Nav)=>void}){
  return <>
    <div className="px-5 py-5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#0ABFB8] flex items-center justify-center"><Layers className="w-4 h-4 text-white"/></div>
        <span className="text-white font-bold text-base tracking-tight">PlanPro</span>
      </div>
      <p className="text-[#6B8099] text-xs mt-0.5">Projectplanning</p>
    </div>
    <div className="px-3 py-1 space-y-0.5 flex-1">
      {NAV_ITEMS.map(([id,Icon,label])=><button key={id} onClick={()=>onNav(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${active===id?"bg-white/15 text-white font-semibold":"text-[#8899BB] hover:text-white hover:bg-white/8"}`}>
        <Icon className="w-4 h-4 flex-shrink-0"/>{label}
      </button>)}
    </div>
    <div className="p-4 border-t border-white/10">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-[#0ABFB8] flex items-center justify-center text-white text-xs font-bold">JV</div>
        <div><p className="text-white text-xs font-semibold">Jan de Vries</p><p className="text-[#6B8099] text-xs">Projectleider</p></div>
      </div>
    </div>
  </>;
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
  const labels:Record<Nav,string>={dashboard:"Dashboard",projecten:"Projecten",agenda:"Agenda",personeelsplanning:"Planning",beschikbaarheid:"Beschikbaarheid",medewerkers:"Medewerkers",facturatie:"Facturatie",instellingen:"Instellingen"};
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
    {label:"Actieve projecten",value:active.length,icon:FolderOpen,color:"#0ABFB8",bg:"#E0F7F6",nav:"projecten" as Nav},
    {label:"Projecten deze week",value:thisWeek.length,icon:CalendarDays,color:"#6366F1",bg:"#EDE9FE",nav:"agenda" as Nav},
    {label:"Beschikbare medewerkers",value:avail.length,icon:UserCheck,color:"#10B981",bg:"#D1FAE5",nav:"beschikbaarheid" as Nav},
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
          <h3 className="font-semibold text-[#1A2744] text-sm md:text-base">Actieve projecten</h3>
          <button onClick={()=>onNav("projecten")} className="text-xs text-[#0ABFB8] hover:underline">Alle projecten</button>
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
          {active.length===0&&<p className="px-5 py-8 text-center text-sm text-[#6B7A99]">Geen actieve projecten</p>}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(26,39,68,0.06)] flex items-center justify-between">
          <h3 className="font-semibold text-[#1A2744] text-sm md:text-base">Medewerkers vandaag</h3>
          <button onClick={()=>onNav("beschikbaarheid")} className="text-xs text-[#0ABFB8] hover:underline">Beschikbaarheid</button>
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
      <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(26,39,68,0.06)]"><h3 className="font-semibold text-[#1A2744]">Projecten per afdeling</h3></div>
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

function ProjectenView({projects,employees,onAdd,onEdit,onDelete,onOpen,onImport}:{
  projects:Project[];employees:Employee[];
  onAdd:(prefill?:Partial<Project>)=>void;onEdit:(p:Project)=>void;onDelete:(id:string)=>void;onOpen:(p:Project)=>void;
  onImport:(rows:ImportRow[])=>void;
}){
  const dc=useDC();
  const [filters,setFilters]=useState<ColFilters>(EMPTY_FILTERS);
  const [del,setDel]=useState<string|null>(null);
  const [showImport,setShowImport]=useState(false);
  const set=(k:keyof ColFilters)=>(v:string)=>setFilters(prev=>({...prev,[k]:v}));
  const activeCount=Object.values(filters).filter(Boolean).length;
  const [showMobileFilters,setShowMobileFilters]=useState(false);

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
        <h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Projecten</h1>
        <p className="text-[#6B7A99] text-xs md:text-sm">{filtered.length} van {projects.length} projecten{activeCount>0&&<span> · <button onClick={()=>setFilters(EMPTY_FILTERS)} className="text-[#0ABFB8] hover:underline font-medium">Filters wissen ({activeCount})</button></span>}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0 flex-wrap">
        <button onClick={()=>setShowMobileFilters(p=>!p)} className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[rgba(26,39,68,0.15)] text-[#6B7A99] text-sm font-medium">
          <Filter className="w-3.5 h-3.5"/>{activeCount>0&&<span className="w-4 h-4 rounded-full bg-[#0ABFB8] text-white text-xs flex items-center justify-center">{activeCount}</span>}
        </button>
        <Btn variant="secondary" onClick={()=>setShowImport(true)} size="sm"><Table2 className="w-3.5 h-3.5"/>Excel importeren</Btn>
        <Btn onClick={()=>onAdd()}><Plus className="w-4 h-4"/><span className="hidden sm:inline">Nieuw project</span></Btn>
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
        <div><label className="text-xs text-[#6B7A99] mb-1 block">Projectleider</label>
          <select value={filters.projectleider} onChange={e=>set("projectleider")(e.target.value)} className="w-full py-1.5 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg text-[#1A2744] bg-white">
            <option value="">Alle</option>{employees.map(e=><option key={e.id} value={e.id}>{e.naam}</option>)}
          </select>
        </div>
        <div><label className="text-xs text-[#6B7A99] mb-1 block">Medewerker</label>
          <select value={filters.medewerker} onChange={e=>set("medewerker")(e.target.value)} className="w-full py-1.5 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg text-[#1A2744] bg-white">
            <option value="">Alle</option>{employees.map(e=><option key={e.id} value={e.id}>{e.naam}</option>)}
          </select>
        </div>
      </div>
      <ColSearch value={filters.projectnaam} onChange={set("projectnaam")} placeholder="Zoek projectnaam..."/>
      <ColSearch value={filters.opdrachtgever} onChange={set("opdrachtgever")} placeholder="Zoek opdrachtgever..."/>
    </div>}
    {/* Mobile card view */}
    <div className="md:hidden space-y-3">
      {filtered.map(p=>{const pl=employees.find(e=>e.id===p.projectleider);const afds=getAllAfds(p);return<div key={p.id} className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(26,39,68,0.06)]" style={{borderLeftColor:dc[afds[0]].bg,borderLeftWidth:4}}>
          <span className="font-mono text-xs text-[#6B7A99] flex-shrink-0">{p.werknummer}</span>
          <span className="font-semibold text-[#1A2744] flex-1 truncate">{p.projectnaam}</span>
          <StatusBadge status={p.status}/>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm text-[#6B7A99]"><Building2 className="w-3.5 h-3.5 flex-shrink-0"/>{p.opdrachtgever}</div>
          <div className="flex items-center gap-1.5 text-sm text-[#6B7A99]"><MapPin className="w-3.5 h-3.5 flex-shrink-0"/>{p.plaats}</div>
          {pl&&<div className="flex items-center gap-1.5 text-sm text-[#6B7A99]"><UserCircle className="w-3.5 h-3.5 flex-shrink-0"/>{pl.naam}</div>}
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
            <ColHeader label="Project" active={!!filters.projectnaam}><ColSearch value={filters.projectnaam} onChange={set("projectnaam")} placeholder="Zoek project..."/></ColHeader>
            <ColHeader label="Opdrachtgever" active={!!filters.opdrachtgever}><ColSearch value={filters.opdrachtgever} onChange={set("opdrachtgever")} placeholder="Zoek opdrachtgever..."/></ColHeader>
            <ColHeader label="Plaats" active={!!filters.plaats}><ColSelect value={filters.plaats} onChange={set("plaats")} options={uniquePlaatsen}/></ColHeader>
            <ColHeader label="Afdeling" active={!!filters.afdeling}><ColSelect value={filters.afdeling} onChange={set("afdeling")} options={AFDS}/></ColHeader>
            <ColHeader label="Projectleider" active={!!filters.projectleider}>
              <select value={filters.projectleider} onChange={e=>set("projectleider")(e.target.value)} className="w-full py-1.5 px-2 text-xs border border-[rgba(26,39,68,0.12)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0ABFB8]/50 text-[#1A2744] bg-white">
                <option value="">Alle</option>{employees.map(e=><option key={e.id} value={e.id}>{e.naam}</option>)}
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
            const pl=employees.find(e=>e.id===p.projectleider);
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
              <td className="px-3 py-3 text-[#1A2744]">{pl?.naam||"-"}</td>
              <td className="px-3 py-3 text-[#6B7A99] max-w-32 truncate" title={p.werkzaamheden}>{p.werkzaamheden||"-"}</td>
              <td className="px-3 py-3 text-[#6B7A99] whitespace-nowrap">{fmtDate(p.startdatum)}</td>
              <td className="px-3 py-3 text-[#6B7A99] whitespace-nowrap">{fmtDate(p.afloopdatum)}</td>
              <td className="px-3 py-3 text-[#6B7A99]">{p.medewerkers.map(id=>employees.find(e=>e.id===id)?.naam.split(" ")[0]).filter(Boolean).join(", ")||"-"}</td>
              <td className="px-3 py-3"><StatusBadge status={p.status}/></td>
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
    {del&&<ConfirmModal message="Weet je zeker dat je dit project wilt verwijderen? Dit kan niet ongedaan worden gemaakt." onConfirm={()=>{onDelete(del);setDel(null);}} onCancel={()=>setDel(null)}/>}
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
            <span className="text-[9px] text-[#B8C3D9] font-medium">{wn}</span>
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
          const st=projStyle(ev.project,dc);
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
        {allDayEvs.map(ev=>{const st=projStyle(ev.project,dc);const lbl=projLabel(ev.project,employees);return <div key={ev.project.id} onClick={()=>onClickProject(ev.project)} draggable className="absolute h-5 rounded text-white text-xs font-medium px-1.5 flex items-center cursor-pointer hover:brightness-110 z-10 overflow-hidden" style={{left:`${ev.sc/7*100+0.3}%`,width:`${(ev.ec-ev.sc+1)/7*100-0.6}%`,top:6+ev.slot*22,...st}}><span className="truncate">{lbl}</span></div>;})}
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
              const st=projStyle(p,dc);
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
  const dayProjs=projects.filter(p=>sameDay(new Date(p.startdatum),date));
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
        {allDay.map(p=><button key={p.id} onClick={()=>onClickProject(p)} className="px-3 py-1 rounded-full text-xs font-medium text-white cursor-pointer hover:opacity-80 transition-opacity" style={projStyle(p,dc)}>{p.projectnaam}</button>)}
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
          const top=Math.max(0,(s.getHours()-BASE_HOUR+s.getMinutes()/60)*HOUR_HEIGHT);
          const durH=e.getHours()-s.getHours()+(e.getMinutes()-s.getMinutes())/60;
          const ht=Math.max(HOUR_HEIGHT/2,durH*HOUR_HEIGHT);
          const st=projStyle(p,dc);
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
                  <span className="text-[8px] text-[#B8C3D9] font-medium">{wn}</span>
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
                const st=projStyle(ev.project,dc);
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
function AgendaView({projects,employees,updateProject,onOpenProject,onCreateProject}:{
  projects:Project[];employees:Employee[];updateProject:(id:string,u:Partial<Project>)=>void;
  onOpenProject:(p:Project)=>void;onCreateProject:(prefill:Partial<Project>)=>void;
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
  const filteredProjects=projects.filter(p=>{
    const afds=getAllAfds(p);
    if(afdFilter&&!afds.includes(afdFilter as Afdeling))return false;
    
    return true;
  });
  const handleDropProject=(id:string,newStart:Date)=>{
    const p=projects.find(x=>x.id===id);if(!p)return;
    const dur=new Date(p.afloopdatum).getTime()-new Date(p.startdatum).getTime();
    const origStart=new Date(p.startdatum);
    newStart.setHours(origStart.getHours(),origStart.getMinutes(),0,0);
    updateProject(id,{startdatum:newStart.toISOString(),afloopdatum:new Date(newStart.getTime()+dur).toISOString()});
  };
  const handleDropProjectTime=(id:string,newStart:Date)=>{
    const p=projects.find(x=>x.id===id);if(!p)return;
    const dur=new Date(p.afloopdatum).getTime()-new Date(p.startdatum).getTime();
    updateProject(id,{startdatum:newStart.toISOString(),afloopdatum:new Date(newStart.getTime()+dur).toISOString()});
  };
  const handleResize=(id:string,newEnd:Date)=>{updateProject(id,{afloopdatum:newEnd.toISOString()});};
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
        <Btn size="sm" onClick={()=>onCreateProject({})}><Plus className="w-3.5 h-3.5"/><span className="hidden sm:inline">Nieuw project</span></Btn>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={afdFilter} onChange={setAfdFilter} options={AFDS.map(a=>({value:a,label:a}))} className="w-32 md:w-36"/>
        <button onClick={()=>setShowWeekNumbers(p=>!p)} className={`px-2 py-0.5 text-xs rounded-lg font-medium transition-colors ${showWeekNumbers?"bg-[#E0F7F6] text-[#0ABFB8]":"text-[#6B7A99] hover:bg-[#F0F3F8]"}`}>Wk#</button>
      </div>

    </div>
    <div className="flex-1 overflow-hidden bg-white">
      {view==="month"&&<div className="h-full overflow-y-auto">
        <MonthView year={year} month={month} projects={filteredProjects} employees={employees} schoolRegions={schoolRegions}
          onClickProject={onOpenProject} onClickDate={handleClickDate} onDropProject={handleDropProject} showWeekNumbers={showWeekNumbers}/>
      </div>}
      {view==="week"&&<WeekView weekDays={weekDays} projects={filteredProjects} employees={employees}
        onClickProject={onOpenProject} onClickDateTime={handleClickDateTime}
        onDropProject={handleDropProjectTime} onResizeProject={handleResize}/>}
      {view==="day"&&<DayView date={date} projects={filteredProjects} employees={employees}
        onClickProject={onOpenProject} onClickTime={h=>handleClickDateTime(date,h)}
        onDropProject={handleDropProjectTime} onResizeProject={handleResize}/>}
      {view==="kwartaal"&&<div className="h-full overflow-y-auto">
        <KwartaalView year={year} quarter={quarter} projects={filteredProjects} employees={employees} schoolRegions={schoolRegions}
          onClickProject={onOpenProject} onClickDate={handleClickDate} onDropProject={handleDropProject} showWeekNumbers={showWeekNumbers}/>
      </div>}
    </div>
  </div>;
}

// ===== PERSONEELSPLANNING =====
type PlanView="dag"|"week"|"maand"|"kwartaal";
function PersoneelsplanningView({projects,employees,availability,updateProject,onOpenProject,onVacImport}:{
  projects:Project[];employees:Employee[];availability:AvailEntry[];
  updateProject:(id:string,u:Partial<Project>)=>void;
  onOpenProject:(p:Project)=>void;onVacImport:()=>void;
}){
  const dc=useDC();
  const [view,setView]=useState<PlanView>("week");
  const [refDate,setRefDate]=useState(()=>{const d=new Date();d.setHours(0,0,0,0);return d;});
  const [afdFilter,setAfdFilter]=useState<string>("");
  const visEmp=employees.filter(e=>!afdFilter||e.afdeling===afdFilter);
  const navigate=(dir:number)=>{const d=new Date(refDate);if(view==="dag")d.setDate(d.getDate()+dir);else if(view==="week")d.setDate(d.getDate()+dir*7);else if(view==="maand")d.setMonth(d.getMonth()+dir);else d.setMonth(d.getMonth()+dir*3);setRefDate(d);};
  const getEmpProjsDate=(empId:string,date:Date)=>projects.filter(p=>{const s=new Date(p.startdatum);s.setHours(0,0,0,0);const e=new Date(p.afloopdatum);e.setHours(23,59,59,999);return p.medewerkers.includes(empId)&&s<=date&&e>=date;});
  const getEmpProjsWeek=(empId:string,wk:Date)=>{const we=new Date(wk);we.setDate(wk.getDate()+6);we.setHours(23,59,59,999);const ws=new Date(wk);ws.setHours(0,0,0,0);return projects.filter(p=>{const s=new Date(p.startdatum);const e=new Date(p.afloopdatum);return p.medewerkers.includes(empId)&&s<=we&&e>=ws;});};

  const getDayBlocks=(empId:string,date:Date)=>{
    const ds=toDateStr(date);
    type Block={startTime:string;endTime:string;status:AvailStatus;label:string;proj?:Project};
    const blocks:Block[]=[];
    availability.filter(a=>a.employeeId===empId&&a.date===ds).forEach(av=>{
      const proj=av.projectId?projects.find(p=>p.id===av.projectId):undefined;
      blocks.push({startTime:av.startTime,endTime:av.endTime,status:av.status,label:proj?`${proj.werknummer} – ${proj.projectnaam}`:av.note||av.status,proj});
    });
    projects.forEach(p=>{
      if(!p.medewerkers.includes(empId))return;
      const ps=new Date(p.startdatum);ps.setHours(0,0,0,0);const pe=new Date(p.afloopdatum);pe.setHours(23,59,59,999);
      if(ps>date||pe<date)return;
      if(blocks.some(b=>b.proj?.id===p.id))return;
      const psd=new Date(p.startdatum);const ped=new Date(p.afloopdatum);
      const isFirst=toDateStr(psd)===ds;const isLast=toDateStr(ped)===ds;
      const st=isFirst?fmtHM(psd.getHours(),psd.getMinutes()):"08:00";
      const et=isLast?fmtHM(ped.getHours(),ped.getMinutes()):"17:00";
      blocks.push({startTime:st,endTime:et,status:"Ingepland",label:`${p.werknummer} – ${p.projectnaam}`,proj:p});
    });
    return blocks.sort((a,b)=>a.startTime.localeCompare(b.startTime));
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

  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Personeelsplanning</h1><p className="text-[#6B7A99] text-xs md:text-sm">Bezetting per medewerker</p></div>
      <Btn variant="secondary" onClick={onVacImport} size="sm"><Table2 className="w-3.5 h-3.5"/>Vakantie importeren</Btn>
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
      <Select value={afdFilter} onChange={setAfdFilter} options={AFDS.map(a=>({value:a,label:a}))} className="w-36 md:w-40"/>
    </div>

    {view==="dag"&&<div className="space-y-3">
      {visEmp.map(e=>{
        const blocks=getDayBlocks(e.id,refDate);
        return <div key={e.id} className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(26,39,68,0.06)]" style={{borderLeftColor:dc[e.afdeling].bg,borderLeftWidth:4}}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
            <div><p className="font-semibold text-[#1A2744] text-sm">{e.naam}</p><p className="text-xs text-[#6B7A99]">{e.functie}</p></div>
          </div>
          {blocks.length===0
            ?<p className="px-4 py-3 text-xs text-[#B8C3D9]">Geen tijdblokken voor deze dag</p>
            :<div className="divide-y divide-[rgba(26,39,68,0.05)]">
              {blocks.map((b,bi)=>(
                <div key={bi} className={`flex items-center gap-3 px-4 py-2.5 ${b.proj?"cursor-pointer hover:bg-[#F8F9FC]":""}`} onClick={()=>b.proj&&onOpenProject(b.proj)}>
                  <span className="text-xs font-mono text-[#6B7A99] whitespace-nowrap w-28 flex-shrink-0">{b.startTime}–{b.endTime}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0" style={{backgroundColor:AS[b.status].bg,color:AS[b.status].text}}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor:AS[b.status].dot}}/>
                    {b.status}
                  </span>
                  {b.label!==b.status&&<span className="text-xs text-[#1A2744] truncate">{b.label}</span>}
                </div>
              ))}
            </div>
          }
        </div>;
      })}
    </div>}

    {(view==="week"||view==="maand")&&(
    <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-auto">
      <table className="text-xs" style={{minWidth:`${180+dates.length*(view==="week"?80:44)}px`}}>
        <thead className="bg-[#F0F3F8] sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left text-[#6B7A99] font-semibold uppercase tracking-wide sticky left-0 bg-[#F0F3F8] z-20 min-w-40">Medewerker</th>
            {dates.map(d=>{const ds=toDateStr(d);const hol=getDHol(ds);const isT=ds===TODAY_STR;const isWE=d.getDay()===0||d.getDay()===6;return<th key={ds} className={`py-2 text-center font-semibold min-w-10 ${isT?"text-[#0ABFB8]":isWE?"text-[#B8C3D9]":hol?"text-red-400":"text-[#6B7A99]"} ${isWE||hol?"bg-[#F8F8FB]":""}`}>
              <div>{DAYS_NL[(d.getDay()+6)%7]}</div>
              <div className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center ${isT?"bg-[#1A2744] text-white":""}`}>{d.getDate()}</div>
              {hol&&view!=="maand"&&<div className="text-[8px] truncate max-w-16 mx-auto text-red-400">{hol}</div>}
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
            {dates.map(d=>{const ds=toDateStr(d);const ps=getEmpProjsDate(e.id,d);const conflict=ps.length>1;const isWE=d.getDay()===0||d.getDay()===6;const avDay=availability.filter(a=>a.employeeId===e.id&&a.date===ds);const dom=getDominantStatus(avDay);
            return<td key={ds} className={`py-1 px-0.5 text-center align-middle ${isWE?"bg-[#F8F8FB]":""} ${conflict?"bg-red-50":""}`}>
              {ps.length>0?<div className="space-y-0.5">
                {ps.map(p=><button key={p.id} onClick={()=>onOpenProject(p)} className="rounded text-white px-1 py-0.5 text-[10px] font-medium truncate hover:opacity-80 transition-opacity block w-full text-left" style={projStyle(p,dc)} title={`${p.werknummer} – ${p.projectnaam}`}>
                  {p.projectnaam.slice(0,4)+".."}
                </button>)}
                {conflict&&<div className="text-[9px] text-red-500 font-bold">⚠</div>}
              </div>:avDay.length>0?<div className="w-6 h-6 rounded-full mx-auto" style={{backgroundColor:AS[dom].bg}} title={dom}/>:null}
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
            {weeks.map((wk,i)=>{const we=new Date(wk);we.setDate(wk.getDate()+6);const wn=getWeekNumber(wk);return<th key={i} className="py-2 px-1 text-center font-semibold text-[#6B7A99] min-w-16">
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
            {weeks.map((wk,i)=>{const ps=getEmpProjsWeek(e.id,wk);return<td key={i} className="py-1.5 px-1 text-center align-middle">
              {ps.length>0?<div className="space-y-0.5">
                {ps.slice(0,2).map(p=><button key={p.id} onClick={()=>onOpenProject(p)} className="rounded text-white px-1 py-0.5 text-[9px] font-medium truncate hover:opacity-80 transition-opacity block w-full text-left" style={projStyle(p,dc)} title={`${p.werknummer} – ${p.projectnaam}`}>
                  {p.projectnaam.slice(0,7)}
                </button>)}
                {ps.length>2&&<div className="text-[9px] text-[#6B7A99]">+{ps.length-2}</div>}
              </div>:null}
            </td>;})}
          </tr>)}
        </tbody>
      </table>
    </div>
    )}

    <div className="flex items-center gap-4 flex-wrap">
      {AFDS.map(a=><div key={a} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{backgroundColor:dc[a].bg}}/><span className="text-xs text-[#6B7A99]">{a}</span></div>)}
      {AVAIL_STATS.map(s=><div key={s} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor:AS[s].dot}}/><span className="text-xs text-[#6B7A99]">{s}</span></div>)}
    </div>
  </div>;
}

// ===== BESCHIKBAARHEID =====
interface AvailForm { id?:string; employeeId:string; date:string; startTime:string; endTime:string; status:AvailStatus; note:string; }
function BeschikbaarheidView({employees,availability,setAvailability,onVacImport}:{
  employees:Employee[];availability:AvailEntry[];
  setAvailability:(fn:(prev:AvailEntry[])=>AvailEntry[])=>void;
  onVacImport:()=>void;
}){

  const dc=useDC();
  const [weekStart,setWeekStart]=useState(()=>{const d=new Date();d.setDate(d.getDate()-(d.getDay()||7)+1);d.setHours(0,0,0,0);return d;});
  const [afdFilter,setAfdFilter]=useState<string>("");
  const [modal,setModal]=useState<AvailForm|null>(null);
  const weekDays=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);return d;});
  const visEmp=employees.filter(e=>!afdFilter||e.afdeling===afdFilter);
  const getBlocks=(empId:string,ds:string)=>availability.filter(a=>a.employeeId===empId&&a.date===ds&&!a.projectId).sort((a,b)=>a.startTime.localeCompare(b.startTime));
  const getProjBlocks=(empId:string,ds:string)=>availability.filter(a=>a.employeeId===empId&&a.date===ds&&!!a.projectId).sort((a,b)=>a.startTime.localeCompare(b.startTime));
  const openAdd=(empId:string,ds:string)=>setModal({employeeId:empId,date:ds,startTime:"08:00",endTime:"17:00",status:"Beschikbaar",note:""});
  const openEdit=(av:AvailEntry)=>setModal({id:av.id,employeeId:av.employeeId,date:av.date,startTime:av.startTime,endTime:av.endTime,status:av.status,note:av.note||""});
  const deleteBlock=(id:string)=>setAvailability(prev=>prev.filter(a=>a.id!==id));
  const saveBlock=()=>{
    if(!modal)return;
    setAvailability(prev=>{
      const filtered=modal.id?prev.filter(a=>a.id!==modal.id):prev;
      return [...filtered,{id:modal.id||("av"+Date.now()),employeeId:modal.employeeId,date:modal.date,startTime:modal.startTime,endTime:modal.endTime,status:modal.status,note:modal.note}];
    });
    setModal(null);
  };
  const [mobileDay,setMobileDay]=useState(()=>{const d=new Date();d.setHours(0,0,0,0);return d;});
  const mobileDayStr=toDateStr(mobileDay);
  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div className="flex items-center justify-between">
      <div><h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Beschikbaarheid</h1><p className="text-[#6B7A99] text-xs md:text-sm">Tijdblokken per medewerker per dag</p></div>
    </div>
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1">
        <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()-7);setWeekStart(d);}} className="p-1.5 rounded-lg hover:bg-[#E8EDF5] text-[#6B7A99]"><ChevronLeft className="w-4 h-4"/></button>
        <span className="text-xs md:text-sm font-semibold text-[#1A2744] min-w-40 md:min-w-52 text-center">{weekDays[0].getDate()} {MONTHS_NL[weekDays[0].getMonth()].slice(0,3)} – {weekDays[6].getDate()} {MONTHS_NL[weekDays[6].getMonth()].slice(0,3)} {weekDays[0].getFullYear()}</span>
        <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()+7);setWeekStart(d);}} className="p-1.5 rounded-lg hover:bg-[#E8EDF5] text-[#6B7A99]"><ChevronRight className="w-4 h-4"/></button>
      </div>
      <Select value={afdFilter} onChange={setAfdFilter} options={AFDS.map(a=>({value:a,label:a}))} className="w-36 md:w-40"/>
    </div>
    {/* Mobile: day picker + cards */}
    <div className="md:hidden">
      <div className="flex gap-1 overflow-x-auto pb-1 mb-3">
        {weekDays.map(d=>{const ds=toDateStr(d);const isT=ds===TODAY_STR;const isSel=ds===mobileDayStr;const isWE=d.getDay()===0||d.getDay()===6;
          return<button key={ds} onClick={()=>setMobileDay(d)} className={`flex-shrink-0 flex flex-col items-center px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${isSel?"bg-[#1A2744] text-white":isT?"bg-[#E0F7F6] text-[#0ABFB8]":isWE?"text-[#B8C3D9]":"text-[#6B7A99] hover:bg-[#F0F3F8]"}`}>
            <span className="text-[10px] uppercase">{DAYS_NL[(d.getDay()+6)%7]}</span>
            <span className="text-sm font-bold">{d.getDate()}</span>
          </button>;})}
      </div>
      <div className="space-y-3">
        {visEmp.map(e=>{
          const manualBlocks=getBlocks(e.id,mobileDayStr);
          const projBlocks=getProjBlocks(e.id,mobileDayStr);
          const allBlocks=[...projBlocks,...manualBlocks];
          return<div key={e.id} className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[rgba(26,39,68,0.06)]" style={{borderLeftColor:dc[e.afdeling].bg,borderLeftWidth:3}}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
              <div className="flex-1 min-w-0"><p className="font-semibold text-[#1A2744] text-sm">{e.naam}</p><p className="text-xs text-[#6B7A99]">{e.afdeling}</p></div>
              <button onClick={()=>openAdd(e.id,mobileDayStr)} className="p-1.5 rounded-lg bg-[#E0F7F6] text-[#0ABFB8] hover:bg-[#0ABFB8] hover:text-white transition-colors flex-shrink-0"><Plus className="w-3.5 h-3.5"/></button>
            </div>
            {allBlocks.length===0
              ?<p className="px-4 py-2.5 text-xs text-[#B8C3D9]">Geen tijdblokken — tik + om toe te voegen</p>
              :<div className="divide-y divide-[rgba(26,39,68,0.04)]">
                {allBlocks.map(av=><div key={av.id} className="flex items-center gap-2 px-4 py-2.5">
                  <span className="text-xs font-mono text-[#6B7A99] whitespace-nowrap flex-shrink-0">{av.startTime}–{av.endTime}</span>
                  <span className="flex-1 text-xs font-medium truncate" style={{color:AS[av.status].text}}>{av.note||av.status}</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0" style={{backgroundColor:AS[av.status].bg,color:AS[av.status].text}}>{av.status}</span>
                  {!av.projectId&&<div className="flex gap-1 flex-shrink-0">
                    <button onClick={()=>openEdit(av)} className="p-1 text-[#B8C3D9] hover:text-[#6B7A99]"><Pencil className="w-3 h-3"/></button>
                    <button onClick={()=>deleteBlock(av.id)} className="p-1 text-[#B8C3D9] hover:text-[#FF6B5B]"><X className="w-3 h-3"/></button>
                  </div>}
                </div>)}
              </div>
            }
          </div>;
        })}
      </div>
    </div>
    {/* Desktop: table view */}
    <div className="hidden md:block bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-auto">
      <table className="w-full text-sm" style={{minWidth:"900px"}}>
        <thead className="bg-[#F0F3F8]">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[#6B7A99] uppercase min-w-44 sticky left-0 bg-[#F0F3F8] z-10">Medewerker</th>
            {weekDays.map(d=>{const ds=toDateStr(d);const isT=ds===TODAY_STR;const isWE=d.getDay()===0||d.getDay()===6;return<th key={ds} className={`px-2 py-3 text-center text-xs font-semibold ${isT?"text-[#0ABFB8]":isWE?"text-[#B8C3D9]":"text-[#6B7A99]"} uppercase min-w-32 ${isWE?"bg-[#F8F8FB]":""}`}>{DAYS_NL[(d.getDay()+6)%7]} {d.getDate()}</th>;})}
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(26,39,68,0.05)]">
          {visEmp.map(e=><tr key={e.id} className="align-top">
            <td className="px-4 py-3 sticky left-0 bg-white z-10 border-r border-[rgba(26,39,68,0.06)]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
                <div><p className="font-semibold text-[#1A2744] text-sm">{e.naam}</p><p className="text-xs text-[#6B7A99]">{e.afdeling}</p></div>
              </div>
            </td>
            {weekDays.map(d=>{
              const ds=toDateStr(d);const isWE=d.getDay()===0||d.getDay()===6;
              const manualBlocks=getBlocks(e.id,ds);
              const projBlocks=getProjBlocks(e.id,ds);
              return<td key={ds} className={`px-1.5 py-1.5 ${isWE?"bg-[#F8F8FB]":""}`}>
                <div className="space-y-0.5">
                  {projBlocks.map(av=><div key={av.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{backgroundColor:AS[av.status].bg,color:AS[av.status].text}}>
                    <span className="whitespace-nowrap opacity-75">{av.startTime}–{av.endTime}</span>
                    <span className="truncate flex-1">{av.note||av.status}</span>
                    <span className="text-[8px] opacity-50 flex-shrink-0">auto</span>
                  </div>)}
                  {manualBlocks.map(av=><div key={av.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium group" style={{backgroundColor:AS[av.status].bg,color:AS[av.status].text}}>
                    <span className="whitespace-nowrap opacity-75">{av.startTime}–{av.endTime}</span>
                    <span className="truncate flex-1">{av.note||av.status}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={()=>openEdit(av)} className="hover:opacity-70 p-0.5" title="Bewerken"><Pencil className="w-2.5 h-2.5"/></button>
                      <button onClick={()=>deleteBlock(av.id)} className="hover:opacity-70 p-0.5" title="Verwijderen"><X className="w-2.5 h-2.5"/></button>
                    </div>
                  </div>)}
                  {!isWE&&<button onClick={()=>openAdd(e.id,ds)} className="w-full text-[10px] text-[#B8C3D9] hover:text-[#0ABFB8] hover:bg-[#E0F7F6] rounded py-0.5 transition-colors text-center leading-4">+ tijdblok</button>}
                </div>
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap gap-2">
      {AVAIL_STATS.map(s=><div key={s} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{backgroundColor:AS[s].bg}}>
        <div className="w-2 h-2 rounded-full" style={{backgroundColor:AS[s].dot}}/>
        <span className="text-xs font-medium" style={{color:AS[s].text}}>{s}</span>
      </div>)}
    </div>
    {modal&&<div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setModal(null);}}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(26,39,68,0.08)]">
          <h2 className="font-bold text-lg text-[#1A2744]">{modal.id?"Tijdblok bewerken":"Tijdblok toevoegen"}</h2>
          <button onClick={()=>setModal(null)} className="p-1.5 rounded-lg hover:bg-[#F0F3F8] text-[#6B7A99]"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-4 md:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">Medewerker</label>
              <select value={modal.employeeId} onChange={e=>setModal(p=>p?{...p,employeeId:e.target.value}:p)} className="w-full px-3 py-2 bg-[#F0F3F8] border border-[rgba(26,39,68,0.1)] rounded-lg text-sm text-[#1A2744] focus:outline-none focus:ring-2 focus:ring-[#0ABFB8]/40">
                {employees.map(e=><option key={e.id} value={e.id}>{e.naam}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">Datum</label>
              <input type="date" value={modal.date} onChange={e=>setModal(p=>p?{...p,date:e.target.value}:p)} className="w-full px-3 py-2 bg-[#F0F3F8] border border-[rgba(26,39,68,0.1)] rounded-lg text-sm text-[#1A2744] focus:outline-none focus:ring-2 focus:ring-[#0ABFB8]/40"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">Starttijd</label>
              <input type="time" value={modal.startTime} onChange={e=>setModal(p=>p?{...p,startTime:e.target.value}:p)} className="w-full px-3 py-2 bg-[#F0F3F8] border border-[rgba(26,39,68,0.1)] rounded-lg text-sm text-[#1A2744] focus:outline-none focus:ring-2 focus:ring-[#0ABFB8]/40"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">Eindtijd</label>
              <input type="time" value={modal.endTime} onChange={e=>setModal(p=>p?{...p,endTime:e.target.value}:p)} className="w-full px-3 py-2 bg-[#F0F3F8] border border-[rgba(26,39,68,0.1)] rounded-lg text-sm text-[#1A2744] focus:outline-none focus:ring-2 focus:ring-[#0ABFB8]/40"/>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">Status</label>
            <select value={modal.status} onChange={e=>setModal(p=>p?{...p,status:e.target.value as AvailStatus}:p)} className="w-full px-3 py-2 bg-[#F0F3F8] border border-[rgba(26,39,68,0.1)] rounded-lg text-sm text-[#1A2744] focus:outline-none focus:ring-2 focus:ring-[#0ABFB8]/40">
              {AVAIL_STATS.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide mb-1">Notitie (optioneel)</label>
            <input type="text" value={modal.note} onChange={e=>setModal(p=>p?{...p,note:e.target.value}:p)} placeholder="bijv. Vergadering, Doktersafspraak..." className="w-full px-3 py-2 bg-[#F0F3F8] border border-[rgba(26,39,68,0.1)] rounded-lg text-sm text-[#1A2744] focus:outline-none focus:ring-2 focus:ring-[#0ABFB8]/40"/>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(26,39,68,0.08)]">
            <button onClick={()=>setModal(null)} className="px-4 py-2 text-sm font-medium text-[#6B7A99] hover:bg-[#F0F3F8] rounded-lg transition-colors">Annuleren</button>
            <button onClick={saveBlock} className="px-4 py-2 text-sm font-semibold text-white bg-[#0ABFB8] hover:bg-[#09ABA4] rounded-lg transition-colors">{modal.id?"Opslaan":"Toevoegen"}</button>
          </div>
        </div>
      </div>
    </div>}
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
    {del&&<ConfirmModal message="Weet je zeker dat je deze medewerker wilt verwijderen? De medewerker wordt verwijderd uit alle projecten en tijdblokken." onConfirm={()=>{onDelete(del);setDel(null);}} onCancel={()=>setDel(null)}/>}
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
    const t=setTimeout(()=>{syncTable("projects",projects).catch((e:unknown)=>setDbError(e instanceof Error?e.message:String(e)));},600);
    return()=>clearTimeout(t);
  },[projects,dbReady]);
  useEffect(()=>{
    if(!dbReady)return;
    const t=setTimeout(()=>{syncTable("employees",employees).catch((e:unknown)=>setDbError(e instanceof Error?e.message:String(e)));},600);
    return()=>clearTimeout(t);
  },[employees,dbReady]);
  useEffect(()=>{
    if(!dbReady)return;
    const t=setTimeout(()=>{syncTable("availability",avail).catch((e:unknown)=>setDbError(e instanceof Error?e.message:String(e)));},600);
    return()=>clearTimeout(t);
  },[avail,dbReady]);
  useEffect(()=>{
    if(!dbReady)return;
    const t=setTimeout(()=>{syncSettings(settings).catch((e:unknown)=>setDbError(e instanceof Error?e.message:String(e)));},600);
    return()=>clearTimeout(t);
  },[settings,dbReady]);

  const addProject=(p:Project)=>{setProjects(prev=>[...prev,p]);setIsNewProject(false);setEditProject(null);};
  const updateProject=(id:string,u:Partial<Project>)=>setProjects(prev=>prev.map(p=>p.id===id?{...p,...u}:p));
  const deleteProject=(id:string)=>{setProjects(prev=>prev.filter(p=>p.id!==id));setAvail(prev=>prev.filter(a=>a.projectId!==id));if(detailProject?.id===id)setDetailProject(null);};
  const saveProject=(p:Project)=>{
    if(projects.find(x=>x.id===p.id))updateProject(p.id,p);else addProject(p);
    setAvail(prev=>{
      const withoutAuto=prev.filter(a=>a.projectId!==p.id);
      const newBlocks:AvailEntry[]=[];
      const projStartD=new Date(p.startdatum);const projEndD=new Date(p.afloopdatum);
      const startH=projStartD.getHours();const startM=projStartD.getMinutes();
      const endH=projEndD.getHours();const endM=projEndD.getMinutes();
      p.medewerkers.forEach(empId=>{
        const dates=getDatesInRange(projStartD,projEndD);
        dates.forEach((ds,i)=>{
          const st=i===0?fmtHM(startH||8,startM):"08:00";
          const et=i===dates.length-1?fmtHM(endH||17,endM):"17:00";
          newBlocks.push({id:`auto-${p.id}-${empId}-${ds}`,employeeId:empId,date:ds,startTime:st,endTime:et,status:"Ingepland",note:p.projectnaam,projectId:p.id});
        });
      });
      return [...withoutAuto,...newBlocks];
    });
    setEditProject(null);setIsNewProject(false);
  };

  const handleImport=(rows:ImportRow[])=>{
    const fallbackDate=()=>new Date().toISOString();
    const newProjects:Project[]=rows.map(r=>{
      // Resolve projectleider: match Calculator string against employee names
      const plQuery=r.projectleider.toLowerCase().trim();
      const plEmp=plQuery
        ?employees.find(e=>e.naam.toLowerCase()===plQuery)
          ||employees.find(e=>e.naam.toLowerCase().includes(plQuery))
          ||employees.find(e=>plQuery.includes(e.naam.split(" ").slice(-1)[0].toLowerCase()))
        :null;
      const pl=plEmp?.id||"";
      const afdelingen=r.afdelingen.length?r.afdelingen:["Stoffering" as Afdeling];
      const primaryAfd=afdelingen[0];
      // startdatum: use parsed value or today; afloopdatum: use datumOpdracht or startdatum or today
      const sd=r.startdatum||r.datumOpdracht||fallbackDate();
      const ed=r.datumOpdracht||r.startdatum||fallbackDate();
      return{
        id:nid(),
        projectnr:r.projectnr,
        werknummer:r.werknummer||r.projectnr,
        projectnaam:r.projectnaam,
        opdrachtgever:r.opdrachtgever||r.contactpersoon||"",
        adres:"",plaats:"",
        afdeling:primaryAfd,afdelingen,
        projectleider:pl,
        werkzaamheden:r.rawDept||"",

        startdatum:sd,
        afloopdatum:ed,
        medewerkers:[],
        status:"Offerte" as ProjectStatus,
        notities:r.contactpersoon&&r.opdrachtgever?`Contactpersoon: ${r.contactpersoon}`:"",
        uurprijs:65,uren:8,
      };
    });
    setProjects(prev=>[...prev,...newProjects]);
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
          {nav==="dashboard"&&<Dashboard projects={projects} employees={employees} availability={avail} onNav={setNav} onOpenProject={openDetailProject}/>}
          {nav==="projecten"&&<ProjectenView projects={projects} employees={employees} onAdd={openNewProject} onEdit={openEditProject} onDelete={deleteProject} onOpen={openDetailProject} onImport={handleImport}/>}
          {nav==="agenda"&&<AgendaView projects={projects} employees={employees} updateProject={updateProject} onOpenProject={openDetailProject} onCreateProject={openNewProject}/>}
          {nav==="personeelsplanning"&&<PersoneelsplanningView projects={projects} employees={employees} availability={avail} updateProject={updateProject} onOpenProject={openDetailProject} onVacImport={()=>setShowVacImport(true)}/>}
          {nav==="beschikbaarheid"&&<BeschikbaarheidView employees={employees} availability={avail} setAvailability={setAvail} onVacImport={()=>setShowVacImport(true)}/>}
          {nav==="medewerkers"&&<MedewerkersView employees={employees} onAdd={()=>{setEditEmployee({});setIsNewEmployee(true);}} onEdit={e=>{setEditEmployee(e);setIsNewEmployee(false);}} onDelete={deleteEmployee} onVacImport={()=>setShowVacImport(true)}/>}
          {nav==="facturatie"&&<FacturatieView projects={projects}/>}
          {nav==="instellingen"&&<InstellingenView settings={settings} onSave={handleSaveSettings}/>}
        </div>
      </div>
      {(isNewProject||editProject)&&editProject!==null&&(
        <Modal title={isNewProject?"Nieuw project aanmaken":"Project bewerken"} onClose={()=>{setEditProject(null);setIsNewProject(false);}}>
          <ProjectForm initial={editProject} employees={employees} projects={projects} availability={avail} onSave={saveProject} onCancel={()=>{setEditProject(null);setIsNewProject(false);}}/>
        </Modal>
      )}
      {detailProject&&<ProjectDetail project={projects.find(p=>p.id===detailProject.id)||detailProject} employees={employees} onEdit={()=>openEditProject(projects.find(p=>p.id===detailProject.id)||detailProject)} onDelete={deleteProject} onClose={()=>setDetailProject(null)}/>}
      {(isNewEmployee||editEmployee)&&editEmployee!==null&&(
        <Modal title={isNewEmployee?"Nieuwe medewerker":"Medewerker bewerken"} onClose={()=>{setEditEmployee(null);setIsNewEmployee(false);}}>
          <EmployeeForm initial={editEmployee} onSave={saveEmployee} onCancel={()=>{setEditEmployee(null);setIsNewEmployee(false);}}/>
        </Modal>
      )}
      {showVacImport&&<VacationImportModal employees={employees} projects={projects} availability={avail} onImport={handleVacImport} onClose={()=>setShowVacImport(false)}/>}
    </div>
  </DeptColorCtx.Provider>;
}
