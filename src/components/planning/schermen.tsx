// Onderdeel van de planning-app (uit planning-app.tsx gehaald om het overzichtelijk te houden).
import { useState, useRef, useEffect, useMemo } from "react";
import { LayoutDashboard, FolderOpen, CalendarDays, Users, Receipt, Settings, Plus, Pencil, Trash2, X, Search, MapPin, MessageSquare, ChevronDown, UserCircle, Filter, Calendar, UserCheck, AlertTriangle, Building2, UserCog, Clock, Menu, Table2, LogOut, History } from "lucide-react";
import { WeerAdvies } from "@/components/weer-advies";
import GereedOverzicht from "@/components/gereed-overzicht";
import { toast } from "sonner";
import { loadProjectMeta, saveProjectMeta, EMPTY_META } from "@/lib/store";
import { useAuth } from "@/components/auth-gate";
import maasmondLogo from "@/assets/maasmond-logo.jpg";
import { werkKey, type ImportRow } from "@/lib/excel-parse";
import { Nav, Afdeling, ProjectStatus, AvailStatus, Functie, Project, getIndexedProject, Employee, AvailEntry, useDC, AFDS, FUNCS, STATS, TODAY_STR, validDate, fmtDate, datePart, nid, plName, getDominantStatus, getAllAfds, projStyle, DeptBadges, StatusBadge, AvailBadge, Btn, Input, werkLabel, regioVan, regioOpties, RegioFilter, Select, ConfirmModal } from "./basis";
import { PAGE_SIZE, ExcelImportModal } from "./importeren";

// ===== EMPLOYEE FORM =====
export function EmployeeForm({initial,onSave,onCancel}:{initial:Partial<Employee>;onSave:(e:Employee)=>void;onCancel:()=>void;}){
  const dc=useDC();
  const [f,setF]=useState<Employee>({id:initial.id||nid(),naam:initial.naam||"",functie:initial.functie||"Stoffeerder",afdeling:initial.afdeling||"Stoffering",telefoon:initial.telefoon||"",email:initial.email||"",competenties:initial.competenties||[],...(initial.contractUren?{contractUren:initial.contractUren}:{})});
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Input label="Contracturen per week" value={f.contractUren?String(f.contractUren):""} onChange={v=>{const n=Number(String(v).replace(",","."));set("contractUren",Number.isFinite(n)&&n>0?n:undefined);}} placeholder="40"/>
    </div>
    <Input label="Competenties (kommagescheiden)" value={comp} onChange={v=>{setComp(v);set("competenties",v.split(",").map(s=>s.trim()).filter(Boolean));}}/>
    <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(15,23,42,0.08)]">
      <Btn variant="secondary" onClick={onCancel}>Annuleren</Btn>
      <Btn onClick={()=>{if(valid)onSave(f);}} disabled={!valid}>{initial.id?"Opslaan":"Medewerker aanmaken"}</Btn>
    </div>
  </div>;
}

