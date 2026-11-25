// Onderdeel van de planning-app (uit planning-app.tsx gehaald om het overzichtelijk te houden).
import { useState, useRef, useEffect, useMemo, Suspense } from "react";
import { Plus, Pencil, Trash2, X, FileText, Check, Upload, Star, Clock, FileDown } from "lucide-react";
import { GeschiedenisLijst } from "@/components/geschiedenis-view";
import { WeerStrook } from "@/components/weer-advies";
import { werkbonVoorWerk } from "@/lib/werkplan-gegevens";
import WerkplanVenster, { type WerkplanAanpassingen } from "@/components/werkplan-venster";
import { toast } from "sonner";
import { loadProjectMeta, saveProjectMeta, EMPTY_META } from "@/lib/store";
import { toDateStr } from "@/lib/werkdagen";
import { useAuth } from "@/components/auth-gate";
import maasmondLogo from "@/assets/maasmond-logo.jpg";
import { FacturatieTermijnen } from "@/components/facturatie-termijnen";
import { listTaken, listTakenForProjects } from "@/lib/store";
import { openGanttPrint, type GanttProject } from "@/lib/gantt-print";
import { TakenTab, Afdeling, ProjectStatus, Project, Employee, AvailEntry, WORKDAY_START, useDC, AFDS, STATS, TODAY_STR, validDate, fmtDate, fmtTime, datePart, timePart, combineLocalDT, nid, nextWN, plName, getAllAfds, werkIdsVan, werkEmpIds, benodigd, planStatusOf, PLAN_STATUS_LABEL, werkAfdKleur, getProjectAssignedEmployees, badgeStyle, DeptBadge, DeptBadges, StatusBadge, Btn, Input, werkPlaats, Select, Textarea, Modal, ConfirmModal } from "./basis";
import { magGeschiedenis } from "./schermen";
import { PlanEmployeeModal } from "./personeelsplanning";

