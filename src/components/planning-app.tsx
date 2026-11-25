import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from "react";
import { Undo2 } from "lucide-react";
import GeschiedenisView from "@/components/geschiedenis-view";
import { regentOp } from "@/components/weer-advies";
import UrenView from "@/components/uren-view";
import SchilderApp from "@/components/schilder-app";
import FeedbackBalk from "@/components/feedback-balk";
import { type WerkbonDag } from "@/lib/werkbon";
import { stuurWerkbon } from "@/lib/werkbon.functions";
import { toast } from "sonner";
import { loadAll, upsertRow, upsertRows, deleteRow, deleteRows, loadProjectMetaBatch, listProjectDocuments, savePlanningRows, setProjectStatusDb, patchSettings, type ProjectMeta } from "@/lib/store";
import { DEMO_MODE } from "@/lib/demo-mode";
import { toDateStr } from "@/lib/werkdagen";
import { useAuth } from "@/components/auth-gate";
import { werkKey, type ImportRow } from "@/lib/excel-parse";
import { useProjectIndexVersion } from "@/lib/project-index";
import { buildAvailabilityIndexes } from "@/lib/availability-index";
import { FacturatieView } from "@/components/facturatie-view";
import { createIndexFacturatieProvider, type FacturatieProvider } from "@/lib/facturatie-query";
import { listTakenForProjects } from "@/lib/store";
import { GebruikersbeheerView, Nav, Afdeling, ProjectStatus, Project, projectIndex, getIndexedProject, searchIndexedProjects, Employee, AvailEntry, setWerkdag, AppSettings, DEFAULT_DC, DC, verzachtOudeKleuren, DeptColorCtx, INIT_SETTINGS, SB, STATS, TODAY_STR, validDate, datePart, nid, setProjectleiderAliases, plName, getDatesInRange, getAllAfds, primaryAfd, projectPlans, werkEmpIds, planPeriod, buildProjectPlanRows, planningNaarPeriode, werkPlaats, werkLabel, Modal } from "@/components/planning/basis";
import { VacationImportModal } from "@/components/planning/importeren";
import { ProjectForm, ProjectDetail } from "@/components/planning/werk";
import { EmployeeForm, NAV_ITEMS, PLANNER_NAV_ITEMS, ADMIN_NAV_ITEMS, Sidebar, MobileTopBar, Dashboard, projStraat, projPlaatsObj, NotitieNaVerslepen, ProjectenView } from "@/components/planning/schermen";
import { AgendaView } from "@/components/planning/agenda";
import { AbsenceDraft, PersoneelsplanningView } from "@/components/planning/personeelsplanning";
import { NotitiesView, MedewerkersView, InstellingenView, diffSettings } from "@/components/planning/beheer";

// ===== APP =====
// Wie geen recht "Kantoorscherm" heeft (schilder, stoffeerder, onderaannemer) krijgt de eigen omgeving; kantoor ziet het planbord.
// Kantoor kan via Medewerkers bekijken hoe een schilder de app ziet.
export default function PlanningApp(){
  const {roles,rechten}=useAuth();
  const [alsSchilder,setAlsSchilder]=useState<string|null>(null);
  if(roles.length>0&&!rechten.kantoor)return <SchilderApp/>;
  if(alsSchilder)return <SchilderApp employeeId={alsSchilder} onTerug={()=>setAlsSchilder(null)}/>;
  return <PlanningBord onAlsSchilder={setAlsSchilder}/>;
}