// ===== SIDEBAR =====
export const NAV_ITEMS:[Nav,React.ElementType,string][]=[
  ["dashboard",LayoutDashboard,"Dashboard"],["projecten",FolderOpen,"Werken"],
  ["agenda",CalendarDays,"Agenda"],["personeelsplanning",Users,"Personeelsplanning"],
  ["uren",Clock,"Uren"],["medewerkers",UserCircle,"Medewerkers"],["notities",MessageSquare,"Notities"],
  ["facturatie",Receipt,"Facturatie"],["instellingen",Settings,"Instellingen"],
];
// Geschiedenis: alleen voor wie mag plannen; Facturatie alleen met dat recht; Gebruikersbeheer alleen beheerder
export const PLANNER_NAV_ITEMS:[Nav,React.ElementType,string][]=[["geschiedenis",History,"Geschiedenis"]];
export const ADMIN_NAV_ITEMS:[Nav,React.ElementType,string][]=[["gebruikers",UserCog,"Gebruikersbeheer"]];
export const magGeschiedenis=(r:{plannen:boolean})=>r.plannen;
export function SidebarContent({active,onNav}:{active:Nav;onNav:(n:Nav)=>void}){
  const {roles,rechten}=useAuth();
  const items=[...NAV_ITEMS.filter(n=>n[0]!=="facturatie"||rechten.facturatie),...(magGeschiedenis(rechten)?PLANNER_NAV_ITEMS:[]),...(roles.includes("beheerder")?ADMIN_NAV_ITEMS:[])];
  return <>
    <div className="px-5 pt-6 pb-5">
      <div className="flex items-center gap-3">
        <div className="bg-white rounded-2xl p-1.5 flex-shrink-0"><img src={maasmondLogo} alt="Maasmond" className="h-8 w-auto"/></div>
        <div className="leading-tight">
          <p className="text-base font-bold text-[#23272F]">Maasmond</p>
          <p className="text-[#5F6673] text-xs">Planning</p>
        </div>
      </div>
    </div>
    <div className="px-3 py-2 space-y-1 flex-1">
      {items.map(([id,Icon,label])=><button key={id} onClick={()=>onNav(id)} aria-current={active===id?"page":undefined} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-full text-sm transition-colors ${active===id?"bg-[#E0402F] text-white font-semibold":"text-[#4A443C] hover:text-[#23272F] hover:bg-[#E9EDF2]"}`}>
        <Icon className="w-4 h-4 flex-shrink-0"/>{label}
      </button>)}
    </div>
    <div className="p-4 mx-3 mb-3 rounded-[20px] bg-[#EEF1F5]">
      <SidebarUser/>
    </div>
  </>;
}
export function SidebarUser(){
  const {user,roleLabel,signOut}=useAuth();
  const email=user?.email||"";
  const naam=(user?.user_metadata?.["full_name"] as string|undefined)||(user?.user_metadata?.["name"] as string|undefined)||email.split("@")[0]||"Gebruiker";
  const initials=naam.split(/[\s.]+/).filter(Boolean).slice(0,2).map((p:string)=>p[0]?.toUpperCase()).join("")||"?";
  return <div className="space-y-2">
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="w-9 h-9 rounded-full bg-[#E0402F] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials}</div>
      <div className="min-w-0">
        <p className="text-[#23272F] text-xs font-semibold truncate">{naam}</p>
        <p className="text-[#5F6673] text-xs truncate">{roleLabel}</p>
      </div>
    </div>
    {user && <button onClick={()=>void signOut()} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-full text-xs text-[#5F6673] hover:text-[#23272F] hover:bg-[#E9EDF2] transition-colors">
      <LogOut className="w-3.5 h-3.5"/>Uitloggen
    </button>}
  </div>;
}

export function Sidebar({active,onNav,mobileOpen,onMobileClose}:{active:Nav;onNav:(n:Nav)=>void;mobileOpen:boolean;onMobileClose:()=>void}){
  const handleNav=(n:Nav)=>{onNav(n);onMobileClose();};
  return <>
    <div className="hidden md:flex w-60 mm-rail rounded-[28px] flex-col flex-shrink-0 overflow-y-auto">
      <SidebarContent active={active} onNav={onNav}/>
    </div>
    {mobileOpen&&<div className="fixed inset-0 z-50 md:hidden" onClick={onMobileClose}>
      <div className="absolute inset-0 bg-black/50"/>
      <div className="absolute left-0 top-0 bottom-0 w-64 mm-rail rounded-r-[28px] flex flex-col overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-end px-3 pt-3">
          <button onClick={onMobileClose} aria-label="Menu sluiten" className="p-1.5 rounded-full text-[#5F6673] hover:text-[#23272F] hover:bg-[#E9EDF2]"><X className="w-4 h-4"/></button>
        </div>
        <SidebarContent active={active} onNav={handleNav}/>
      </div>
    </div>}
  </>;
}
export function MobileTopBar({onOpenMenu,nav}:{onOpenMenu:()=>void;nav:Nav}){
  const labels:Record<Nav,string>={dashboard:"Dashboard",projecten:"Werken",agenda:"Agenda",personeelsplanning:"Planning",uren:"Uren",medewerkers:"Medewerkers",notities:"Notities",facturatie:"Facturatie",instellingen:"Instellingen",geschiedenis:"Geschiedenis",gebruikers:"Gebruikersbeheer"};
  return <div className="md:hidden flex items-center gap-3 px-4 py-3 mm-topbalk flex-shrink-0 z-10">
    <button onClick={onOpenMenu} aria-label="Menu openen" className="p-1.5 rounded-[10px] text-[#5F6673] hover:text-[#23272F] hover:bg-[#F2F4F7] flex-shrink-0"><Menu className="w-5 h-5"/></button>
    <div className="flex items-center gap-2 flex-shrink-0">
      <img src={maasmondLogo} alt="Maasmond" className="h-6 w-auto"/>
      <span className="text-base font-semibold text-[#23272F]">Maasmond</span>
    </div>
    <span className="text-[#5F6673] text-sm ml-auto">{labels[nav]}</span>
  </div>;
}

// ===== DASHBOARD =====
export function Dashboard({projects,employees,availability,onNav,onOpenProject,onShowActive}:{
  projects:Project[];employees:Employee[];availability:AvailEntry[];
  onNav:(n:Nav)=>void;onOpenProject:(p:Project)=>void;onShowActive:()=>void;
}){
  const dc=useDC();
  const now=new Date();
  // Alle werken met status "In uitvoering" (ook automatisch omgezette), op startdatum gesorteerd
  const active=projects.filter(p=>p.status==="In uitvoering")
    .sort((a,b)=>String(a.startdatum||"").localeCompare(String(b.startdatum||""))||String(a.werknummer).localeCompare(String(b.werknummer)));
  const thisWeek=projects.filter(p=>{const s=new Date(p.startdatum),e=new Date(p.afloopdatum),start=new Date(now);start.setDate(now.getDate()-(now.getDay()||7)+1);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(start.getDate()+6);return s<=end&&e>=start;});
  const avail=employees.filter(e=>{const avToday=availability.filter(a=>a.employeeId===e.id&&a.date===TODAY_STR);return avToday.length===0||avToday.some(a=>a.status==="Beschikbaar");});
  const conflicts=employees.filter(e=>{const ps=projects.filter(p=>p.medewerkers.includes(e.id)&&p.status==="In uitvoering");return ps.length>1;});
  const toFact=projects.filter(p=>p.status==="Afgerond");
  // Werken met status O die nog nergens zijn ingepland, op deadline gesorteerd (verlopen eerst)
  const nogInplannen=useMemo(()=>{
    const gepland=new Set<string>();
    availability.forEach(a=>{
      if(!a.projectId||a.status!=="Ingepland")return;
      gepland.add("id:"+a.projectId);
      const wp=getIndexedProject(a.projectId);
      const k=wp?werkKey(wp.werknummer):"";
      if(k)gepland.add(k);
    });
    return projects
      .filter(p=>String(p.statusExcel||"").trim().toUpperCase()==="O")
      .filter(p=>{const k=werkKey(p.werknummer);return !gepland.has("id:"+p.id)&&!(k&&gepland.has(k));})
      .map(p=>({p,deadline:validDate(p.afloopdatum)?datePart(p.afloopdatum):validDate(p.startdatum)?datePart(p.startdatum):""}))
      .sort((a,b)=>(a.deadline||"9999").localeCompare(b.deadline||"9999")||String(a.p.werknummer).localeCompare(String(b.p.werknummer)));
  },[projects,availability]);
  const dagenTot=(ds:string)=>Math.round((new Date(ds+"T12:00").getTime()-new Date(TODAY_STR+"T12:00").getTime())/86400000);
  const stats=[
    {label:"Actieve werken",value:active.length,icon:FolderOpen,color:"#1E3A7B",bg:"#FFFFFF",nav:"projecten" as Nav},
    {label:"Werken deze week",value:thisWeek.length,icon:CalendarDays,color:"#26A69A",bg:"#D9F2EF",nav:"agenda" as Nav},
    {label:"Beschikbare medewerkers",value:avail.length,icon:UserCheck,color:"#22A06B",bg:"#D9F4E5",nav:"personeelsplanning" as Nav},
    {label:"Planningconflicten",value:conflicts.length,icon:AlertTriangle,color:"#E08A12",bg:"#FDEFD3",nav:"personeelsplanning" as Nav},
    {label:"Te factureren",value:toFact.length,icon:Receipt,color:"#E0402F",bg:"#FCE1DC",nav:"facturatie" as Nav},
  ];
  return <div className="p-4 md:p-6 space-y-4 md:space-y-6">
    <div>
      <h1 className="text-[26px] md:text-[30px] leading-[32px] md:leading-[38px] font-semibold text-[#23272F]">Dashboard</h1>
      <p className="text-[#5F6673] text-xs md:text-sm">{now.toLocaleDateString("nl-NL",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
      {stats.map((s,i)=><button key={s.label} onClick={()=>s.label==="Actieve werken"?onShowActive():onNav(s.nav)} className={`${i===0?"mm-accent":"mm-kaart"} p-4 md:p-5 text-left transition-colors`}>
        <div className="flex items-center justify-between mb-2 md:mb-3">
          <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{backgroundColor:s.bg}}><s.icon className="w-4 h-4" style={{color:s.color}} aria-hidden="true"/></span>
        </div>
        <p className="text-[32px] leading-[38px] font-semibold text-[#23272F]">{s.value}</p>
        <p className="text-xs text-[#5F6673] mt-0.5 leading-tight">{s.label}</p>
      </button>)}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      {/* Nog in te plannen: status O, nergens ingepland, deadline in zicht of verlopen */}
      <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(15,23,42,0.06)] flex items-center justify-between gap-3">
          <h3 className="text-base leading-[22px] font-semibold text-[#23272F]">Nog in te plannen{nogInplannen.length>0&&<span className="ml-1.5 text-xs font-medium text-[#5F6673]">({nogInplannen.length})</span>}</h3>
          <button onClick={()=>onNav("personeelsplanning")} className="text-xs text-[#1E3A7B] hover:underline">Naar personeelsplanning</button>
        </div>
        <div className="divide-y divide-[rgba(15,23,42,0.05)] max-h-[26rem] overflow-y-auto">
          {nogInplannen.slice(0,50).map(({p,deadline})=>{
            const n=deadline?dagenTot(deadline):null;
            const label=n===null?"Geen deadline":n<0?`${-n} dag${n===-1?"":"en"} te laat`:n===0?"Deadline vandaag":`Nog ${n} dag${n===1?"":"en"}`;
            const stijl=n===null?"bg-[#ECEFF4] text-[#475569]":n<=0?"bg-[#FCE1DC] text-[#A42A1E]":n<=14?"bg-[#FDEFD3] text-[#8A5300]":"bg-[#ECEFF4] text-[#475569]";
            return <button key={p.id} onClick={()=>onOpenProject(p)} className="w-full px-4 md:px-5 py-2.5 flex items-center gap-3 hover:bg-[#F8F9FB] transition-colors text-left">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#23272F] text-sm truncate">{p.werknummer?`${p.werknummer} – `:""}{p.projectnaam}</p>
                <p className="text-xs text-[#5F6673] truncate">{[getAllAfds(p).join(", "),p.plaats].filter(Boolean).join(" · ")}{deadline?` · deadline ${fmtDate(deadline)}`:""}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${stijl}`}>{label}</span>
            </button>;
          })}
          {nogInplannen.length===0&&<p className="px-5 py-8 text-center text-sm text-[#5F6673]">Alle werken met status O zijn ingepland.</p>}
          {nogInplannen.length>50&&<p className="px-5 py-2 text-xs text-[#5F6673]">En nog {nogInplannen.length-50} werken.</p>}
        </div>
      </div>
      <WeerAdvies/>
    </div>
    <GereedOverzicht werkNaam={werkLabel} naamVan={id=>employees.find(e=>e.id===id)?.naam||"Medewerker"}/>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(15,23,42,0.06)] flex items-center justify-between">
          <h3 className="text-base leading-[22px] font-semibold text-[#23272F]">Actieve werken{active.length>0&&<span className="ml-1.5 text-xs font-medium text-[#5F6673]">({active.length})</span>}</h3>
          <button onClick={onShowActive} className="text-xs text-[#1E3A7B] hover:underline">Alle actieve werken</button>
        </div>
        {/* Alle actieve werken; bij veel werken scrollt de lijst */}
        <div className="divide-y divide-[rgba(15,23,42,0.05)] max-h-[26rem] overflow-y-auto">
          {active.map(p=>{
            const afds=getAllAfds(p);
            return <button key={p.id} onClick={()=>onOpenProject(p)} className="w-full px-4 md:px-5 py-2.5 md:py-3 flex items-center gap-3 hover:bg-[#F8F9FB] transition-colors text-left">
              <div className="w-2 h-7 md:h-8 rounded-full flex-shrink-0 overflow-hidden" style={afds.length===1?{backgroundColor:dc[afds[0]].bg}:{background:`linear-gradient(180deg, ${dc[afds[0]].bg} 50%, ${afds[1]?dc[afds[1]].bg:dc[afds[0]].bg} 50%)`}}/>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#23272F] text-sm truncate">{p.werknummer?`${p.werknummer} – `:""}{p.projectnaam}</p>
                <p className="text-xs text-[#5F6673] truncate">{[p.opdrachtgever,p.plaats].filter(Boolean).join(" · ")}{validDate(p.startdatum)?` · ${fmtDate(p.startdatum)} – ${fmtDate(p.afloopdatum)}`:""}</p>
              </div>
              <StatusBadge status={p.status}/>
            </button>;
          })}
          {active.length===0&&<p className="px-5 py-8 text-center text-sm text-[#5F6673]">Geen actieve werken</p>}
        </div>
      </div>
      <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(15,23,42,0.06)] flex items-center justify-between">
          <h3 className="text-base leading-[22px] font-semibold text-[#23272F]">Medewerkers vandaag</h3>
          <button onClick={()=>onNav("personeelsplanning")} className="text-xs text-[#1E3A7B] hover:underline">Personeelsplanning</button>
        </div>
        <div className="divide-y divide-[rgba(15,23,42,0.05)]">
          {employees.slice(0,6).map(e=>{
            const avToday=availability.filter(a=>a.employeeId===e.id&&a.date===TODAY_STR);
            const status:AvailStatus=getDominantStatus(avToday);
            return <div key={e.id} className="px-4 md:px-5 py-2.5 md:py-3 flex items-center gap-3">
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#23272F] text-sm">{e.naam}</p>
                <p className="text-xs text-[#5F6673]">{e.functie}</p>
              </div>
              <AvailBadge status={status}/>
            </div>;
          })}
        </div>
      </div>
    </div>
    <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
      <div className="px-4 md:px-5 py-3 md:py-4 border-b border-[rgba(15,23,42,0.06)]"><h3 className="text-base leading-[22px] font-semibold text-[#23272F]">Werken per afdeling</h3></div>
      <div className="px-4 md:px-5 py-4 grid grid-cols-3 gap-3 md:gap-4">
        {AFDS.map(afd=>{
          const ps=projects.filter(p=>getAllAfds(p).includes(afd));
          const act=ps.filter(p=>p.status==="In uitvoering").length;
          return <button key={afd} onClick={()=>onNav("projecten")} className="p-3 md:p-4 rounded-md border-2 text-left hover:shadow-sm transition-all" style={{borderColor:dc[afd].bg,backgroundColor:dc[afd].light}}>
            <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2">
              <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full flex-shrink-0" style={{backgroundColor:dc[afd].bg}}/>
              <span className="font-semibold text-xs md:text-sm text-[#23272F] leading-tight">{afd}</span>
            </div>
            <p className="text-xl md:text-2xl font-bold" style={{color:dc[afd].bg}}>{ps.length}</p>
            <p className="text-xs text-[#5F6673]">{act} actief</p>
          </button>;
        })}
      </div>
    </div>
  </div>;
}