// ===== PROJECT FORM =====
export function ProjectForm({initial,employees,projects,availability,onSave,onCancel}:{
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
    projectleider:initial.projectleider||"",
    startdatum:initial.startdatum||combineLocalDT(toDateStr(new Date()),WORKDAY_START,7,0),
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
  const [sTime,setSTime]=useState(()=>timePart(f.startdatum)||WORKDAY_START);
  const [eDate,setEDate]=useState(()=>datePart(f.afloopdatum));
  const [eTime,setETime]=useState(()=>timePart(f.afloopdatum)||"17:00");
  const applyDates=(sd:string,st:string,ed:string,et:string)=>{
    const startISO=combineLocalDT(sd,st,7,0);
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

  // Medewerkers die al planningregels op dit werk hebben, blijven gekozen; verwijderen gaat via Personeelsplanning.
  const plannedIds=useMemo(()=>new Set(werkEmpIds(availability,f)),[availability,f.id,f.werknummer]);
  const toggleMed=(id:string)=>{if(plannedIds.has(id))return;setF(prev=>({...prev,medewerkers:prev.medewerkers.includes(id)?prev.medewerkers.filter(x=>x!==id):[...prev.medewerkers,id]}));};
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
        <label className="block text-xs font-semibold text-[#5F6673] mb-1">Afdeling(en)<span className="text-[#C2604D] ml-0.5">*</span></label>
        <div className="flex gap-2 flex-wrap">
          {AFDS.map(a=><button key={a} type="button" onClick={()=>toggleAfdeling(a)} className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold border transition-all ${curAfds.includes(a)?"text-white border-transparent":"border-[rgba(15,23,42,0.15)] text-[#5F6673] hover:border-[#5F6673]"}`} style={curAfds.includes(a)?{backgroundColor:dc[a].bg}:{}}>{curAfds.includes(a)&&<Check className="w-3 h-3 inline mr-1"/>}{a}</button>)}
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
    <Textarea label="Opmerkingen" value={f.opmerkingen||""} onChange={v=>set("opmerkingen",v)} rows={3} placeholder="Opmerkingen bij dit werk..."/>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Input label="Benodigde medewerkers" value={String(f.benodigdeMedewerkers??1)} onChange={v=>set("benodigdeMedewerkers",Math.max(1,parseInt(v)||1))} type="number"/>
    </div>
    <div className="border border-[rgba(15,23,42,0.1)] rounded-md overflow-hidden">
      <div className="bg-[#F2F4F7] px-4 py-2.5 border-b border-[rgba(15,23,42,0.1)]">
        <span className="text-xs font-semibold text-[#5F6673]">Medewerkers toewijzen</span>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold text-[#5F6673] mb-2">1. Afdeling</p>
          <div className="flex gap-2">
            {AFDS.map(a=><button key={a} type="button" onClick={()=>handleAssignAfdChange(a)} className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold border transition-all ${assignAfd===a?"text-white border-transparent":"border-[rgba(15,23,42,0.15)] text-[#5F6673] hover:border-[#5F6673]"}`} style={assignAfd===a?{backgroundColor:dc[a].bg}:{}}>{a}</button>)}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-[#5F6673] mb-2">2. Competenties <span className="normal-case font-normal text-[#9AA1AD]">(optioneel)</span></p>
          {afdComps.length===0?<p className="text-xs text-[#9AA1AD]">Geen competenties gevonden.</p>
          :<div className="flex flex-wrap gap-1.5">
            {afdComps.map(c=>{const sel=assignComps.includes(c);return<button key={c} type="button" onClick={()=>setAssignComps(prev=>sel?prev.filter(x=>x!==c):[...prev,c])} className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${sel?"bg-[#1E3A7B] text-white border-[#1E3A7B]":"border-[rgba(15,23,42,0.15)] text-[#5F6673] hover:border-[#1E3A7B]"}`}>{sel&&<Check className="w-2.5 h-2.5 inline mr-0.5"/>}{c}</button>;})}
          </div>}
        </div>
        <div className="bg-[#F2F4F7] rounded-[10px] px-3 py-2 flex items-center gap-2 text-xs">
          <Clock className="w-3.5 h-3.5 text-[#5F6673] flex-shrink-0"/>
          <span className="font-semibold text-[#23272F]">3. Periode:&nbsp;</span>
          <span className="text-[#5F6673]">{fmtDate(f.startdatum)} {fmtTime(f.startdatum)} – {fmtDate(f.afloopdatum)} {fmtTime(f.afloopdatum)}</span>
        </div>
        <div>
          <p className="text-xs font-semibold text-[#5F6673] mb-2">4. Beschikbare medewerkers</p>
          {availableEmps.length===0
            ?<p className="text-xs text-[#5F6673] italic py-1">Geen beschikbare medewerkers gevonden voor deze afdeling, competenties en periode.</p>
            :<div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {availableEmps.map(({emp,av:av0})=>{const isPlanned=plannedIds.has(emp.id);const sel=isPlanned||f.medewerkers.includes(emp.id);const av=isPlanned?{ok:true,reason:undefined}:av0;return<button key={emp.id} type="button" onClick={()=>{if(av.ok||sel)toggleMed(emp.id);}} className={`w-full flex items-center gap-3 p-2.5 rounded-[10px] border text-left transition-all ${sel?"border-[#1E3A7B] bg-[#EEF1F5]":av.ok?"border-[rgba(15,23,42,0.1)] hover:border-[#1E3A7B] bg-white":"border-[rgba(15,23,42,0.08)] bg-[#F8F9FB] opacity-60"}`}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[emp.afdeling].bg}}>{emp.naam.slice(0,1)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5"><p className="font-semibold text-[#23272F] text-xs">{emp.naam}</p>{sel&&<Check className="w-3 h-3 text-[#1E3A7B] flex-shrink-0"/>}</div>
                  <p className="text-[10px] text-[#5F6673] truncate">{emp.functie} · {emp.competenties.join(", ")}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 ${av.ok?"bg-[#E4EFE6] text-[#16774A]":"bg-[#F3DEDA] text-[#7F2F26]"}`}>{isPlanned?"Ingepland":sel?"Wordt ingepland":av.ok?"Beschikbaar":av.reason}</span>
              </button>;})}
            </div>
          }
        </div>
      </div>
    </div>
    <Textarea label="Notities" value={f.notities} onChange={v=>set("notities",v)} rows={2} placeholder="Interne notities..."/>
    <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(15,23,42,0.08)]">
      <Btn variant="secondary" onClick={onCancel}>Annuleren</Btn>
      <Btn onClick={()=>{if(valid)onSave(f);}} disabled={!valid}>{isEdit?"Opslaan":"Werk aanmaken"}</Btn>
    </div>
  </div>;
}