function PlanningBord({onAlsSchilder}:{onAlsSchilder:(employeeId:string)=>void}){
  const [nav,setNav]=useState<Nav>("dashboard");
  // Slepen ook met de vinger (telefoon/tablet): lang drukken op een blok en dan slepen. Gewoon scrollen blijft werken.
  useEffect(()=>{if(!("ontouchstart" in window))return;let actief=true;
    void Promise.all([import("mobile-drag-drop"),import("mobile-drag-drop/scroll-behaviour"),import("mobile-drag-drop/default.css")]).then(([dnd,scroll])=>{
      if(!actief)return;dnd.polyfill({holdToDrag:350,dragImageTranslateOverride:scroll.scrollBehaviourDragImageTranslateOverride});
      window.addEventListener("touchmove",()=>{},{passive:false});
    }).catch(()=>{});
    return()=>{actief=false;};},[]);
  // Alleen beheerders en planners mogen werken opruimen (zelfde regel als de database: can_plan)
  const {rechten:mijnRechten}=useAuth();
  // Laatste planningswijziging, om met één klik terug te draaien (zonder pop-up)
  const [ongedaan,setOngedaan]=useState<{label:string;herstel:()=>Promise<void>}|null>(null);
  const magPlannen=mijnRechten.plannen;
  // Eenmalig startfilter voor Werken (bijv. "In uitvoering" vanuit het Dashboard); vervalt bij weggaan.
  const [werkenPreset,setWerkenPreset]=useState<string[]>([]);
  useEffect(()=>{if(nav!=="projecten")setWerkenPreset([]);},[nav]);
  const showActiveWerken=()=>{setWerkenPreset(["In uitvoering"]);setNav("projecten");};
  const [projects,setProjects]=useState<Project[]>([]);
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [avail,setAvail]=useState<AvailEntry[]>([]);
  const [detailProject,setDetailProject]=useState<Project|null>(null);
  const [editProject,setEditProject]=useState<Partial<Project>|null>(null);
  const [editEmployee,setEditEmployee]=useState<Partial<Employee>|null>(null);
  const [isNewProject,setIsNewProject]=useState(false);
  const [isNewEmployee,setIsNewEmployee]=useState(false);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [settings,setSettings]=useState<AppSettings>(INIT_SETTINGS);
  // Afkortingen van projectleiders direct beschikbaar voor alle schermen (plName)
  setProjectleiderAliases(settings.projectleiderNamen);
  setWerkdag(settings.werkdagStart,settings.werkdagEind);
  const [showVacImport,setShowVacImport]=useState(false);
  const [dbReady,setDbReady]=useState(false);
  const [loadError,setLoadError]=useState<string>("");
  const [dbError,setDbError]=useState<string>("");
  const [reloadKey,setReloadKey]=useState(0);

  // ===== DATABASE: laden. Geen demo-data, geen automatische achtergrondopslag. =====
  const applySettings=(s:AppSettings)=>{
    setSettings(s);
    (Object.keys(s.deptColors||{}) as Afdeling[]).forEach(afd=>{DC[afd]=s.deptColors[afd];});
  };
  // Lokale schrijfversie: een herlaadronde die startte vóór een eigen wijziging
  // mag die wijziging niet meer overschrijven.
  const localWriteRef=useRef(0);
  const loadSeqRef=useRef(0);
  useEffect(()=>{
    let cancelled=false;
    const silent=reloadKey>0;
    if(!silent){setDbReady(false);setLoadError("");}
    const seq=++loadSeqRef.current;
    const writeAtStart=localWriteRef.current;
    (async()=>{
      try{
        const res=await loadAll<Project,Employee,AvailEntry,AppSettings>();
        if(cancelled||seq!==loadSeqRef.current)return;
        if(silent&&localWriteRef.current!==writeAtStart){setReloadKey(k=>k+1);return;}
        setProjects(res.projects);
        setEmployees(res.employees);
        setAvail(res.availability);
        if(res.settings)applySettings(verzachtOudeKleuren({...INIT_SETTINGS,...res.settings,deptColors:{...INIT_SETTINGS.deptColors,...(res.settings.deptColors||{})}}));
        setDbReady(true);
      }catch(err){
        if(!cancelled&&!silent)setLoadError(err instanceof Error?err.message:"Onbekende fout");
      }
    })();
    return()=>{cancelled=true;};
  },[reloadKey]);

  // ===== Realtime: wijzigingen van collega's stil en gebundeld binnenhalen =====
  useEffect(()=>{
    if(!dbReady)return;
    if(DEMO_MODE)return;
    let cleanup:(()=>void)|null=null;let stopped=false;
    let timer:ReturnType<typeof setTimeout>|null=null;
    const bump=()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>setReloadKey(k=>k+1),800);};
    void import("@/integrations/supabase/client").then(({supabase})=>{
      const ch=supabase.channel("planning-sync")
        .on("postgres_changes",{event:"*",schema:"public",table:"projects"},bump)
        .on("postgres_changes",{event:"*",schema:"public",table:"employees"},bump)
        .on("postgres_changes",{event:"*",schema:"public",table:"availability"},bump)
        .on("postgres_changes",{event:"*",schema:"public",table:"app_settings"},bump)
        .subscribe();
      cleanup=()=>{void supabase.removeChannel(ch);};
      if(stopped)cleanup();
    });
    return()=>{stopped=true;if(timer)clearTimeout(timer);if(cleanup)cleanup();};
  },[dbReady]);

  function errorDetail(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      if (typeof e.message === "string" && e.message) return e.message;
      try { return JSON.stringify(err); } catch { /* val door */ }
    }
    return String(err);
  }

  const fail=(msg:string,err:unknown)=>{
    const detail=errorDetail(err);
    setDbError(detail);
    toast.error(`${msg} ${detail}`);
  };

  // ===== Werken =====
  const saveProject=async(p:Project)=>{
    const prev=projects;
    const exists=projects.some(x=>x.id===p.id);
    setProjects(exists?projects.map(x=>x.id===p.id?{...x,...p}:x):[...projects,p]);
    setEditProject(null);setIsNewProject(false);
    try{await upsertRow("projects",p);setDbError("");}
    catch(e){setProjects(prev);fail("Werk kon niet worden opgeslagen:",e);return;}
    // Datums van het werk gewijzigd? Dan schuift/rekt de planning in de Personeelsplanning mee.
    let basisAvail=avail;
    const oudPer=derivedByProject.get(p.id);
    if(exists&&oudPer&&validDate(p.startdatum)){
      const nS=datePart(p.startdatum),nE=validDate(p.afloopdatum)?datePart(p.afloopdatum):nS;
      const oS=datePart(oudPer.startdatum),oE=datePart(oudPer.afloopdatum);
      if((nS!==oS||nE!==oE)&&nE>=nS){
        const {ups,rem}=planningNaarPeriode(projectPlans(avail,p.id),nS,nE,avail);
        if(ups.length||rem.length){
          const remSet=new Set(rem);const upMap=new Map(ups.map(u=>[u.id,u]));
          const next=[...avail.filter(a=>!remSet.has(a.id)).map(a=>upMap.get(a.id)||a),...ups.filter(u=>!avail.some(a=>a.id===u.id))];
          localWriteRef.current++;setAvail(next);basisAvail=next;
          try{await savePlanningRows(ups,rem,"planning_verschoven_met_werk");setDbError("");}
          catch(e){setAvail(avail);basisAvail=avail;fail("De planning kon niet mee verschuiven:",e);}
        }
      }
    }
    // Medewerkers uit "Medewerkers toewijzen" die nog niet op dit werk staan, krijgen echte planningregels.
    // Alleen planningregels tellen voor het tabblad Medewerkers, Personeelsplanning en Agenda.
    const planned=new Set(werkEmpIds(basisAvail,p));
    const toPlan=[...new Set(p.medewerkers)].filter(id=>!planned.has(id)&&employees.some(e=>e.id===id));
    const {rows}=buildProjectPlanRows(p,toPlan,basisAvail,employees);
    if(!rows.length){
      return;
    }
    const ids=new Set(rows.map(r=>r.id));
    localWriteRef.current++;setAvail(cur=>[...cur,...rows]);
    try{
      await savePlanningRows(rows,[],"planning_opgeslagen");
      setDbError("");
      const n=new Set(rows.map(r=>r.employeeId)).size;
      toast.success(`Werk opgeslagen — ${n} medewerker${n===1?"":"s"} ingepland.`);
    }catch(e){
      setAvail(cur=>cur.filter(a=>!ids.has(a.id)));
      fail("Werk opgeslagen, maar de medewerkers konden niet worden ingepland:",e);
    }
  };
  const updateProject=async(id:string,u:Partial<Project>)=>{
    const cur=projects.find(p=>p.id===id);if(!cur)return;
    const next={...cur,...u};
    const prev=projects;
    setProjects(projects.map(p=>p.id===id?next:p));
    try{await upsertRow("projects",next);setDbError("");}
    catch(e){setProjects(prev);fail("Werk kon niet worden bijgewerkt:",e);}
  };
  // Status direct wijzigen vanuit de werkenlijst: server-side, met logboekregel
  const changeProjectStatus=async(p:Project,status:ProjectStatus)=>{
    const prevStatus=p.status;
    setProjects(cur=>cur.map(x=>x.id===p.id?{...x,status}:x));
    try{
      await setProjectStatusDb(p.id,status);
      setDbError("");
    }catch(e){
      setProjects(cur=>cur.map(x=>x.id===p.id?{...x,status:prevStatus}:x));
      fail("De projectstatus kon niet worden bijgewerkt:",e);
    }
  };
  // ===== Dubbele werken (zelfde werknummer, omschrijving, opdrachtgever, adres en plaats) =====
  const dubbeleGroepen=useMemo(()=>{
    const norm=(s?:string)=>String(s||"").toLowerCase().replace(/\s+/g," ").trim();
    const map=new Map<string,Project[]>();
    projects.forEach(p=>{
      const k=[werkKey(p.werknummer),norm(p.projectnaam),norm(p.opdrachtgever),norm(projStraat(p)),norm(projPlaatsObj(p))].join("|");
      map.set(k,[...(map.get(k)||[]),p]);
    });
    return [...map.values()].filter(g=>g.length>1);
  },[projects]);
  // Groepen die al eens automatisch zijn behandeld (bijv. omdat een dubbel werk eigen gegevens heeft)
  // worden niet steeds opnieuw geprobeerd.
  const geprobeerdeGroepen=useRef(new Set<string>());
  const groepSleutel=(g:Project[])=>g.map(p=>p.id).sort().join(",");
  const dubbeleOpruimen=async(automatisch=false)=>{
    const groepen=automatisch?dubbeleGroepen.filter(g=>!geprobeerdeGroepen.current.has(groepSleutel(g))):dubbeleGroepen;
    groepen.forEach(g=>geprobeerdeGroepen.current.add(groepSleutel(g)));
    if(!groepen.length)return;
    const alleIds=groepen.flat().map(p=>p.id);
    const blokken=<T,>(l:T[],n:number)=>Array.from({length:Math.ceil(l.length/n)},(_,i)=>l.slice(i*n,i*n+n));
    try{
      // Eigen gegevens per werk ophalen: notities/facturatie, taken en documenten
      const meta=new Map<string,ProjectMeta>();const taken=new Map<string,unknown[]>();const docs=new Set<string>();
      for(const b of blokken(alleIds,150)){
        (await loadProjectMetaBatch(b)).forEach((v,k)=>meta.set(k,v));
        (await listTakenForProjects(b)).forEach((v,k)=>taken.set(k,v));
      }
      for(const b of blokken(alleIds,10)){
        const r=await Promise.all(b.map(id=>listProjectDocuments(id).then(d=>d.length>0).catch(()=>true)));
        r.forEach((heeft,i)=>{if(heeft)docs.add(b[i]);});
      }
      const heeftEigen=(id:string)=>{
        const m=meta.get(id);
        const metaInhoud=!!m&&((m.docs?.length||0)>0||!!m.notities?.trim()||Object.values(m.termijnen||{}).some(Boolean));
        return metaInhoud||(taken.get(id)?.length||0)>0||docs.has(id);
      };
      const aantalPlan=(id:string)=>avail.filter(a=>a.projectId===id).length;
      const ups:AvailEntry[]=[];const rem:string[]=[];const weg:string[]=[];let behouden=0;
      groepen.forEach(g=>{
        const keep=[...g].sort((a,b)=>(aantalPlan(b.id)-aantalPlan(a.id))||(Number(heeftEigen(b.id))-Number(heeftEigen(a.id))))[0];
        g.filter(p=>p.id!==keep.id).forEach(p=>{
          if(heeftEigen(p.id)){behouden++;return;}
          avail.filter(a=>a.projectId===p.id).forEach(a=>{
            const alAanwezig=avail.some(x=>x.projectId===keep.id&&x.employeeId===a.employeeId&&x.date===a.date);
            if(alAanwezig)rem.push(a.id);else ups.push({...a,projectId:keep.id});
          });
          weg.push(p.id);
        });
      });
      if(!weg.length){if(!automatisch)toast.info("Er zijn geen dubbele werken die veilig verwijderd kunnen worden.");return;}
      for(const b of blokken(ups,200))await savePlanningRows(b,[],"werken_samengevoegd");
      for(const b of blokken(rem,200))await savePlanningRows([],b,"werken_samengevoegd");
      for(const b of blokken(weg,150))await deleteRows("projects",b);
      const wegSet=new Set(weg);const remSet=new Set(rem);const upMap=new Map(ups.map(u=>[u.id,u]));
      localWriteRef.current++;
      setAvail(cur=>cur.filter(a=>!remSet.has(a.id)).map(a=>upMap.get(a.id)||a));
      setProjects(cur=>cur.filter(p=>!wegSet.has(p.id)));
      setDbError("");
      toast.success(`${weg.length} dubbele werk${weg.length===1?"":"en"} ${automatisch?"automatisch ":""}opgeruimd${behouden?` — ${behouden} met eigen gegevens bleven staan`:""}.`);
    }catch(e){
      fail("Dubbele werken opruimen is (deels) mislukt:",e);
    }
  };
  // Automatisch opruimen: zodra de gegevens geladen zijn en er (nieuwe) dubbele werken zijn,
  // ruimt de app ze zelf op. Alleen voor beheerders/planners; één opruimronde tegelijk.
  const opruimenBezig=useRef(false);
  useEffect(()=>{
    if(!dbReady||!magPlannen||opruimenBezig.current)return;
    if(!dubbeleGroepen.some(g=>!geprobeerdeGroepen.current.has(groepSleutel(g))))return;
    opruimenBezig.current=true;
    void dubbeleOpruimen(true).finally(()=>{opruimenBezig.current=false;});
  },[dbReady,magPlannen,dubbeleGroepen]);
  const deleteProject=async(id:string)=>{
    const prevP=projects,prevA=avail;
    const rowIds=avail.filter(a=>a.projectId===id).map(a=>a.id);
    setProjects(projects.filter(p=>p.id!==id));
    setAvail(avail.filter(a=>a.projectId!==id));
    if(detailProject?.id===id)setDetailProject(null);
    try{
      if(rowIds.length)await savePlanningRows([],rowIds,"planning_verwijderd_bij_werk");
      await deleteRow("projects",id);
      setDbError("");
    }catch(e){setProjects(prevP);setAvail(prevA);fail("Werk kon niet worden verwijderd:",e);}
  };

  // ===== PLANNINGREGELS = enige bron van waarheid =====
  // Projecten krijgen hun medewerkers en periode uit de planningregels.
  // Indexen over de planningregels: één opbouw per wijziging, daarna uitsluitend O(1) lookups.
  const availIndexes=useMemo(()=>buildAvailabilityIndexes(avail),[avail]);
  // Afgeleide waarden worden alleen berekend voor projecten die daadwerkelijk planningregels
  // hebben — nooit door de volledige projectenlijst tegen alle planningregels te scannen.
  const derivedByProject=useMemo(()=>{
    const map=new Map<string,{medewerkers:string[];startdatum:string;afloopdatum:string}>();
    availIndexes.planByProjectId.forEach((rows,pid)=>{
      const per=planPeriod(rows);
      if(!per)return;
      map.set(pid,{medewerkers:(availIndexes.plannedEmployeeIdsByProject.get(pid)||[]).slice().sort(),startdatum:per.start,afloopdatum:per.end});
    });
    return map;
  },[availIndexes]);
  const viewProjects=useMemo(()=>{
    if(derivedByProject.size===0)return projects;
    return projects.map(p=>{const d=derivedByProject.get(p.id);return d?{...p,...d}:p;});
  },[projects,derivedByProject]);
  // Centrale projectindex synchroon houden: alle schermen lezen hieruit met O(1) lookups.
  useEffect(()=>{projectIndex.rebuildProjectIndex(viewProjects);},[viewProjects]);

  // ===== Automatisch "In uitvoering" =====
  // Een werk met status Offerte/Bevestigd gaat vanzelf naar "In uitvoering" zodra vandaag binnen de
  // ingeplande periode valt (eerste t/m laatste planningsdag). Afgeronde/gefactureerde werken blijven ongemoeid.
  const [todayStr,setTodayStr]=useState(()=>toDateStr(new Date()));
  useEffect(()=>{
    const t=setInterval(()=>{const d=toDateStr(new Date());setTodayStr(p=>p===d?p:d);},60000);
    return()=>clearInterval(t);
  },[]);
  const autoStartedRef=useRef(new Set<string>());
  useEffect(()=>{
    if(!dbReady)return;
    const byId=new Map(projects.map(p=>[p.id,p]));
    const due:Project[]=[];
    availIndexes.planByProjectId.forEach((rows,pid)=>{
      if(autoStartedRef.current.has(pid))return;
      const p=byId.get(pid);
      if(!p||(p.status!=="Offerte"&&p.status!=="Bevestigd"))return;
      const dates=rows.filter(r=>r.status==="Ingepland").map(r=>r.date).sort();
      if(!dates.length||dates[0]>todayStr||dates[dates.length-1]<todayStr)return;
      due.push(p);
    });
    if(!due.length)return;
    due.forEach(p=>autoStartedRef.current.add(p.id));
    const ids=new Set(due.map(p=>p.id));
    setProjects(cur=>cur.map(x=>ids.has(x.id)?{...x,status:"In uitvoering"}:x));
    void Promise.allSettled(due.map(p=>setProjectStatusDb(p.id,"In uitvoering"))).then(res=>{
      const failed=due.filter((_p,i)=>res[i].status==="rejected");
      if(failed.length){
        const back=new Map(failed.map(p=>[p.id,p.status]));
        setProjects(cur=>cur.map(x=>back.has(x.id)?{...x,status:back.get(x.id) as ProjectStatus}:x));
        failed.forEach(p=>autoStartedRef.current.delete(p.id));
        toast.error(`${failed.length} werk${failed.length===1?"":"en"} kon${failed.length===1?"":"den"} niet automatisch op "In uitvoering" worden gezet.`);
      }
      const ok=due.filter((_p,i)=>res[i].status==="fulfilled");
    });
  },[availIndexes,projects,todayStr,dbReady]);
  // ===== Facturatie =====
  // Querygebaseerd: filters + sortering globaal in de querylaag, daarna pas 50 rijen.
  // Facturatie krijgt nooit de volledige projectenlijst als prop.
  const facturatieProvider=useMemo<FacturatieProvider>(()=>createIndexFacturatieProvider<Project>({
    index:projectIndex,
    toItem:p=>({
      id:p.id,werknummer:p.werknummer||"",projectnr:p.projectnr||"",
      projectnaam:p.projectnaam||"",opdrachtgever:p.opdrachtgever||"",
      calculator:p.projectleider||"",afdeling:getAllAfds(p as Project)[0],status:p.status||"",
    }),
  }),[]);
  const facturatieDataVersion=useProjectIndexVersion(projectIndex);
  const facturatieAccent=useCallback((afd:string)=>(settings.deptColors[afd as Afdeling]||DEFAULT_DC.Stoffering).bg,[settings.deptColors]);
  const facturatieStatusClass=useCallback((st:string)=>SB[st as ProjectStatus]||"bg-[#EEF0F3] text-[#5A5248]",[]);

  // Alleen de projectperiode wordt afgeleid; medewerkers en alle overige projectvelden
  // (status, afdeling(en), calculator, werknummer, opdrachtgever) blijven ongewijzigd.
  const applyDerivedDates=(nextAvail:AvailEntry[],projectId:string)=>{
    const rows=projectPlans(nextAvail,projectId);
    const per=planPeriod(rows);
    if(!per)return projects; // laatste planning verwijderd: datums bewust behouden
    return projects.map(p=>p.id===projectId?{...p,startdatum:per.start,afloopdatum:per.end}:p);
  };

  // Eén vaste route voor iedere planningwijziging: opslaan (met server-side
  // conflictcontrole) en pas daarna de state definitief bijwerken.
  // Werkbonnen versturen: per medewerker + werk alle komende ingeplande dagen
  const stuurWerkbonnen=async(paren:{employeeId:string;projectId:string}[],alle:AvailEntry[])=>{
    let ok=0;const fouten:string[]=[];
    for(const {employeeId,projectId} of paren){
      const emp=employees.find(e=>e.id===employeeId);const wp=getIndexedProject(projectId);
      if(!emp||!wp)continue;
      const perDag=new Map<string,WerkbonDag>();
      alle.forEach(a=>{
        if(a.status!=="Ingepland"||a.employeeId!==employeeId||a.projectId!==projectId||a.date<TODAY_STR)return;
        const d=perDag.get(a.date);
        if(!d)perDag.set(a.date,{datum:a.date,start:a.startTime,eind:a.endTime});
        else perDag.set(a.date,{datum:a.date,start:(d.start||"")<a.startTime?d.start:a.startTime,eind:(d.eind||"")>a.endTime?d.eind:a.endTime});
      });
      const dagen=[...perDag.values()].sort((a,b)=>a.datum.localeCompare(b.datum));
      if(!dagen.length)continue;
      if(!emp.email){fouten.push(`${emp.naam}: geen e-mailadres`);continue;}
      if(DEMO_MODE){ok++;continue;}
      try{
        await stuurWerkbon({data:{employeeId,projectId,dagen,projectleider:plName(wp,employees)}});
        ok++;
      }catch(e){fouten.push(`${emp.naam}: ${e instanceof Error?e.message:String(e)}`);}
    }
    if(ok)toast.success(DEMO_MODE?`Demo: ${ok} werkbon${ok===1?"":"nen"} zou${ok===1?"":"den"} nu gemaild worden (in de demo wordt niets verstuurd).`:`${ok} werkbon${ok===1?"":"nen"} gemaild.`);
    if(fouten.length)toast.error(`Werkbon niet verstuurd – ${fouten.slice(0,3).join("; ")}`,{duration:12000});
  };

  const persistPlanning=async(nextAvail:AvailEntry[],upserts:AvailEntry[],removeIds:string[],actie:string,okMsg:string)=>{
    const prevAvail=avail,prevProjects=projects;
    const pids=[...new Set([...upserts.map(e=>e.projectId),
      ...prevAvail.filter(a=>removeIds.includes(a.id)||upserts.some(u=>u.id===a.id)).map(a=>a.projectId)])].filter(Boolean) as string[];
    let nextProjects=projects;
    pids.forEach(pid=>{
      const tmp=applyDerivedDates(nextAvail,pid);
      nextProjects=nextProjects.map(p=>p.id===pid?(tmp.find(x=>x.id===pid)||p):p);
    });
    localWriteRef.current++;setAvail(nextAvail);setProjects(nextProjects);
    try{
      await savePlanningRows(upserts,removeIds,actie);
      const changedProjects=nextProjects.filter(p=>{
        const before=prevProjects.find(x=>x.id===p.id);
        return before&&(before.startdatum!==p.startdatum||before.afloopdatum!==p.afloopdatum);
      });
      if(changedProjects.length)await upsertRows("projects",changedProjects);
      setDbError("");
      // Ongedaan maken: precies de vorige toestand van de geraakte regels terugzetten
      const oudPerId=new Map(prevAvail.map(a=>[a.id,a]));
      const terugZetten=[...upserts.map(u=>oudPerId.get(u.id)),...removeIds.map(id=>oudPerId.get(id))].filter((a):a is AvailEntry=>!!a);
      const weghalen=upserts.filter(u=>!oudPerId.has(u.id)).map(u=>u.id);
      const oudeWerken=changedProjects.map(p=>prevProjects.find(x=>x.id===p.id)).filter((p):p is Project=>!!p);
      const herstel=async()=>{
        localWriteRef.current++;
        setAvail(cur=>{const weg=new Set([...weghalen,...terugZetten.map(a=>a.id)]);return [...cur.filter(a=>!weg.has(a.id)),...terugZetten];});
        if(oudeWerken.length)setProjects(cur=>cur.map(p=>oudeWerken.find(o=>o.id===p.id)||p));
        try{
          await savePlanningRows(terugZetten,weghalen,"ongedaan_gemaakt");
          if(oudeWerken.length)await upsertRows("projects",oudeWerken);
        }catch(e){fail("Ongedaan maken lukte niet:",e);}
      };
      // Weer: regent het op de ingeplande dag in de plaats van het werk? Dan één melding; de projectleider beslist zelf.
      const teControleren=new Map<string,{datum:string;plaats:string}>();
      upserts.forEach(u=>{
        if(u.status!=="Ingepland"||!u.projectId||u.date<TODAY_STR)return;
        const plaats=werkPlaats(getIndexedProject(u.projectId));if(!plaats)return;
        teControleren.set(`${plaats.toLowerCase()}|${u.date}`,{datum:u.date,plaats});
      });
      if(teControleren.size)void (async()=>{
        const nat:string[]=[];
        for(const {datum,plaats} of teControleren.values())if(await regentOp(plaats,datum))
          nat.push(`${new Date(datum+"T12:00").toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"short"})} in ${plaats}`);
        if(nat.length)toast.warning(`Let op: het regent op ${nat.slice(0,3).join(", ")}${nat.length>3?` en nog ${nat.length-3} dag(en)`:""}.`,{duration:10000});
      })();
      // Werkbon: nieuw ingeplande medewerkers (optie in Instellingen) een werkbon mailen
      const wbModus=settings.werkbonMail||"uit";
      if(wbModus!=="uit"){
        const paren=new Map<string,{employeeId:string;projectId:string}>();
        upserts.forEach(u=>{
          if(u.status!=="Ingepland"||!u.projectId||u.date<TODAY_STR)return;
          const o=oudPerId.get(u.id);
          if(o&&o.status==="Ingepland"&&o.date===u.date&&o.employeeId===u.employeeId&&o.projectId===u.projectId)return;
          const emp=employees.find(e=>e.id===u.employeeId);if(!emp)return;
          if(settings.werkbonAlleenSchilders!==false&&emp.afdeling!=="Schilderwerk")return;
          paren.set(`${u.employeeId}|${u.projectId}`,{employeeId:u.employeeId,projectId:u.projectId});
        });
        if(paren.size){
          const lijst=[...paren.values()];
          const namen=[...new Set(lijst.map(x=>employees.find(e=>e.id===x.employeeId)?.naam||""))].filter(Boolean);
          const verstuur=()=>{void stuurWerkbonnen(lijst,nextAvail);};
          if(wbModus==="automatisch")verstuur();
          else toast(`Werkbon mailen naar ${namen.slice(0,3).join(", ")}${namen.length>3?` en ${namen.length-3} anderen`:""}?`,{action:{label:"Mailen",onClick:verstuur},duration:15000});
        }
      }
      // Geen melding: de knop Ongedaan maken in de balk bovenaan onthoudt de laatste wijziging
      if(terugZetten.length||weghalen.length)setOngedaan({label:okMsg&&okMsg!=="Planning opgeslagen."?okMsg:"Planning aangepast",herstel:async()=>{setOngedaan(null);await herstel();}});
      return true;
    }catch(e){
      setAvail(prevAvail);setProjects(prevProjects);
      fail("Planning kon niet worden opgeslagen:",e);
      return false;
    }
  };

  const savePlanning=async(entry:AvailEntry)=>{
    const exists=avail.some(a=>a.id===entry.id);
    const nextAvail=exists?avail.map(a=>a.id===entry.id?entry:a):[...avail,entry];
    return persistPlanning(nextAvail,[entry],[],"planning_opgeslagen","Planning opgeslagen.");
  };

  // Meerdere planningregels in één keer (teamverplaatsing, volgorde wijzigen)
  const savePlanningMany=async(entries:AvailEntry[])=>{
    if(entries.length===0)return true;
    if(entries.length===1)return savePlanning(entries[0]);
    const map=new Map(entries.map(e=>[e.id,e]));
    const nextAvail=[...avail.map(a=>map.get(a.id)||a),...entries.filter(e=>!avail.some(a=>a.id===e.id))];
    return persistPlanning(nextAvail,entries,[],"planning_opgeslagen","Planning opgeslagen.");
  };

  // Reeks bijwerken bij doortrekken/inkorten: regels toevoegen/bijwerken én
  // overtollige dagregels van dezelfde reeks verwijderen, in één opslag.
  const savePlanningResize=async(entries:AvailEntry[],removeIds:string[])=>{
    const map=new Map(entries.map(e=>[e.id,e]));
    const nextAvail=[...avail.filter(a=>!removeIds.includes(a.id)).map(a=>map.get(a.id)||a),
      ...entries.filter(e=>!avail.some(a=>a.id===e.id))];
    return persistPlanning(nextAvail,entries,removeIds,"planning_aangepast","Planning bijgewerkt.");
  };

  // Afwezigheid als één periode: elke dag krijgt een regel met hetzelfde periodeId
  const saveAbsence=async(d:AbsenceDraft)=>{
    const dates=getDatesInRange(new Date(d.startDate+"T12:00"),new Date(d.endDate+"T12:00"));
    const pid=d.periodeId||"per-"+nid();
    const removed=avail.filter(a=>a.periodeId===pid||(a.employeeId===d.employeeId&&!a.projectId&&dates.includes(a.date)&&a.status===d.status));
    const base=avail.filter(a=>!removed.includes(a));
    const rows:AvailEntry[]=dates.map(date=>({id:"av-"+nid(),employeeId:d.employeeId,date,startTime:d.startTime,endTime:d.endTime,status:d.status,note:d.note||undefined,periodeId:pid}));
    await persistPlanning([...base,...rows],rows,removed.map(a=>a.id),"afwezigheid_opgeslagen","Afwezigheid opgeslagen.");
  };

  const deleteAbsence=async(periodeId:string)=>{
    const removed=avail.filter(a=>a.periodeId===periodeId);
    await persistPlanning(avail.filter(a=>a.periodeId!==periodeId),[],removed.map(a=>a.id),"afwezigheid_verwijderd","Afwezigheid verwijderd.");
  };

  const deletePlanning=async(id:string)=>{
    const row=avail.find(a=>a.id===id);
    const nextAvail=avail.filter(a=>a.id!==id);
    const pid=row?.projectId;
    const rest=pid?projectPlans(nextAvail,pid):[];
    const ok=await persistPlanning(nextAvail,[],[id],"planning_verwijderd",pid&&rest.length===0?"":"Planning verwijderd.");
  };

  const handleImport=async(rows:ImportRow[])=>{
    const createProjectFromImportRow=(r:ImportRow):Project=>{
      // Calculator (kolom "Projectl."): exacte celtekst, altijd als platte tekst opslaan
      const pl=r.projectleider;
      const afdelingen=r.afdelingen.length?r.afdelingen:["Stoffering" as Afdeling];
      const primaryAfd=afdelingen[0];
      // Statuskolom uit Excel overnemen wanneer die overeenkomt met een bekende status
      const st=STATS.find(s=>s.toLowerCase()===r.statusRaw.trim().toLowerCase())||"Offerte";
      return{
        id:nid(),
        werknummer:r.werknummer,
        projectnaam:r.projectnaam||r.werknummer,
        opdrachtgever:r.opdrachtgever||"",
        adres:r.straat||"",plaats:r.plaatsobject||"",
        calculatiecode:r.calculatiecode||"",
        vestiging:r.vestiging||"",
        straatObject:r.straat||"",
        plaatsObject:r.plaatsobject||"",
        opmerkingen:r.opmerkingen||"",
        ar:r.ar||"",
        statusExcel:r.statusRaw||"",
        afdeling:primaryAfd,afdelingen,
        projectleider:pl,
        // Geen datums uit Excel: het werk verschijnt pas in Agenda/Personeelsplanning
        // zodra de gebruiker zelf een startdatum invult.
        startdatum:"",
        afloopdatum:"",
        medewerkers:[],
        status:st as ProjectStatus,
        notities:"",
        uurprijs:65,uren:8,
      };
    };

    // Alleen toevoegen: bestaande werken (match op Werknr.) worden genegeerd.
    const next=[...projects];
    const bekendeNrs=new Set<string>();
    next.forEach(p=>{const nr=werkKey(p.werknummer);if(nr)bekendeNrs.add(nr);});
    const changed:Project[]=[];
    let nieuw=0,overgeslagen=0;
    rows.forEach(r=>{
      const nr=werkKey(r.werknummer);
      if(nr&&bekendeNrs.has(nr)){overgeslagen++;return;}
      const created=createProjectFromImportRow(r);
      next.push(created);changed.push(created);nieuw++;
      if(nr)bekendeNrs.add(nr);
    });

    // Atomair: eerst opslaan, pas na bevestiging de centrale state bijwerken
    try{
      await upsertRows("projects",changed);
    }catch(e){
      fail("Import kon niet worden opgeslagen:",e);
      return;
    }
    setProjects(next);
    setDbError("");
    toast.success(`Excel-import voltooid — ${nieuw} nieuwe werken toegevoegd${overgeslagen?`, ${overgeslagen} bestaande overgeslagen`:""}.`);

  };

  // ===== Medewerkers =====
  const saveEmployee=async(e:Employee)=>{
    const prev=employees;
    const exists=employees.some(x=>x.id===e.id);
    setEmployees(exists?employees.map(x=>x.id===e.id?{...x,...e}:x):[...employees,e]);
    setEditEmployee(null);setIsNewEmployee(false);
    try{await upsertRow("employees",e);setDbError("");}
    catch(err){setEmployees(prev);fail("Medewerker kon niet worden opgeslagen:",err);}
  };
  const deleteEmployee=async(id:string)=>{
    const prevE=employees,prevA=avail,prevP=projects;
    const rowIds=avail.filter(a=>a.employeeId===id).map(a=>a.id);
    const nextProjects=projects.map(p=>({...p,medewerkers:p.medewerkers.filter(mid=>mid!==id)}));
    setEmployees(employees.filter(e=>e.id!==id));
    setAvail(avail.filter(a=>a.employeeId!==id));
    setProjects(nextProjects);
    try{
      if(rowIds.length)await savePlanningRows([],rowIds,"planning_verwijderd_bij_medewerker");
      await deleteRow("employees",id);
      setDbError("");
    }catch(err){setEmployees(prevE);setAvail(prevA);setProjects(prevP);fail("Medewerker kon niet worden verwijderd:",err);}
  };

  const openEditProject=(p:Project)=>{setDetailProject(null);setEditProject(p);setIsNewProject(false);};
  const openNewProject=(prefill:Partial<Project>={})=>{setEditProject({...prefill});setIsNewProject(true);};
  const openDetailProject=(p:Project)=>setDetailProject(p);

  const handleVacImport=async(entries:AvailEntry[])=>{
    const existKeys=new Set(avail.map(a=>`${a.employeeId}|${a.date}|${a.startTime}|${a.endTime}|${a.status}`));
    const toAdd=entries.filter(e=>!existKeys.has(`${e.employeeId}|${e.date}|${e.startTime}|${e.endTime}|${e.status}`));
    setShowVacImport(false);
    if(!toAdd.length){toast.info("Geen nieuwe regels om te importeren.");return;}
    await persistPlanning([...avail,...toAdd],toAdd,[],"afwezigheid_geimporteerd",`${toAdd.length} regels geïmporteerd.`);
  };

  // Instellingen: alleen de gewijzigde onderdelen naar de database, geneste
  // kleurenmaps per sleutel zodat twee gebruikers elkaar niet overschrijven.
  const handleSaveSettings=(s:AppSettings)=>{
    const prev=settings;
    const {changes,paths}=diffSettings(prev,s);
    applySettings(s);
    if(!Object.keys(changes).length&&!paths.length)return;
    patchSettings(changes,paths).then(()=>setDbError("")).catch((err:unknown)=>{
      applySettings(prev);
      fail("Instellingen konden niet worden opgeslagen:",err);
    });
  };

  if(loadError){
    return <div className="min-h-screen flex items-center justify-center bg-[#F2F4F7] px-4" style={{fontFamily:"var(--font-ui)"}}>
      <div className="max-w-sm w-full bg-white rounded-lg border border-[rgba(15,23,42,0.08)] p-6 text-center">
        <p className="text-base font-semibold text-[#23272F]">Gegevens konden niet worden geladen.</p>
        <p className="text-sm text-[#5F6673] mt-1 break-words">{loadError}</p>
        <button onClick={()=>setReloadKey(k=>k+1)} className="mt-4 w-full py-2.5 rounded-md bg-[#1E3A7B] text-white text-sm font-semibold hover:bg-[#24365c]">Opnieuw proberen</button>
      </div>
    </div>;
  }
  if(!dbReady){
    return <div className="min-h-screen flex items-center justify-center bg-[#F2F4F7]" style={{fontFamily:"var(--font-ui)"}}>
      <p className="text-sm text-[#5F6673]">Gegevens laden…</p>
    </div>;
  }


  return <DeptColorCtx.Provider value={settings.deptColors}>
    <div className="flex h-screen mm-achtergrond overflow-hidden md:p-3 md:gap-3" style={{fontFamily:"var(--font-ui)"}}>
      <NotitieNaVerslepen/>
      <Sidebar active={nav} onNav={setNav} mobileOpen={mobileMenuOpen} onMobileClose={()=>setMobileMenuOpen(false)}/>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden mm-werkvlak md:rounded-[28px]">
        <MobileTopBar onOpenMenu={()=>setMobileMenuOpen(true)} nav={nav}/>
        <FeedbackBalk pagina={[...NAV_ITEMS,...PLANNER_NAV_ITEMS,...ADMIN_NAV_ITEMS].find(n=>n[0]===nav)?.[2]||"deze pagina"} kantoor={mijnRechten.kantoor}
          extra={ongedaan&&<button onClick={()=>void ongedaan.herstel()} title={`Ongedaan maken: ${ongedaan.label}`} className="px-2.5 py-1.5 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-white text-[#1E3A7B] font-medium hover:bg-[#EEF1F5] flex items-center gap-1 shrink-0"><Undo2 className="w-4 h-4"/><span className="hidden md:inline">Ongedaan maken</span></button>}/>
        {dbError&&<div className="bg-[#FDE4E0] text-[#A42A1E] text-sm px-4 py-2 border-b border-[#F6C7BF]">Opslaan mislukt: {dbError}</div>}
        <div className={`flex-1 min-h-0 ${nav==="agenda"?"overflow-hidden flex flex-col":"overflow-auto"}`}>
          {nav==="dashboard"&&<Dashboard projects={viewProjects} employees={employees} availability={avail} onNav={setNav} onOpenProject={openDetailProject} onShowActive={showActiveWerken}/>}
          {nav==="projecten"&&<ProjectenView key={werkenPreset.join("|")||"alle"} initialProjStatus={werkenPreset} projects={viewProjects} employees={employees} onAdd={openNewProject} onEdit={openEditProject} onDelete={deleteProject} onOpen={openDetailProject} onImport={handleImport} onStatusChange={changeProjectStatus} dubbelAantal={dubbeleGroepen.reduce((n,g)=>n+g.length-1,0)} onDubbeleOpruimen={()=>dubbeleOpruimen()}/>}
          {nav==="agenda"&&<AgendaView projects={viewProjects} employees={employees} availability={avail} updateProject={updateProject} onOpenProject={openDetailProject} onCreateProject={openNewProject} onSaveManyPlanning={savePlanningMany}/>}
          {nav==="personeelsplanning"&&<PersoneelsplanningView employees={employees} availability={avail} settings={settings} onSaveSettings={handleSaveSettings} onSavePlanning={savePlanning} onSaveManyPlanning={savePlanningMany} onResizePlanning={savePlanningResize} onDeletePlanning={deletePlanning} onSaveAbsence={saveAbsence} onDeleteAbsence={deleteAbsence} onOpenProject={openDetailProject} onVacImport={()=>setShowVacImport(true)}/>}
          {nav==="uren"&&<UrenView employees={employees} availability={avail} werkNaam={werkLabel} zoekWerken={q=>searchIndexedProjects(q,8).map(p=>({id:p.id,label:werkLabel(p.id)}))}/>}
          {nav==="medewerkers"&&<MedewerkersView employees={employees} onAdd={()=>{setEditEmployee({});setIsNewEmployee(true);}} onEdit={e=>{setEditEmployee(e);setIsNewEmployee(false);}} onDelete={deleteEmployee} onVacImport={()=>setShowVacImport(true)} onAlsSchilder={onAlsSchilder}/>}
          {nav==="notities"&&<NotitiesView/>}
          {nav==="facturatie"&&<FacturatieView provider={facturatieProvider} accentOf={facturatieAccent} statusClassOf={facturatieStatusClass} dataVersion={facturatieDataVersion} onOpenProject={id=>{const p=getIndexedProject(id);if(p)openDetailProject(p);}}/>}
          {nav==="instellingen"&&<InstellingenView settings={settings} onSave={handleSaveSettings} projects={projects} employees={employees}/>}
          {nav==="geschiedenis"&&<GeschiedenisView projects={projects} employees={employees} onOpenProject={id=>{const p=getIndexedProject(id);if(p)openDetailProject(p);}}/>}
          {nav==="gebruikers"&&<Suspense fallback={<div className="p-6 text-sm text-[#5F6673]">Laden…</div>}><GebruikersbeheerView/></Suspense>}
        </div>
      </div>
      {(isNewProject||editProject)&&editProject!==null&&(
        <Modal title={isNewProject?"Nieuw werk aanmaken":"Werk bewerken"} onClose={()=>{setEditProject(null);setIsNewProject(false);}}>
          <ProjectForm initial={editProject} employees={employees} projects={projects} availability={avail} onSave={saveProject} onCancel={()=>{setEditProject(null);setIsNewProject(false);}}/>
        </Modal>
      )}
      {detailProject&&<ProjectDetail project={viewProjects.find(p=>p.id===detailProject.id)||detailProject} employees={employees} allProjects={projects} availability={avail} teamColors={settings.teamColors||{}} badgeColors={settings.badgeColors||{}} projectColors={settings.projectColors||{}} onEdit={()=>openEditProject(viewProjects.find(p=>p.id===detailProject.id)||detailProject)} onDelete={deleteProject} onClose={()=>setDetailProject(null)} onAddEmployees={savePlanningMany} onSaveWerkplan={a=>updateProject(detailProject.id,{werkplan:a as Record<string,unknown>})}/>}
      {(isNewEmployee||editEmployee)&&editEmployee!==null&&(
        <Modal title={isNewEmployee?"Nieuwe medewerker":"Medewerker bewerken"} onClose={()=>{setEditEmployee(null);setIsNewEmployee(false);}}>
          <EmployeeForm initial={editEmployee} onSave={saveEmployee} onCancel={()=>{setEditEmployee(null);setIsNewEmployee(false);}}/>
        </Modal>
      )}
      {showVacImport&&<VacationImportModal employees={employees} projects={projects} availability={avail} onImport={handleVacImport} onClose={()=>setShowVacImport(false)}/>}
    </div>
  </DeptColorCtx.Provider>;
}