// ===== PROJECTEN VIEW =====
// Kolomfilters van de Werken-tabel: vrije tekst voor de tekstkolommen,
// multi-select voor Status, A/R en Type.
export type TextFilterKey="werknummer"|"calculatiecode"|"opdrachtgever"|"straat"|"plaatsobject"|"opmerkingen";
export type MultiFilterKey="status"|"ar"|"type"|"projStatus";
export type ColFilters = Record<TextFilterKey,string> & Record<MultiFilterKey,string[]>;
export const EMPTY_FILTERS:ColFilters={werknummer:"",calculatiecode:"",opdrachtgever:"",straat:"",plaatsobject:"",opmerkingen:"",status:[],ar:[],type:[],projStatus:[]};
/** Type = afdelingsindeling van het werk (Turnkey/Combinatie bij meerdere afdelingen). */
export function typeLabel(p:Project):string{
  const afds=getAllAfds(p);
  if(afds.length>=3)return "Turnkey";
  if(afds.length>1)return "Combinatie";
  return afds[0]||"";
}
export const projStraat=(p:Project)=>p.straatObject||p.adres||"";
export const projPlaatsObj=(p:Project)=>p.plaatsObject||p.plaats||"";
export const projOpm=(p:Project)=>p.opmerkingen||"";

export function ColHeader({label,active,children}:{label:string;active:boolean;children:React.ReactNode}){
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLTableCellElement>(null);
  useEffect(()=>{const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  return <th ref={ref} className="relative px-3 py-3 text-left text-xs font-semibold text-[#5F6673]">
    <div className="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap" onClick={()=>setOpen(p=>!p)}>
      {label}
      <Filter className={`w-3 h-3 flex-shrink-0 ${active?"text-[#1E3A7B]":"text-[#9AA1AD]"}`}/>
      {active&&<span className="w-1.5 h-1.5 rounded-full bg-[#1E3A7B] flex-shrink-0"/>}
    </div>
    {open&&<div className="absolute left-0 top-full z-50 mt-1 bg-white rounded-md shadow-lg border border-[rgba(15,23,42,0.1)] p-2 min-w-44" onClick={e=>e.stopPropagation()}>
      {children}
    </div>}
  </th>;
}
export function ColSearch({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}){
  return <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#9AA1AD]"/><input autoFocus value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full pl-6 pr-2 py-1.5 text-xs border border-[rgba(15,23,42,0.12)] rounded-[10px] focus:outline-none focus:ring-1 focus:ring-[#1E3A7B]/50 text-[#23272F]"/></div>;
}
export function ColSelect({value,onChange,options}:{value:string;onChange:(v:string)=>void;options:string[]}){
  return <select value={value} onChange={e=>onChange(e.target.value)} className="w-full py-1.5 px-2 text-xs border border-[rgba(15,23,42,0.12)] rounded-[10px] focus:outline-none focus:ring-1 focus:ring-[#1E3A7B]/50 text-[#23272F] bg-white">
    <option value="">Alle</option>
    {options.map(o=><option key={o} value={o}>{o}</option>)}
  </select>;
}
/** Multi-select filter met alleen de waarden die in de data voorkomen. */
export function ColMulti({values,onChange,options}:{values:string[];onChange:(v:string[])=>void;options:string[]}){
  if(options.length===0)return <p className="text-xs text-[#5F6673] px-1 py-1">Geen waarden</p>;
  return <div className="max-h-56 overflow-y-auto space-y-1 min-w-40">
    {values.length>0&&<button onClick={()=>onChange([])} className="text-[11px] text-[#1E3A7B] hover:underline px-1">Selectie wissen</button>}
    {options.map(o=><label key={o} className="flex items-center gap-2 text-xs text-[#23272F] px-1 py-0.5 cursor-pointer hover:bg-[#F2F4F7] rounded">
      <input type="checkbox" checked={values.includes(o)} onChange={()=>onChange(values.includes(o)?values.filter(v=>v!==o):[...values,o])} className="accent-[#1E3A7B]"/>
      <span className="truncate">{o}</span>
    </label>)}
  </div>;
}

// Statuscel: direct wijzigen vanuit de projectrij (desktop + mobiel)
export function StatusCell({project,onStatusChange}:{project:Project;onStatusChange:(p:Project,s:ProjectStatus)=>Promise<void>}){
  const [saving,setSaving]=useState(false);
  return <div className="relative inline-flex items-center gap-1" onClick={e=>e.stopPropagation()}>
    <StatusBadge status={project.status}/>
    <ChevronDown className="w-3 h-3 text-[#9AA1AD] flex-shrink-0"/>
    {saving&&<span className="text-[10px] text-[#5F6673] whitespace-nowrap">Opslaan…</span>}
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

// Melding + knop om dubbel ingelezen werken samen te voegen (met bevestiging)
// ===== Notitie na verslepen =====
// Na het verslepen van planning krijgt de gebruiker direct de kans een notitie bij dat werk te zetten
// (bijv. de reden van de verschuiving). De notitie komt onderaan in het tabblad Notities van het werk.
export const NOTITIE_EVENT="mm-notitie-na-verslepen";
export const vraagNotitie=(projectId:string|undefined|null,wat:string)=>{
  if(projectId)window.dispatchEvent(new CustomEvent(NOTITIE_EVENT,{detail:{projectId,wat}}));
};
export function NotitieNaVerslepen(){
  const {user}=useAuth();
  const [vraag,setVraag]=useState<{projectId:string;wat:string}|null>(null);
  const [tekst,setTekst]=useState("");
  const [bezig,setBezig]=useState(false);
  useEffect(()=>{
    const op=(e:Event)=>{setVraag((e as CustomEvent<{projectId:string;wat:string}>).detail);setTekst("");};
    window.addEventListener(NOTITIE_EVENT,op);
    return()=>window.removeEventListener(NOTITIE_EVENT,op);
  },[]);
  if(!vraag)return null;
  const p=getIndexedProject(vraag.projectId);
  const sluit=()=>{setVraag(null);setTekst("");};
  const opslaan=async()=>{
    const t=tekst.trim();if(!t){sluit();return;}
    setBezig(true);
    try{
      const prev=await loadProjectMeta(vraag.projectId);
      const oud=(prev?.notities||p?.notities||"").trimEnd();
      const wie=(user?.email||"").split("@")[0];
      const regel=`[${new Date().toLocaleString("nl-NL",{dateStyle:"short",timeStyle:"short"})}${wie?" – "+wie:""}] ${vraag.wat}: ${t}`;
      await saveProjectMeta(vraag.projectId,{...EMPTY_META,...(prev||{}),notities:oud?`${oud}\n${regel}`:regel});
      sluit();
    }catch{
      toast.error("De notitie kon niet worden opgeslagen. Probeer het opnieuw.");
    }finally{setBezig(false);}
  };
  return <div role="dialog" aria-label="Notitie bij werk" className="fixed z-50 bottom-4 right-4 left-4 sm:bottom-auto sm:top-4 sm:left-auto sm:w-96 bg-white rounded-lg border border-[rgba(15,23,42,0.08)] p-4"
    onKeyDown={e=>{if(e.key==="Escape")sluit();}}>
    <div className="flex items-start justify-between gap-3 mb-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#23272F]">Notitie bij dit werk?</p>
        <p className="text-xs text-[#5F6673] truncate">{p?`${p.werknummer} – ${p.projectnaam}`:"Werk"}</p>
        <p className="text-xs text-[#5F6673]">{vraag.wat}</p>
      </div>
      <button onClick={sluit} aria-label="Sluiten" className="p-1 rounded-md text-[#5F6673] hover:text-[#23272F]"><X className="w-4 h-4"/></button>
    </div>
    <textarea autoFocus value={tekst} onChange={e=>setTekst(e.target.value)} rows={3}
      onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();void opslaan();}}}
      placeholder="Bijv. waarom de planning is verschoven" aria-label="Notitie"
      className="w-full px-3 py-2 text-sm text-[#23272F] border border-[rgba(15,23,42,0.15)] outline-none focus:border-[#1E3A7B] resize-none"/>
    <div className="flex justify-end gap-2 mt-3">
      <button onClick={sluit} className="px-3 py-2 text-sm text-[#5F6673] hover:text-[#23272F]">Overslaan</button>
      <button onClick={()=>void opslaan()} disabled={bezig||!tekst.trim()} className="px-4 py-2 rounded-md bg-[#1E3A7B] text-white text-sm font-semibold disabled:opacity-50">Notitie opslaan</button>
    </div>
  </div>;
}