// ===== PROJECT DETAIL =====
/** Printbare Gantt-planning met alle werken van dezelfde opdrachtgever. */
export async function printKlantPlanning(project:Project,allProjects:Project[],employees:Employee[]){
  const klant=(project.opdrachtgever||"").trim();
  const werken=(klant?allProjects.filter(p=>(p.opdrachtgever||"").trim().toLowerCase()===klant.toLowerCase()):[project]);
  const lijst=werken.length?werken:[project];
  try{
    const takenMap=await listTakenForProjects(lijst.map(p=>p.id));
    const projecten:GanttProject[]=lijst.map(p=>({
      id:p.id,werknummer:p.werknummer||"",projectnaam:p.projectnaam||"",
      omschrijving:p.opmerkingen||p.projectnaam||"",adres:p.adres||"",plaats:p.plaats||"",
      projectleider:plName(p,employees)||"",taken:takenMap.get(p.id)||[],
    }));
    if(!projecten.some(p=>p.taken.length)){toast.error("Er zijn nog geen taken voor deze opdrachtgever");return;}
    const ok=openGanttPrint({
      opdrachtgever:klant||project.projectnaam||"Opdrachtgever",
      projectleider:plName(project,employees)||"",
      logoUrl:maasmondLogo,systeemnaam:"Maasmond Planning",projecten,
    });
    if(!ok)toast.error("Sta pop-ups toe om de planning te openen");
  }catch{
    toast.error("Planning maken is niet gelukt");
  }
}