export function DubbeleWerkenMelding({aantal,onOpruimen}:{aantal:number;onOpruimen:()=>Promise<void>}){
  const [vraag,setVraag]=useState(false);
  const [bezig,setBezig]=useState(false);
  return <div className="flex items-center gap-3 flex-wrap rounded-md border border-[#F6DCA5] bg-[#FEF3DC] px-4 py-3">
    <AlertTriangle className="w-4 h-4 text-[#9A6100] flex-shrink-0"/>
    <p className="text-sm text-[#7A4A00] flex-1 min-w-0"><b>{aantal}</b> werk{aantal===1?" staat":"en staan"} dubbel in het systeem (zelfde werknummer, omschrijving, opdrachtgever en adres).</p>
    <Btn size="sm" variant="secondary" disabled={bezig} onClick={()=>setVraag(true)}>{bezig?"Bezig met opruimen…":"Dubbele werken opruimen"}</Btn>
    {vraag&&<ConfirmModal confirmLabel="Opruimen" confirmVariant="primary"
      message={`Per groep blijft één werk staan (het werk met de meeste planning). De planning van de dubbele werken verhuist naar dat werk en ${aantal} dubbele werk${aantal===1?"":"en"} word${aantal===1?"t":"en"} verwijderd. Werken met eigen documenten, taken, notities of facturatievinkjes blijven altijd staan. Doorgaan?`}
      onCancel={()=>setVraag(false)}
      onConfirm={async()=>{setVraag(false);setBezig(true);try{await onOpruimen();}finally{setBezig(false);}}}/>}
  </div>;
}

export function ProjectenView({projects,employees,onAdd,onEdit,onDelete,onOpen,onImport,onStatusChange,initialProjStatus=[],dubbelAantal=0,onDubbeleOpruimen}:{
  projects:Project[];employees:Employee[];
  onAdd:(prefill?:Partial<Project>)=>void;onEdit:(p:Project)=>void;onDelete:(id:string)=>void;onOpen:(p:Project)=>void;
  onImport:(rows:ImportRow[])=>void|Promise<void>;
  onStatusChange:(p:Project,s:ProjectStatus)=>Promise<void>;
  /** Startfilter op werkstatus, bijv. vanuit het Dashboard ("Actieve werken") */
  initialProjStatus?:string[];
  /** Aantal overbodige dubbele werken (zelfde werknummer, omschrijving, opdrachtgever en adres) */
  dubbelAantal?:number;onDubbeleOpruimen?:()=>Promise<void>;
}){
  const dc=useDC();
  const [filters,setFilters]=useState<ColFilters>(()=>({...EMPTY_FILTERS,projStatus:initialProjStatus}));
  const [del,setDel]=useState<string|null>(null);
  const [showImport,setShowImport]=useState(false);
  const [page,setPage]=useState(1);
  const set=(k:TextFilterKey)=>(v:string)=>{setPage(1);setFilters(prev=>({...prev,[k]:v}));};
  const setMulti=(k:MultiFilterKey)=>(v:string[])=>{setPage(1);setFilters(prev=>({...prev,[k]:v}));};
  const clearFilters=()=>{setPage(1);setFilters(EMPTY_FILTERS);};
  const activeCount=Object.values(filters).filter(v=>Array.isArray(v)?v.length>0:!!v).length;
  const [showMobileFilters,setShowMobileFilters]=useState(false);

  // Vaste filterkeuzes zoals in het Excel-bestand
  const statusOptions=useMemo(()=>["O","G","INT"],[]);
  const arOptions=useMemo(()=>["a","R"],[]);
  const typeOptions=useMemo(()=>[...new Set(projects.map(p=>typeLabel(p)).filter(Boolean))].sort(),[projects]);

  // Zoekbalk: zoekt in alle belangrijke velden tegelijk (alle zoekwoorden moeten voorkomen)
  const [zoek,setZoek]=useState("");
  const [regio,setRegio]=useState("");
  const regios=useMemo(()=>regioOpties(projects),[projects]);
  const filtered=useMemo(()=>{
    const inc=(v:string,q:string)=>v.toLowerCase().includes(q.toLowerCase());
    const woorden=zoek.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return projects.filter(p=>{
      if(woorden.length){
        const tekst=[p.werknummer,p.projectnaam,p.opdrachtgever,projStraat(p),projPlaatsObj(p),p.plaats,plName(p,employees),p.calculatiecode,p.opmerkingen,p.statusExcel,p.status].filter(Boolean).join(" ").toLowerCase();
        if(!woorden.every(w=>tekst.includes(w)))return false;
      }
      if(filters.werknummer&&!inc(p.werknummer,filters.werknummer))return false;
      if(filters.calculatiecode&&!inc(p.calculatiecode||"",filters.calculatiecode))return false;
      if(filters.opdrachtgever&&!inc(p.opdrachtgever,filters.opdrachtgever))return false;
      if(filters.straat&&!inc(projStraat(p),filters.straat))return false;
      if(filters.plaatsobject&&!inc(projPlaatsObj(p),filters.plaatsobject))return false;
      if(filters.opmerkingen&&!inc(projOpm(p),filters.opmerkingen))return false;
      if(filters.status.length&&!filters.status.includes(p.statusExcel||""))return false;
      if(filters.ar.length&&!filters.ar.includes(p.ar||""))return false;
      if(filters.projStatus.length&&!filters.projStatus.includes(p.status))return false;
      if(filters.type.length&&!filters.type.includes(typeLabel(p)))return false;
      if(regio&&regioVan(p)!==regio)return false;
      return true;
    });
  },[projects,filters,zoek,employees,regio]);

  // Paginering ná filteren, vóór het renderen van de rijen
  const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const curPage=Math.min(page,pageCount);
  const paged=useMemo(()=>filtered.slice((curPage-1)*PAGE_SIZE,curPage*PAGE_SIZE),[filtered,curPage]);
  const Pager=()=>filtered.length>PAGE_SIZE?<div className="flex items-center justify-between gap-3 py-2">
    <Btn variant="secondary" size="sm" onClick={()=>setPage(Math.max(1,curPage-1))} disabled={curPage<=1}>Vorige</Btn>
    <span className="text-xs text-[#5F6673]">Pagina {curPage} van {pageCount}</span>
    <Btn variant="secondary" size="sm" onClick={()=>setPage(Math.min(pageCount,curPage+1))} disabled={curPage>=pageCount}>Volgende</Btn>
  </div>:null;

  const uniquePlaatsen=useMemo(()=>[...new Set(projects.map(p=>p.plaats))].sort(),[projects]);


  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-[26px] md:text-[30px] leading-[32px] md:leading-[38px] font-semibold text-[#23272F]">Werken</h1>
        <p className="text-[#5F6673] text-xs md:text-sm">{filtered.length} van {projects.length} werken{activeCount>0&&<span> · <button onClick={()=>clearFilters()} className="text-[#1E3A7B] hover:underline font-medium">Filters wissen ({activeCount})</button></span>}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0 flex-wrap">
        <button onClick={()=>setShowMobileFilters(p=>!p)} className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-[10px] border border-[rgba(15,23,42,0.15)] text-[#5F6673] text-sm font-medium">
          <Filter className="w-3.5 h-3.5"/>{activeCount>0&&<span className="w-4 h-4 rounded-full bg-[#1E3A7B] text-white text-xs flex items-center justify-center">{activeCount}</span>}
        </button>
        <Btn variant="secondary" onClick={()=>setShowImport(true)} size="sm"><Table2 className="w-3.5 h-3.5"/>Excel importeren</Btn>
        <Btn onClick={()=>onAdd()}><Plus className="w-4 h-4"/><span className="hidden sm:inline">Nieuw werk</span></Btn>
      </div>
    </div>
    {dubbelAantal>0&&onDubbeleOpruimen&&<DubbeleWerkenMelding aantal={dubbelAantal} onOpruimen={onDubbeleOpruimen}/>}
    <div className="relative">
      <Search className="w-4 h-4 text-[#5F6673] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
      <input value={zoek} onChange={e=>{setZoek(e.target.value);setPage(1);}} placeholder="Zoek op werknummer, naam, opdrachtgever, adres, plaats, projectleider…"
        className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-[rgba(15,23,42,0.12)] rounded-md text-[#23272F] focus:outline-none focus:ring-2 focus:ring-[#1E3A7B]/40"/>
      {zoek&&<button onClick={()=>{setZoek("");setPage(1);}} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5F6673] hover:text-[#23272F]" title="Zoekopdracht wissen"><X className="w-4 h-4"/></button>}
    </div>
    {regios.length>0&&<div className="flex items-center gap-2"><RegioFilter value={regio} onChange={v=>{setRegio(v);setPage(1);}} opties={regios}/>{regio&&<button onClick={()=>setRegio("")} className="text-xs text-[#1E3A7B] font-semibold">Wis</button>}</div>}
    {showMobileFilters&&<div className="md:hidden bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[#23272F]">Filteren</span>
        {activeCount>0&&<button onClick={()=>clearFilters()} className="text-xs text-[#1E3A7B]">Alles wissen</button>}
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div><label className="text-xs text-[#5F6673] mb-1 block">Status</label><ColMulti values={filters.status} onChange={setMulti("status")} options={statusOptions}/></div>
        <div><label className="text-xs text-[#5F6673] mb-1 block">Werkstatus</label><ColMulti values={filters.projStatus} onChange={setMulti("projStatus")} options={STATS}/></div>
        <div><label className="text-xs text-[#5F6673] mb-1 block">A/R</label><ColMulti values={filters.ar} onChange={setMulti("ar")} options={arOptions}/></div>
        <div><label className="text-xs text-[#5F6673] mb-1 block">Type</label><ColMulti values={filters.type} onChange={setMulti("type")} options={typeOptions}/></div>
      </div>
      <ColSearch value={filters.werknummer} onChange={set("werknummer")} placeholder="Zoek werknr..."/>
      <ColSearch value={filters.calculatiecode} onChange={set("calculatiecode")} placeholder="Zoek calculatiecode..."/>
      <ColSearch value={filters.opdrachtgever} onChange={set("opdrachtgever")} placeholder="Zoek opdrachtgever..."/>
      <ColSearch value={filters.straat} onChange={set("straat")} placeholder="Zoek straat object..."/>
      <ColSearch value={filters.plaatsobject} onChange={set("plaatsobject")} placeholder="Zoek plaats object..."/>
      <ColSearch value={filters.opmerkingen} onChange={set("opmerkingen")} placeholder="Zoek opmerkingen..."/>
    </div>}
    {/* Mobile card view */}
    <div className="md:hidden space-y-3">
      {paged.map(p=>{const pl=plName(p,employees);const afds=getAllAfds(p);return<div key={p.id} className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(15,23,42,0.06)]" style={{borderLeftColor:dc[afds[0]].bg,borderLeftWidth:4}}>
          <span className="tabular-nums text-xs text-[#5F6673] flex-shrink-0">{p.werknummer}</span>
          <span className="font-semibold text-[#23272F] flex-1 truncate">{p.projectnaam}</span>
          <StatusCell project={p} onStatusChange={onStatusChange}/>
          <span className="text-sm font-medium text-[#23272F]">{p.statusExcel||"-"}</span>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm text-[#5F6673]"><Building2 className="w-3.5 h-3.5 flex-shrink-0"/>{p.opdrachtgever}</div>
          <div className="flex items-center gap-1.5 text-sm text-[#5F6673]"><MapPin className="w-3.5 h-3.5 flex-shrink-0"/>{p.plaats}</div>
          {pl&&<div className="flex items-center gap-1.5 text-sm text-[#5F6673]"><UserCircle className="w-3.5 h-3.5 flex-shrink-0"/>{pl}</div>}
          <div className="flex items-center gap-1.5 text-xs text-[#5F6673]"><Calendar className="w-3 h-3 flex-shrink-0"/>{fmtDate(p.startdatum)} – {fmtDate(p.afloopdatum)}</div>
          <div className="pt-1"><DeptBadges afds={afds}/></div>
        </div>
        <div className="flex border-t border-[rgba(15,23,42,0.06)]">
          <button onClick={()=>onOpen(p)} className="flex-1 py-2.5 text-xs font-semibold text-[#1E3A7B] hover:bg-[#EEF1F5] transition-colors">Openen</button>
          <div className="w-px bg-[rgba(15,23,42,0.06)]"/>
          <button onClick={()=>onEdit(p)} className="flex-1 py-2.5 text-xs font-medium text-[#5F6673] hover:bg-[#F2F4F7] transition-colors">Bewerken</button>
          <div className="w-px bg-[rgba(15,23,42,0.06)]"/>
          <button onClick={()=>setDel(p.id)} className="flex-1 py-2.5 text-xs font-medium text-[#C2604D] hover:bg-[#F5E1DC] transition-colors">Verwijderen</button>
        </div>
      </div>;})}
      {filtered.length===0&&<p className="text-center text-[#5F6673] text-sm py-12">Geen projecten gevonden</p>}
      <Pager/>
    </div>
    {/* Desktop table view */}
    <div className="hidden md:block bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-auto mm-tabel">
      <table className="w-full text-sm" style={{minWidth:"1100px"}}>
        <thead className="bg-[#F2F4F7]">
          <tr>
            <ColHeader label="S" active={filters.status.length>0}><ColMulti values={filters.status} onChange={setMulti("status")} options={statusOptions}/></ColHeader>
            <ColHeader label="Status" active={filters.projStatus.length>0}><ColMulti values={filters.projStatus} onChange={setMulti("projStatus")} options={STATS}/></ColHeader>
            <ColHeader label="A/R" active={filters.ar.length>0}><ColMulti values={filters.ar} onChange={setMulti("ar")} options={arOptions}/></ColHeader>
            <ColHeader label="Type" active={filters.type.length>0}><ColMulti values={filters.type} onChange={setMulti("type")} options={typeOptions}/></ColHeader>
            <ColHeader label="Werknr." active={!!filters.werknummer}><ColSearch value={filters.werknummer} onChange={set("werknummer")} placeholder="Zoek werknr..."/></ColHeader>
            <ColHeader label="Calculatie.Code" active={!!filters.calculatiecode}><ColSearch value={filters.calculatiecode} onChange={set("calculatiecode")} placeholder="Zoek calculatiecode..."/></ColHeader>
            <ColHeader label="Projectl." active={false}><span className="text-xs text-[#5F6673]">Geen filter</span></ColHeader>
            <ColHeader label="Vestiging.Omschrijving" active={false}><span className="text-xs text-[#5F6673]">Geen filter</span></ColHeader>
            <ColHeader label="Naam opdrachtgever" active={!!filters.opdrachtgever}><ColSearch value={filters.opdrachtgever} onChange={set("opdrachtgever")} placeholder="Zoek opdrachtgever..."/></ColHeader>
            <ColHeader label="Straat object" active={!!filters.straat}><ColSearch value={filters.straat} onChange={set("straat")} placeholder="Zoek straat..."/></ColHeader>
            <ColHeader label="Plaats object" active={!!filters.plaatsobject}><ColSearch value={filters.plaatsobject} onChange={set("plaatsobject")} placeholder="Zoek plaats..."/></ColHeader>
            <ColHeader label="Opmerkingen" active={!!filters.opmerkingen}><ColSearch value={filters.opmerkingen} onChange={set("opmerkingen")} placeholder="Zoek opmerkingen..."/></ColHeader>
            <th className="px-3 py-3"/>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(15,23,42,0.05)]">
          {paged.map(p=>{
            const afds=getAllAfds(p);
            return <tr key={p.id} onClick={()=>onOpen(p)} className="hover:bg-[#F8F9FB] cursor-pointer transition-colors">
              <td className="px-3 py-3 text-[#23272F] font-medium">{p.statusExcel||"-"}</td>
              <td className="px-3 py-3 whitespace-nowrap"><StatusCell project={p} onStatusChange={onStatusChange}/></td>
              <td className="px-3 py-3 text-[#5F6673]">{p.ar||"-"}</td>
              <td className="px-3 py-3 text-[#5F6673] whitespace-nowrap">{typeLabel(p)||"-"}</td>
              <td className="px-3 py-3 tabular-nums text-xs text-[#5F6673]">
                <div className="flex items-center gap-2">
                  {afds.length===1
                    ?<div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:dc[afds[0]].bg}}/>
                    :<div className="w-3 h-3 rounded-full flex-shrink-0 overflow-hidden" style={projStyle(p,dc)}/>}
                  <span>{p.werknummer}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-[#5F6673]">{p.calculatiecode||"-"}</td>
              <td className="px-3 py-3 text-[#5F6673]">{plName(p,employees)||"-"}</td>
              <td className="px-3 py-3 text-[#23272F] max-w-56 truncate" title={p.projectnaam}>{p.projectnaam||"-"}</td>
              <td className="px-3 py-3 text-[#23272F]">{p.opdrachtgever||"-"}</td>
              <td className="px-3 py-3 text-[#5F6673]">{projStraat(p)||"-"}</td>
              <td className="px-3 py-3 text-[#5F6673]">{projPlaatsObj(p)||"-"}</td>
              <td className="px-3 py-3 text-[#5F6673] max-w-48 truncate" title={projOpm(p)}>{projOpm(p)||"-"}</td>
              <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                <div className="flex gap-1">
                  <button onClick={()=>onEdit(p)} className="p-1.5 rounded hover:bg-[#F2F4F7] text-[#5F6673] hover:text-[#23272F]"><Pencil className="w-3.5 h-3.5"/></button>
                  <button onClick={()=>setDel(p.id)} className="p-1.5 rounded hover:bg-[#F5E1DC] text-[#5F6673] hover:text-[#C2604D]"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
      {filtered.length===0&&<p className="text-center text-[#5F6673] text-sm py-12">Geen projecten gevonden</p>}
      <Pager/>
    </div>
    {del&&<ConfirmModal message="Weet je zeker dat je dit werk wilt verwijderen? Dit kan niet ongedaan worden gemaakt." onConfirm={()=>{onDelete(del);setDel(null);}} onCancel={()=>setDel(null)}/>}
    {showImport&&<ExcelImportModal projects={projects} employees={employees} onImport={async rows=>{await onImport(rows);setShowImport(false);}} onClose={()=>setShowImport(false)}/>}
  </div>;
}