export type ProjTab="overzicht"|"opmerkingen"|"taken"|"planning"|"medewerkers"|"documenten"|"facturatie"|"notities"|"geschiedenis";
export function ProjectDetail({project,employees,allProjects=[],availability=[],teamColors={},badgeColors={},projectColors={},onEdit,onDelete,onClose,onAddEmployees,onSaveWerkplan}:{
  project:Project;employees:Employee[];allProjects?:Project[];availability?:AvailEntry[];teamColors?:Record<string,string>;badgeColors?:Record<string,string>;projectColors?:Record<string,string>;
  onEdit:()=>void;onDelete:(id:string)=>void;onClose:()=>void;onAddEmployees?:(rows:AvailEntry[])=>Promise<boolean>;
  onSaveWerkplan?:(aanp:WerkplanAanpassingen)=>Promise<void>;
}){
  const dc=useDC();
  const [addOpen,setAddOpen]=useState(false);
  const [addKey,setAddKey]=useState(0);
  // Medewerkers van de afdeling(en) van dit werk bovenaan, daarna de rest op naam.
  const addEmployees=useMemo(()=>{
    const afds=getAllAfds(project);
    return [...employees].sort((a,b)=>{
      const pa=afds.includes(a.afdeling)?0:1,pb=afds.includes(b.afdeling)?0:1;
      return pa-pb||a.naam.localeCompare(b.naam,"nl");
    });
  },[employees,project]);
  const pStart=datePart(project.startdatum||"");const pEnd=datePart(project.afloopdatum||"");
  const addDate=pStart||new Date().toISOString().slice(0,10);
  const addStRaw=timePart(project.startdatum||"")||WORKDAY_START;
  const addEtRaw=timePart(project.afloopdatum||"")||"17:00";
  const timesOk=addStRaw<addEtRaw;
  const addSt=timesOk?addStRaw:WORKDAY_START;
  const addEt=timesOk?addEtRaw:"17:00";
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
  // Opslaan na 1,5 s zonder typen (niet bij elke toetsaanslag); bij sluiten direct opslaan wat nog openstaat.
  const metaOpslaan=useRef<(()=>void)|null>(null);
  useEffect(()=>{
    if(!metaLoaded)return;
    const sla=()=>{metaOpslaan.current=null;void loadProjectMeta(project.id).then(prev=>{
      const p={...EMPTY_META,...(prev||{})};
      if(p.notities===notities&&JSON.stringify(p.docs)===JSON.stringify(docs))return;
      return saveProjectMeta(project.id,{...p,docs,notities});
    }).catch(()=>{});};
    metaOpslaan.current=sla;
    const t=setTimeout(sla,1500);
    return()=>clearTimeout(t);
  },[docs,notities,metaLoaded,project.id]);
  useEffect(()=>()=>{metaOpslaan.current?.();},[]);

  const [pdfBezig,setPdfBezig]=useState(false);
  // Dag-voor-dag agenda van dit ene werk als echte PDF (download, geen printvenster).
  // Werkplan (werkbon schilder) van dit werk als pdf
  // Werkplan (werkbon schilder): automatisch ingevuld, te bewerken, te downloaden en te mailen
  const [werkplanOpen,setWerkplanOpen]=useState(false);
  const {user:wpGebruiker}=useAuth();
  const werkplanBasis=useMemo(()=>{
    const info=()=>({werk:project.projectnaam,werknummer:project.werknummer,opdrachtgever:project.opdrachtgever,adres:[project.straatObject||project.adres,project.plaatsObject||project.plaats].filter(Boolean).join(", "),projectleider:plName(project,employees),opmerking:project.opmerkingen||"",startdatum:validDate(project.startdatum)?datePart(project.startdatum):"",opleverdatum:validDate(project.afloopdatum)?datePart(project.afloopdatum):"",omschrijving:[project.projectnaam,getAllAfds(project).join(", ")].filter(Boolean).join(" – ")});
    return werkbonVoorWerk(project.id,availability,id=>employees.find(e=>e.id===id)?.naam||"",info,String(wpGebruiker?.user_metadata?.full_name||wpGebruiker?.email?.split("@")[0]||""));
  },[project,availability,employees,wpGebruiker]);
  const werkplanIngepland=useMemo(()=>{
    const per=new Map<string,AvailEntry[]>();
    availability.filter(a=>a.projectId===project.id&&a.status==="Ingepland").forEach(a=>per.set(a.employeeId,[...(per.get(a.employeeId)||[]),a]));
    return [...per.entries()].map(([id,rows])=>{
      const e=employees.find(x=>x.id===id);
      const komend=rows.filter(a=>a.date>=TODAY_STR);
      const dagen=(komend.length?komend:rows).sort((a,b)=>a.date.localeCompare(b.date)).map(a=>({datum:a.date,start:a.startTime,eind:a.endTime}));
      return {id,naam:e?.naam||"Medewerker",email:e?.email||"",afdeling:e?.afdeling,dagen};
    }).sort((a,b)=>a.naam.localeCompare(b.naam,"nl"));
  },[availability,project.id,employees]);
  const exportPlanningPdf=async()=>{
    if(pdfBezig)return;
    setPdfBezig(true);
    try{
      const taken=await listTaken(project.id);
      const pdfWerk={werknummer:project.werknummer||"",projectnaam:project.projectnaam||"",
        opdrachtgever:project.opdrachtgever||"",adres:project.adres||"",plaats:project.plaats||""};
      const pdf=await import("@/lib/taken-pdf");
      if(taken.some(t=>!!t.start)){pdf.generateProjectPlanningPdf({project:pdfWerk,taken});return;}
      // Geen taken: de planning uit de ingeplande medewerkers halen (wie werkt wanneer)
      const ids=new Set(werkIdsVan(project));
      const regels=availability.filter(a=>a.status==="Ingepland"&&a.projectId&&ids.has(a.projectId)).map(a=>{
        const e=employees.find(x=>x.id===a.employeeId);
        return {datum:a.date,naam:e?.naam||"Onbekende medewerker",tijd:`${a.startTime}–${a.endTime}`,kleur:e?dc[e.afdeling].bg:"#1E3A7B"};
      });
      if(!regels.length){toast.error("Er is nog geen planning of taak voor dit werk om te exporteren.");return;}
      pdf.generatePersoneelsPlanningPdf({project:pdfWerk,regels});
    }catch{
      toast.error("De planning kon niet als PDF worden gegenereerd. Probeer het opnieuw.");
    }finally{
      setPdfBezig(false);
    }
  };

  const plNaam=plName(project,employees);
  // Ingeplande medewerkers komen altijd uit de planningregels (availability), nooit uit het projectrecord
  // Ook planning op werken met hetzelfde werknummer telt mee (alleen tonen, niets wordt aangepast)
  const assigned=getProjectAssignedEmployees(werkIdsVan(project),availability,employees);
  // Uurprijs en geschatte uren worden bewust niet meer getoond (data blijft in de database)
  const dur=validDate(project.startdatum)&&validDate(project.afloopdatum)?Math.ceil((new Date(project.afloopdatum).getTime()-new Date(project.startdatum).getTime())/86400000):0;
  const {roles}=useAuth();
  const tabs:ProjTab[]=["overzicht","opmerkingen","taken","planning","medewerkers","documenten","facturatie","notities",...(magGeschiedenis(roles)?["geschiedenis" as ProjTab]:[])];
  const tabLabels:Record<ProjTab,string>={overzicht:"Overzicht",opmerkingen:"Opmerkingen",taken:"Taken",planning:"Planning",medewerkers:"Medewerkers",documenten:"Documenten",facturatie:"Facturatie",notities:"Notities",geschiedenis:"Geschiedenis"};
  const afds=getAllAfds(project);
  const primaryDc=dc[afds[0]];
  return <Modal title={project.projectnaam} onClose={onClose} width="max-w-3xl">
    <div className="border-b border-[rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-0.5 px-3 md:px-6 pt-2 overflow-x-auto">
        {tabs.map(t=><button key={t} onClick={()=>setTab(t)} className={`px-2.5 md:px-3 py-2 text-xs md:text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${tab===t?"text-[#23272F] border-b-2 border-[#1E3A7B]":"text-[#5F6673] hover:text-[#23272F]"}`}>{tabLabels[t]}</button>)}
      </div>
    </div>
    <div className="p-4 md:p-6">
      {tab==="overzicht"&&<div className="space-y-4">
        <div className="flex flex-col gap-3">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2 mb-1 flex-wrap"><DeptBadges afds={afds}/><StatusBadge status={project.status}/></div>
            <p className="text-xl md:text-2xl font-bold text-[#23272F]">{project.projectnaam}</p>
            <p className="text-[#5F6673] text-sm">{project.werknummer}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {werkplanOpen&&<WerkplanVenster projectId={project.id} titel={[project.werknummer,project.projectnaam].filter(Boolean).join(" – ")} basis={werkplanBasis} opgeslagen={project.werkplan as WerkplanAanpassingen|undefined}
              ingepland={werkplanIngepland} projectleider={plName(project,employees)} onSluit={()=>setWerkplanOpen(false)}
              onOpslaan={async a=>{if(!onSaveWerkplan)throw new Error("Opslaan is hier niet mogelijk.");await onSaveWerkplan(a);}}/>}
            {onAddEmployees&&<Btn size="sm" onClick={()=>{setAddKey(k=>k+1);setAddOpen(true);}}><Plus className="w-3.5 h-3.5"/><span className="hidden sm:inline">Medewerker toevoegen</span></Btn>}
            <Btn size="sm" variant="secondary" onClick={()=>setWerkplanOpen(true)}><FileDown className="w-3.5 h-3.5"/>Werkplan</Btn>
            <Btn size="sm" variant="secondary" onClick={onEdit}><Pencil className="w-3.5 h-3.5"/><span className="hidden sm:inline">Bewerken</span></Btn>
            <Btn size="sm" variant="secondary" onClick={()=>void printKlantPlanning(project,allProjects,employees)}><FileDown className="w-3.5 h-3.5"/><span className="hidden sm:inline">Planning opdrachtgever</span></Btn>
            <Btn size="sm" variant="danger" onClick={()=>setConfirmDel(true)}><Trash2 className="w-3.5 h-3.5"/><span className="hidden sm:inline">Verwijderen</span></Btn>
          </div>
        </div>
        {werkPlaats(project)&&<div className="rounded-md border border-[rgba(15,23,42,0.08)] p-3 space-y-2">
          <p className="text-xs text-[#5F6673]">Weer in {werkPlaats(project)} (plaats van het werk)</p>
          <WeerStrook plaats={werkPlaats(project)}/>
        </div>}
        <div className="grid grid-cols-2 gap-2 md:gap-3">
          {[["Opdrachtgever",project.opdrachtgever],["Adres",project.adres||project.plaats],["Startdatum",fmtDate(project.startdatum)+" "+fmtTime(project.startdatum)],["Afloopdatum",fmtDate(project.afloopdatum)+" "+fmtTime(project.afloopdatum)],["Duur",`${dur} dag${dur!==1?"en":""}`],["Benodigde medewerkers",`${project.benodigdeMedewerkers??1}`]].map(([k,v])=>
            <div key={k} className="bg-[#F2F4F7] rounded-md p-3">
              <p className="text-xs text-[#5F6673] mb-0.5">{k}</p>
              <p className="font-semibold text-[#23272F] text-sm">{v}</p>
            </div>
          )}
        </div>
        {plNaam&&<div className="flex items-center gap-3 p-3 bg-[#EEF1F5] rounded-md">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{backgroundColor:primaryDc.bg}}>{plNaam.slice(0,1)}</div>
          <div><p className="font-semibold text-[#23272F] text-sm">{plNaam}</p><p className="text-xs text-[#5F6673]">Calculator</p></div>
        </div>}
      </div>}
      {tab==="taken"&&<Suspense fallback={<p className="text-sm text-[#5F6673]">Taken laden…</p>}>
        <TakenTab projectId={project.id}/>
      </Suspense>}
      {tab==="opmerkingen"&&<div>
        <p className="text-xs font-semibold text-[#5F6673] mb-2">Opmerkingen</p>
        <p className="text-[#23272F] leading-relaxed whitespace-pre-wrap">{project.opmerkingen||"Geen opmerkingen."}</p>
      </div>}
      {tab==="planning"&&<div className="space-y-4">
        <div className="flex justify-end">
          <Btn size="sm" variant="secondary" disabled={pdfBezig} onClick={()=>void exportPlanningPdf()}>
            <FileDown className="w-3.5 h-3.5"/>{pdfBezig?"PDF wordt gegenereerd...":"Exporteer planning als PDF"}
          </Btn>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 border border-[rgba(15,23,42,0.1)] rounded-md">
            <p className="text-xs text-[#5F6673] mb-1">Startdatum</p>
            <p className="font-semibold text-[#23272F]">{fmtDate(project.startdatum)}</p>
            <p className="text-sm text-[#5F6673]">{fmtTime(project.startdatum)}</p>
          </div>
          <div className="p-4 border border-[rgba(15,23,42,0.1)] rounded-md">
            <p className="text-xs text-[#5F6673] mb-1">Afloopdatum</p>
            <p className="font-semibold text-[#23272F]">{fmtDate(project.afloopdatum)}</p>
            <p className="text-sm text-[#5F6673]">{fmtTime(project.afloopdatum)}</p>
          </div>
        </div>
        <div className="p-4 bg-[#F2F4F7] rounded-md">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-[#5F6673]">Voortgang</span>
            <span className="font-semibold text-[#23272F]">{project.status}</span>
          </div>
          <div className="h-2 bg-white rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{width:project.status==="Afgerond"||project.status==="Gefactureerd"?"100%":project.status==="In uitvoering"?"60%":project.status==="Bevestigd"?"30%":"10%",backgroundColor:primaryDc.bg}}/>
          </div>
        </div>
      </div>}
      {addOpen&&onAddEmployees&&<PlanEmployeeModal key={addKey} employees={addEmployees} availability={availability} multiEmployeeSelect
        empId="" date={addDate} endDate={pEnd&&pEnd>=addDate?pEnd:addDate} minDate={pStart||undefined} maxDate={pEnd||undefined}
        startTime={addSt} endTime={addEt} projectId={project.id}
        onSave={async rows=>{const ok=await onAddEmployees(rows);if(ok){setAddOpen(false);setTab("medewerkers");}}}
        onClose={()=>setAddOpen(false)}/>}
      {tab==="medewerkers"&&<div className="space-y-3">
        {onAddEmployees&&<div className="flex justify-end"><Btn size="sm" onClick={()=>{setAddKey(k=>k+1);setAddOpen(true);}}><Plus className="w-4 h-4"/>Medewerker toevoegen</Btn></div>}
        <div className="flex items-center gap-2">
          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold" style={badgeStyle(planStatusOf(project,availability),badgeColors)}>{PLAN_STATUS_LABEL[planStatusOf(project,availability)]}</span>
          <span className="text-xs text-[#5F6673]">{assigned.length} van {benodigd(project)} benodigde medewerkers ingepland</span>
        </div>
        {assigned.length===0&&<p className="text-[#5F6673] text-sm">Nog geen medewerkers ingepland.</p>}
        {assigned.map(({employee:e,rows})=>{
          const kleur=werkAfdKleur(project,dc);
          return<div key={e.id} className="flex items-start gap-3 p-3 border border-[rgba(15,23,42,0.08)] rounded-md" style={{borderLeftColor:kleur,borderLeftWidth:4}}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#23272F] text-sm">{e.naam}</p>
              <p className="text-xs text-[#5F6673]">{e.functie}</p>
              {rows.length>0&&<div className="mt-1 space-y-0.5">
                {rows.map(r=><p key={r.id} className="text-xs text-[#5F6673] tabular-nums flex items-center gap-1">{fmtDate(r.date)} · {r.startTime}–{r.endTime}{r.isFirstOfDay&&<Star className="w-3 h-3 text-[#D08A4E]" fill="currentColor" aria-label="Als eerste uitvoeren"/>}</p>)}
              </div>}
            </div>
            <DeptBadge afd={e.afdeling}/>
          </div>;
        })}
      </div>}
      {tab==="documenten"&&<div>
        <div className="border-2 border-dashed border-[rgba(15,23,42,0.15)] rounded-md p-8 text-center mb-4 hover:border-[#1E3A7B] transition-colors cursor-pointer" onClick={()=>fileRef.current?.click()}>
          <Upload className="w-8 h-8 text-[#5F6673] mx-auto mb-2"/>
          <p className="text-sm text-[#5F6673]">Klik om bestanden te uploaden</p>
          <p className="text-xs text-[#9AA1AD] mt-1">PDF, Word, Excel, afbeeldingen</p>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e=>{if(e.target.files)setDocs(prev=>[...prev,...Array.from(e.target.files!).map(f=>f.name)]);}}/>
        </div>
        {docs.map((d,i)=><div key={i} className="flex items-center gap-3 p-2.5 border border-[rgba(15,23,42,0.08)] rounded-[10px] mb-2">
          <FileText className="w-4 h-4 text-[#1E3A7B]"/>
          <span className="flex-1 text-sm text-[#23272F]">{d}</span>
          <button onClick={()=>setDocs(prev=>prev.filter((_,j)=>j!==i))} className="text-[#5F6673] hover:text-[#C2604D]"><X className="w-3.5 h-3.5"/></button>
        </div>)}
      </div>}
      {tab==="facturatie"&&<FacturatieTermijnen projectId={project.id}/>}
      {tab==="notities"&&<Textarea value={notities} onChange={setNotities} rows={8} placeholder="Voeg notities toe..." label="Notities"/>}
      {tab==="geschiedenis"&&<GeschiedenisLijst projects={allProjects.length?allProjects:[project]} employees={employees} recordId={project.id}/>}
    </div>
    {confirmDel&&<ConfirmModal message="Weet je zeker dat je dit project wilt verwijderen? Dit kan niet ongedaan worden gemaakt." onConfirm={()=>{onDelete(project.id);onClose();}} onCancel={()=>setConfirmDel(false)}/>}
  </Modal>;
}

