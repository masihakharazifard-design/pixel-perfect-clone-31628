// Onderdeel van de planning-app (uit planning-app.tsx gehaald om het overzichtelijk te houden).
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { CalendarDays, Settings, ChevronLeft, ChevronRight, Plus, Trash2, Check, ChevronDown, Filter, AlertTriangle, Star, Table2, Palette, ChevronUp, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { feestdagOp } from "@/lib/feestdagen";
import { toDateStr, shiftDate, weekdayIdx, isWeekendStr } from "@/lib/werkdagen";
import { werkKey } from "@/lib/excel-parse";
import { useProjectIndexVersion } from "@/lib/project-index";
import { buildAvailabilityIndexes } from "@/lib/availability-index";
import { createIndexOpenProjectsProvider, type OpenProjectsProvider } from "@/lib/open-projects";
import { OpenProjectsPanel } from "@/components/open-projects-panel";
import { Afdeling, AvailStatus, Project, projectIndex, getIndexedProject, getIndexedProjectsByWerknummer, searchIndexedProjects, Employee, AvailEntry, FixedFreeSeries, WORKDAY_START, WORKDAY_END, geldigeTijd, defaultStartFor, toMin, fromMin, AppSettings, sortEmployeesByPlanningOrder, DEFAULT_DC, useDC, AS, DAYS_NL, DAYS_FULL, MONTHS_NL, AFDS, AVAIL_STATS, ABSENCE_STATS, TODAY_STR, validDate, fmtDate, timePart, getDHol, holidayColorOf, withAlpha, WD_LABELS, WD_FULL, nid, abbrevName, plName, tooltipText, getDatesInRange, getWeekNumber, getAllAfds, primaryAfd, planRows, benodigd, PlanStatus, DEFAULT_BADGE_COLORS, PLAN_STATUS_LABEL, overlaps, PlanConflict, findConflicts, blockingOnly, isGeblokkeerd, metMeeschuiven, warningsOnly, conflictLine, teamKey, teamColor, projectleiderKey, projectleiderColorOf, werkAfdKleur, isSchilderwerk, planBlockBg, TWO_LINES, teamForDay, teamRowsForDay, byVolgorde, dayPlanRows, normalizeFirstOfDay, firstStartMismatch, applyFirstOfDay, dayBlockState, statusColorOf, statusBgOf, absenceStyle, borderColorOf, badgeColorOf, badgeStyle, PlanFilter, DEFAULT_PLAN_FILTERS, getWeekDays, Btn, Input, regioVan, regioOpties, RegioFilter, Select, Modal } from "./basis";
import { vraagNotitie } from "./schermen";

// ===== MEDEWERKER INPLANNEN =====
export function EmployeePicker({employees,value,onChange}:{employees:Employee[];value:string;onChange:(id:string)=>void}){
  const [q,setQ]=useState("");
  const sel=employees.find(e=>e.id===value);
  const list=useMemo(()=>{const s=q.trim().toLowerCase();return (s?employees.filter(e=>e.naam.toLowerCase().includes(s)||String(e.functie).toLowerCase().includes(s)):employees).slice(0,50);},[q,employees]);
  return <div className="space-y-1">
    <Input label="Medewerker" value={q} onChange={setQ} placeholder={sel?sel.naam:"Zoek medewerker..."}/>
    {sel&&<p className="text-xs text-[#23272F]">Gekozen: <b>{sel.naam}</b> ({sel.afdeling})</p>}
    <div className="max-h-40 overflow-y-auto border border-[rgba(15,23,42,0.1)] rounded-[10px]">
      {list.map(e=><button type="button" key={e.id} onClick={()=>onChange(e.id)} className={`w-full text-left px-2 py-1 text-xs hover:bg-[#F3F5F8] ${e.id===value?"bg-[#EEF1F5] font-semibold":""}`}>{e.naam} <span className="text-[#5F6673]">· {e.afdeling}</span></button>)}
      {list.length===0&&<p className="px-2 py-1 text-xs text-[#5F6673]">Geen medewerkers gevonden.</p>}
    </div>
  </div>;
}
export function MultiEmployeePicker({employees,values,onChange}:{employees:Employee[];values:string[];onChange:(ids:string[])=>void}){
  const [q,setQ]=useState("");
  const selected=new Set(values);
  const list=useMemo(()=>{
    const s=q.trim().toLowerCase();
    return (s?employees.filter(e=>e.naam.toLowerCase().includes(s)||String(e.functie).toLowerCase().includes(s)):employees).slice(0,100);
  },[q,employees]);
  const toggle=(id:string)=>onChange(selected.has(id)?values.filter(x=>x!==id):[...values,id]);
  return <div className="space-y-2 sm:col-span-2">
    <Input label="Medewerkers" value={q} onChange={setQ} placeholder="Zoek één of meer medewerkers..."/>
    <p className="text-xs text-[#5F6673]">{values.length===0?"Nog niemand gekozen":`${values.length} medewerker${values.length===1?"":"s"} gekozen`}</p>
    <div className="max-h-52 overflow-y-auto border border-[rgba(15,23,42,0.1)] rounded-[10px] divide-y divide-[rgba(15,23,42,0.06)]">
      {list.map(e=>{const isSelected=selected.has(e.id);return <button type="button" key={e.id} onClick={()=>toggle(e.id)}
        className={`w-full flex items-center gap-2 text-left px-3 py-2 text-xs hover:bg-[#F3F5F8] ${isSelected?"bg-[#EEF1F5] font-semibold":""}`}>
        <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected?"bg-[#1E3A7B] border-[#1E3A7B] text-white":"border-[rgba(0,0,0,0.2)]"}`}>{isSelected&&<Check className="w-3 h-3"/>}</span>
        <span className="flex-1 min-w-0 truncate">{e.naam} <span className="font-normal text-[#5F6673]">· {e.afdeling}</span></span>
      </button>;})}
      {list.length===0&&<p className="px-3 py-2 text-xs text-[#5F6673]">Geen medewerkers gevonden.</p>}
    </div>
  </div>;
}
export function PlanEmployeeModal({employees,availability,empId,date,endDate,minDate,maxDate,startTime,endTime,projectId,editId,multiEmployeeSelect=false,onSave,onDelete,onClose}:{
  employees:Employee[];availability:AvailEntry[];
  empId:string;date:string;endDate?:string;minDate?:string;maxDate?:string;startTime:string;endTime:string;projectId?:string;editId?:string;
  multiEmployeeSelect?:boolean;onSave:(entries:AvailEntry[])=>Promise<unknown>;onDelete?:(id:string)=>Promise<unknown>;onClose:()=>void;
}){
  const [emp,setEmp]=useState(empId);
  const [empIds,setEmpIds]=useState<string[]>(empId?[empId]:[]);
  const [d,setD]=useState(date);
  const [dEnd,setDEnd]=useState(endDate||date);
  const [st,setSt]=useState(startTime);
  const [et,setEt]=useState(endTime);
  const [q,setQ]=useState("");
  const [wn,setWn]=useState("");
  const [wnQuery,setWnQuery]=useState("");
  const [sel,setSel]=useState<Project|null>(projectId?getIndexedProject(projectId)||null:null);
  const [busy,setBusy]=useState(false);
  // Nieuwe planning krijgt automatisch de werkdag van de afdeling van het gekozen werk
  // (Stoffering/Schilderwerk 07:00–17:00, Zonwering 08:00–17:00). Bewerken houdt de eigen tijden.
  const tijdAangepast=useRef(false);
  useEffect(()=>{if(!editId&&sel&&!tijdAangepast.current){setSt(defaultStartFor(sel));setEt(WORKDAY_END);}},[sel?.id,editId]);
  // Startdatum bepaalt de ondergrens van de einddatum; bewerken blijft altijd één dag.
  const multi=!editId;
  useEffect(()=>{if(dEnd<d)setDEnd(d);},[d,dEnd]);
  // Werknummer-invoer: korte debounce, daarna O(1) lookup op de centrale index.
  useEffect(()=>{const t=setTimeout(()=>setWnQuery(wn.trim()),150);return()=>clearTimeout(t);},[wn]);
  const wnMatches=useMemo(()=>wnQuery?getIndexedProjectsByWerknummer(wnQuery):[],[wnQuery]);
  useEffect(()=>{
    if(projectId)return;
    if(wnMatches.length===1)setSel(wnMatches[0]);
    else if(wnQuery)setSel(null);
  },[wnMatches,wnQuery,projectId]);
  // Zoeken via de vooraf opgebouwde zoekindex, met harde limiet: nooit de volledige lijst mappen.
  const results=useMemo(()=>searchIndexedProjects(q,20),[q]);
  // Zaterdag en zondag worden standaard overgeslagen; alleen met het vinkje (of als je uitsluitend
  // weekenddagen kiest) worden ze ingepland.
  const [inclWeekend,setInclWeekend]=useState(false);
  const allDays=useMemo(()=>{
    if(!d)return [];
    if(!multi||!dEnd||dEnd<=d)return [d];
    return getDatesInRange(new Date(d+"T12:00"),new Date(dEnd+"T12:00"));
  },[d,dEnd,multi]);
  const weekendInRange=allDays.length>1&&allDays.some(isWeekendStr);
  const days=useMemo(()=>{
    const basis=inclWeekend?allDays:(()=>{const wd=allDays.filter(x=>!isWeekendStr(x));return wd.length?wd:allDays;})();
    if(allDays.length<=1)return basis;
    const zonderFeest=basis.filter(x=>!feestdagOp(x));
    return zonderFeest.length?zonderFeest:basis;
  },[allDays,inclWeekend]);
  const chosenEmployeeIds=multiEmployeeSelect?empIds:(emp?[emp]:[]);
  // Staat de medewerker op die dag al op ditzelfde werk in dit tijdvak? Dan wordt die dag overgeslagen (geen dubbele regel).
  const alreadyOn=useCallback((employeeId:string,day:string)=>!!sel&&availability.some(a=>a.id!==editId&&a.employeeId===employeeId&&a.date===day
    &&a.projectId===sel.id&&a.status==="Ingepland"&&overlaps(st,et,a.startTime,a.endTime)),[sel,availability,editId,st,et]);
  const pairs=useMemo(()=>chosenEmployeeIds.flatMap(employeeId=>days.map(day=>({employeeId,day}))),[chosenEmployeeIds.join("|"),days]);
  const nietDubbel=useMemo(()=>pairs.filter(x=>!alreadyOn(x.employeeId,x.day)),[pairs,alreadyOn]);
  const dupCount=pairs.length-nietDubbel.length;
  // Dagen waarop de medewerker vrij/afwezig is, vallen stilzwijgend weg uit de periode
  const newPairs=useMemo(()=>nietDubbel.filter(x=>!isGeblokkeerd(availability,x.employeeId,x.day,st,et,editId?[editId]:[])),[nietDubbel,availability,st,et,editId]);
  const vrijCount=nietDubbel.length-newPairs.length;
  const conflicts=useMemo(()=>sel?newPairs.flatMap(({employeeId,day})=>findConflictsMulti(availability,employees,getIndexedProject,employeeId,day,st,et,editId?[editId]:[])):[],[sel,newPairs,availability,employees,st,et,editId]);
  const blockers=blockingOnly(conflicts);
  const warnings=warningsOnly(conflicts);
  const [confirmed,setConfirmed]=useState(false);
  const needsConfirm=warnings.length>0&&!confirmed;
  const inRange=(!minDate||d>=minDate)&&(!maxDate||(dEnd||d)<=maxDate);
  const dateOk=!!d&&(!multi||!dEnd||dEnd>=d)&&inRange;
  const timeOk=geldigeTijd(st)&&geldigeTijd(et)&&et>st;
  const canSave=!!sel&&chosenEmployeeIds.length>0&&dateOk&&timeOk&&newPairs.length>0&&blockers.length===0&&!needsConfirm&&!busy;
  const save=async()=>{
    if(!sel||busy)return;
    setBusy(true);
    try{
      // Eén gedeelde reeks voor alle gekozen medewerkers: per medewerker blijft het een doorlopende balk
      // (reeksen worden altijd per medewerker gelezen) en in de Agenda vormen ze samen één blok.
      const reeksId=days.length>1?"reeks-"+nid():undefined;
      // Alleen dagen waarop de medewerker nog NIET op dit werk staat (geen dubbele planningregels)
      const rows=newPairs.map(({employeeId,day},i)=>({
        id:editId&&i===0&&pairs.length===1?editId:("plan-"+nid()),
        employeeId,date:day,startTime:st,endTime:et,
        status:"Ingepland" as AvailStatus,note:`${sel.werknummer} – ${sel.projectnaam}`,projectId:sel.id,
        ...(reeksId?{reeksId}:null),
      }));
      await onSave(rows);
    }finally{
      setBusy(false);
    }
  };

  return <Modal title={multiEmployeeSelect?"Medewerker(s) inplannen":"Medewerker inplannen"} onClose={onClose} width="max-w-2xl">
    <div className="p-4 md:p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {multiEmployeeSelect?<MultiEmployeePicker employees={employees} values={empIds} onChange={setEmpIds}/>
          :empId?<Select label="Medewerker" value={emp} onChange={setEmp} options={employees.map(e=>({value:e.id,label:e.naam}))}/>
          :<EmployeePicker employees={employees} value={emp} onChange={setEmp}/>}
        <div className={multi?"grid grid-cols-2 gap-2":""}>
          <Input label={multi?"Startdatum":"Datum"} value={d} onChange={setD} type="date"/>
          {multi&&<Input label="Einddatum" value={dEnd} onChange={v=>setDEnd(v<d?d:v)} type="date"/>}
        </div>
        {/* Tijden: standaard de werkdag uit Instellingen, per planning zelf aan te passen */}
        <div className="grid grid-cols-2 gap-2 sm:col-start-2">
          <Input label="Begintijd" value={st} onChange={v=>{tijdAangepast.current=true;setSt(v);}} type="time"/>
          <Input label="Eindtijd" value={et} onChange={v=>{tijdAangepast.current=true;setEt(v);}} type="time"/>
        </div>
      </div>
      {!timeOk&&<p className="text-xs text-[#B3301F]">De eindtijd moet na de begintijd liggen.</p>}
      {!inRange&&<p className="text-xs text-[#B3301F]">Kies een periode binnen de looptijd van het werk{minDate?` (${fmtDate(minDate)}`:" ("}{maxDate?` t/m ${fmtDate(maxDate)})`:")"}.</p>}
      {multi&&days.length>1&&<p className="text-xs text-[#5F6673]">{chosenEmployeeIds.length===1?"Deze medewerker wordt":`${chosenEmployeeIds.length} medewerkers worden`} op {days.length} dagen ({fmtDate(days[0])} t/m {fmtDate(days[days.length-1])}) op hetzelfde werk ingepland{!inclWeekend&&weekendInRange?" — zaterdag en zondag worden overgeslagen":""}.</p>}
      {multi&&weekendInRange&&<label className="flex items-center gap-2 text-xs text-[#23272F]">
        <input type="checkbox" checked={inclWeekend} onChange={ev=>setInclWeekend(ev.target.checked)}/>
        Ook op zaterdag en zondag inplannen
      </label>}

      {!projectId&&<div className="space-y-2">
        <Input label="Werknummer" value={wn} onChange={setWn} placeholder="Bijv. 12345"/>
        {wnQuery&&wnMatches.length===0&&<p className="text-xs text-[#B3301F]">Geen bestaand werk gevonden met dit werknummer.</p>}
        {wnMatches.length>1&&<div className="space-y-1">
          <p className="text-xs font-semibold text-[#8A5300]">Meerdere werken gevonden met dit werknummer. Kies het juiste werk.</p>
          <div className="border border-[rgba(15,23,42,0.1)] rounded-md divide-y divide-[rgba(15,23,42,0.06)] max-h-56 overflow-y-auto">
            {wnMatches.map(p=><button key={p.id} type="button" onClick={()=>setSel(p)} className={`w-full text-left p-2.5 hover:bg-[#F8F9FB] ${sel?.id===p.id?"bg-[#EEF1F5]":""}`}>
              <p className="text-xs font-semibold text-[#23272F]">{p.projectnr||"—"} · {p.werknummer} – {p.projectnaam}</p>
              <p className="text-[11px] text-[#5F6673] truncate">{p.projectnaam||p.opmerkingen||"Geen omschrijving"} · {plName(p,employees)||"—"} · {getAllAfds(p).join(", ")}</p>
            </button>)}
          </div>
        </div>}
      </div>}
      {!sel?<div>
        <Input label="Werk zoeken" value={q} onChange={setQ} placeholder="Werknummer of werknaam..."/>
        {q.trim()&&<div className="mt-2 border border-[rgba(15,23,42,0.1)] rounded-md divide-y divide-[rgba(15,23,42,0.06)] max-h-64 overflow-y-auto">
          {results.length===0&&<p className="p-3 text-xs text-[#5F6673]">Geen projecten gevonden.</p>}
          {results.map(p=><button key={p.id} type="button" onClick={()=>setSel(p)} className="w-full text-left p-3 hover:bg-[#F8F9FB]">
            <p className="text-sm font-semibold text-[#23272F]">{p.werknummer} – {p.projectnaam}</p>
            <p className="text-xs text-[#5F6673] truncate">{p.opmerkingen||p.opdrachtgever||"Geen omschrijving"}</p>
          </button>)}
        </div>}
      </div>:<div className="border border-[rgba(15,23,42,0.1)] rounded-md p-4 space-y-2 bg-[#F8F9FB]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#23272F]">{sel.werknummer} – {sel.projectnaam}</p>
            <p className="text-xs text-[#5F6673]">{sel.opmerkingen||sel.opdrachtgever||"Geen omschrijving"}</p>
          </div>
          {!projectId&&<button type="button" onClick={()=>{setSel(null);setQ("");setWn("");}} className="text-xs text-[#1E3A7B] font-semibold flex-shrink-0">Wijzigen</button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div><span className="text-[#5F6673]">Projectnr.</span><p className="font-semibold text-[#23272F]">{sel.projectnr||"—"}</p></div>
          <div><span className="text-[#5F6673]">Afdeling</span><p className="font-semibold text-[#23272F]">{getAllAfds(sel).join(", ")}</p></div>
          <div><span className="text-[#5F6673]">Calculator</span><p className="font-semibold text-[#23272F]">{plName(sel,employees)||"—"}</p></div>
          <div><span className="text-[#5F6673]">Opdrachtgever</span><p className="font-semibold text-[#23272F]">{sel.opdrachtgever||"—"}</p></div>
          <div><span className="text-[#5F6673]">Status</span><p className="font-semibold text-[#23272F]">{sel.status}</p></div>
        </div>
      </div>}
      {sel&&dupCount>0&&<p className="text-xs text-[#5F6673] rounded-[10px] bg-[#F2F4F7] px-3 py-2">
        {nietDubbel.length===0?"Deze medewerker(s) staan op alle gekozen dagen al op dit werk ingepland.":`${dupCount} dag${dupCount===1?"":"en"} staan al op dit werk ingepland en worden overgeslagen.`}
      </p>}
      {sel&&vrijCount>0&&newPairs.length===0&&<p className="text-xs text-[#5F6673] rounded-[10px] bg-[#F2F4F7] px-3 py-2">Op de gekozen dagen is de medewerker vrij of afwezig; er valt niets in te plannen.</p>}
      {blockers.length>0&&<div className="rounded-md border border-[#F6C7BF] bg-[#FDE4E0] p-3 space-y-1">
        <p className="text-xs font-bold text-[#A42A1E] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>Conflict — inplannen is niet mogelijk</p>
        {blockers.map((c,i)=><p key={i} className="text-xs text-[#A42A1E]">{conflictLine(c)}</p>)}
      </div>}
      {blockers.length===0&&warnings.length>0&&<div className="rounded-md border border-[#F6DCA5] bg-[#FEF3DC] p-3 space-y-2">
        <p className="text-xs font-bold text-[#7A4A00] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>Let op — deze medewerker staat al op een ander project in dit tijdvak</p>
        {warnings.map((c,i)=><p key={i} className="text-xs text-[#7A4A00]">{conflictLine(c)}</p>)}
        {!confirmed
          ?<div className="flex gap-2 pt-1"><Btn size="sm" onClick={()=>setConfirmed(true)}>Planning toch opslaan</Btn><Btn size="sm" variant="secondary" onClick={onClose}>Annuleren</Btn></div>
          :<p className="text-xs text-[#7A4A00] font-semibold">Bevestigd — je kunt nu opslaan.</p>}
      </div>}
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
export function FilterManagerModal({filters,onSave,onClose}:{filters:PlanFilter[];onSave:(f:PlanFilter[])=>void;onClose:()=>void}){
  const [list,setList]=useState<PlanFilter[]>(filters.length?filters:DEFAULT_PLAN_FILTERS);
  const upd=(id:string,u:Partial<PlanFilter>)=>setList(prev=>prev.map(f=>f.id===id?{...f,...u}:f));
  const move=(i:number,dir:number)=>setList(prev=>{const n=[...prev];const j=i+dir;if(j<0||j>=n.length)return prev;[n[i],n[j]]=[n[j],n[i]];return n;});
  return <Modal title="Filters beheren" onClose={onClose} width="max-w-xl">
    <div className="p-4 md:p-6 space-y-3">
      {list.map((f,i)=><div key={f.id} className="flex items-center gap-2 border border-[rgba(15,23,42,0.1)] rounded-md p-2">
        <input type="color" value={f.kleur} onChange={e=>upd(f.id,{kleur:e.target.value})} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" title="Filterkleur"/>
        <input value={f.naam} onChange={e=>upd(f.id,{naam:e.target.value})} className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-[rgba(15,23,42,0.12)] rounded-[10px] text-[#23272F]"/>
        <select value={f.afdeling} onChange={e=>upd(f.id,{afdeling:e.target.value})} className="px-2 py-1.5 text-xs border border-[rgba(15,23,42,0.12)] rounded-[10px] text-[#5F6673]">
          <option value="">Alle afdelingen</option>
          {AFDS.map(a=><option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={()=>upd(f.id,{actief:!f.actief})} className={`px-2 py-1 rounded-[10px] text-xs font-semibold ${f.actief?"bg-[#EEF1F5] text-[#1E3A7B]":"bg-[#F2F4F7] text-[#9AA1AD]"}`}>{f.actief?"Actief":"Uit"}</button>
        <button onClick={()=>move(i,-1)} className="p-1 text-[#5F6673] hover:text-[#23272F]" title="Omhoog">↑</button>
        <button onClick={()=>move(i,1)} className="p-1 text-[#5F6673] hover:text-[#23272F]" title="Omlaag">↓</button>
        <button onClick={()=>setList(prev=>prev.filter(x=>x.id!==f.id))} className="p-1 text-[#9AA1AD] hover:text-[#C2604D]" title="Verwijderen"><Trash2 className="w-3.5 h-3.5"/></button>
      </div>)}
      <Btn variant="secondary" size="sm" onClick={()=>setList(prev=>[...prev,{id:"pf"+nid(),naam:"Nieuw filter",kleur:"#4E8C80",afdeling:"",actief:true}])}><Plus className="w-3.5 h-3.5"/>Filter toevoegen</Btn>
      <div className="flex justify-end gap-2 pt-2">
        <Btn variant="secondary" onClick={onClose}>Annuleren</Btn>
        <Btn onClick={()=>{onSave(list);onClose();}}>Opslaan</Btn>
      </div>
    </div>
  </Modal>;
}

// ===== AFWEZIGHEID (vakantie, ziek, vrij, bezet) =====
export interface AbsenceDraft{periodeId?:string;employeeId:string;startDate:string;endDate:string;startTime:string;endTime:string;status:AvailStatus;note:string;wholeDay:boolean;}
export function AbsenceModal({employees,availability,draft,onSave,onDelete,onClose}:{
  employees:Employee[];availability:AvailEntry[];draft:AbsenceDraft;
  onSave:(d:AbsenceDraft)=>Promise<void>;onDelete?:(periodeId:string)=>Promise<void>;onClose:()=>void;
}){
  const [f,setF]=useState<AbsenceDraft>(draft);
  const [busy,setBusy]=useState(false);
  const upd=(u:Partial<AbsenceDraft>)=>setF(p=>({...p,...u}));
  const st=f.wholeDay?"00:00":f.startTime,et=f.wholeDay?"23:59":f.endTime;
  const days=(f.startDate&&f.endDate&&f.startDate<=f.endDate)?getDatesInRange(new Date(f.startDate),new Date(f.endDate)):[];
  const own=f.periodeId?availability.filter(a=>a.periodeId===f.periodeId).map(a=>a.id):[];
  const conflicts=days.flatMap(d=>findConflictsMulti(availability,employees,getIndexedProject,f.employeeId,d,st,et,own));
  const canSave=!!f.employeeId&&days.length>0&&st<et&&!busy;
  return <Modal title={f.periodeId?"Afwezigheid bewerken":"Afwezigheid toevoegen"} onClose={onClose} width="max-w-xl">
    <div className="p-4 md:p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Medewerker" value={f.employeeId} onChange={v=>upd({employeeId:v})} options={employees.map(e=>({value:e.id,label:e.naam}))}/>
        <Select label="Status" value={f.status} onChange={v=>upd({status:v as AvailStatus})} options={ABSENCE_STATS.map(s=>({value:s,label:s}))}/>
        <Input label="Startdatum" value={f.startDate} onChange={v=>upd({startDate:v})} type="date"/>
        <Input label="Einddatum" value={f.endDate} onChange={v=>upd({endDate:v})} type="date"/>
      </div>
      <label className="flex items-center gap-2 text-xs text-[#5F6673]">
        <input type="checkbox" checked={f.wholeDay} onChange={e=>upd({wholeDay:e.target.checked})}/>
        Hele dagen (geen tijden — de volledige geselecteerde periode geldt)
      </label>
      {!f.wholeDay&&<div className="grid grid-cols-2 gap-3">
        <Input label="Starttijd" value={f.startTime} onChange={v=>upd({startTime:v})} type="time"/>
        <Input label="Eindtijd" value={f.endTime} onChange={v=>upd({endTime:v})} type="time"/>
      </div>}
      <Input label={f.status==="Bezet"?"Omschrijving (waarmee bezet?)":f.status==="Gereserveerd"?"Omschrijving (waarvoor gereserveerd?)":"Omschrijving"} value={f.note} onChange={v=>upd({note:v})}
        placeholder={f.status==="Bezet"?"Bijv. cursus, keuring, ander werk…":f.status==="Gereserveerd"?"Bijv. werk in afwachting van opdracht…":"Optioneel"}/>
      <p className="text-xs text-[#5F6673]">{days.length>0?`${days.length} dag${days.length>1?"en":""} · ${st}–${et}`:"Kies een geldige periode."}</p>
      {conflicts.length>0&&<div className="rounded-md border border-[#F6DCA5] bg-[#FEF3DC] p-3 space-y-1">
        <p className="text-xs font-bold text-[#7A4A00] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5"/>Let op — bestaande blokken in deze periode</p>
        {conflicts.slice(0,6).map((c,i)=><p key={i} className="text-xs text-[#7A4A00]">{c.employee} · {c.status} · {fmtDate(c.date)} · {c.time} · {c.label}</p>)}
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
export function findConflictsMulti(av:AvailEntry[],employees:Employee[],getProject:(id?:string|null)=>Project|undefined,empId:string,date:string,start:string,end:string,ignoreIds:string[]):PlanConflict[]{
  return findConflicts(av.filter(a=>a.employeeId===empId&&a.date===date&&!ignoreIds.includes(a.id)),employees,getProject,empId,date,start,end);
}

// ===== KLEUREN BEHEREN =====
export function ColorManagerModal({settings,teams,projectleiders=[],onSave,onClose}:{
  settings:AppSettings;teams:{key:string;label:string}[];projectleiders?:string[];
  onSave:(s:AppSettings)=>void;onClose:()=>void;
}){
  const [s,setS]=useState<AppSettings>(settings);
  // Werken worden opgezocht via de zoekindex; nooit een volledige projectenlijst renderen.
  const [projZoek,setProjZoek]=useState("");
  const projectHits=useMemo(()=>searchIndexedProjects(projZoek,40),[projZoek]);
  const statusColors=s.statusColors||{};
  const projectColors=s.projectColors||{};
  const teamColors=s.teamColors||{};
  const borderColors=s.borderColors||{};
  const badgeColors=s.badgeColors||{};
  const filters=s.planFilters?.length?s.planFilters:DEFAULT_PLAN_FILTERS;
  const row=(key:string,naam:string,kleur:string,onChange:(c:string)=>void,onReset:()=>void)=>
    <div key={key} className="flex items-center gap-2 border border-[rgba(15,23,42,0.08)] rounded-md px-2 py-1.5">
      <input type="color" value={kleur} onChange={e=>onChange(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0"/>
      <span className="flex-1 min-w-0 truncate text-xs text-[#23272F] font-medium">{naam}</span>
      <span className="px-2 py-0.5 rounded text-[10px] font-semibold text-white" style={{backgroundColor:kleur}}>Voorbeeld</span>
      <button onClick={onReset} className="text-[10px] text-[#5F6673] hover:text-[#23272F] font-semibold">Standaard</button>
    </div>;
  const section=(title:string,children:React.ReactNode)=><div className="space-y-2"><h3 className="text-xs font-bold text-[#5F6673]">{title}</h3><div className="space-y-1.5">{children}</div></div>;
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
        ()=>setS(p=>({...p,planFilters:filters.map(x=>x.id===f.id?{...x,kleur:DEFAULT_DC[(x.afdeling as Afdeling)]?.bg||"#4E8C80"}:x)})))))}
      {projectleiders.length>0&&section("Projectleiders (Schilderwerk — tweede kleur in het blok)",projectleiders.map(n=>row("pl-"+n,n,projectleiderColorOf(n,s.projectleiderColors||{}),
        c=>setS(p=>({...p,projectleiderColors:{...(p.projectleiderColors||{}),[n]:c}})),
        ()=>setS(p=>{const m={...(p.projectleiderColors||{})};delete m[n];return{...p,projectleiderColors:m};}))))}
      {teams.length>0&&section("Teams",teams.map(t=>row("tm-"+t.key,t.label,teamColor(t.key,teamColors),
        c=>setS(p=>({...p,teamColors:{...(p.teamColors||{}),[t.key]:c}})),
        ()=>setS(p=>{const n={...(p.teamColors||{})};delete n[t.key];return{...p,teamColors:n};}))))}
      {section("Dagranden (hele dag afwezig)",ABSENCE_STATS.map(st=>row("bd-"+st,st,borderColorOf(st,borderColors,statusColors),
        c=>setS(p=>({...p,borderColors:{...(p.borderColors||{}),[st]:c}})),
        ()=>setS(p=>{const n={...(p.borderColors||{})};delete n[st];return{...p,borderColors:n};}))))}
      {section("Badges (planningsstatus)",(Object.keys(DEFAULT_BADGE_COLORS) as PlanStatus[]).map(st=>row("bg-"+st,PLAN_STATUS_LABEL[st],badgeColorOf(st,badgeColors),
        c=>setS(p=>({...p,badgeColors:{...(p.badgeColors||{}),[st]:c}})),
        ()=>setS(p=>{const n={...(p.badgeColors||{})};delete n[st];return{...p,badgeColors:n};}))))}
      {section("Feestdagen",[row("holiday","Landelijke feestdag",holidayColorOf(s),
        c=>setS(p=>({...p,holidayColor:c})),
        ()=>setS(p=>{const n={...p};delete n.holidayColor;return n;}))])}
      {false&&section("Werken",<><input value={projZoek} onChange={e=>setProjZoek(e.target.value)} placeholder="Zoek werk…"
        className="w-full py-1.5 px-2.5 text-xs border border-[rgba(15,23,42,0.12)] rounded-[10px] text-[#23272F] bg-white focus:outline-none focus:ring-1 focus:ring-[#1E3A7B]/50"/>
        {projZoek.trim()&&projectHits.length===0&&<p className="text-xs text-[#9AA1AD]">Geen werken gevonden.</p>}
        {projectHits.map(pr=>row("pr-"+pr.id,`${pr.werknummer} – ${pr.projectnaam}`,projectColors[pr.id]||DEFAULT_DC[primaryAfd(pr)].bg,
        c=>setS(p=>({...p,projectColors:{...(p.projectColors||{}),[pr.id]:c}})),
        ()=>setS(p=>{const n={...(p.projectColors||{})};delete n[pr.id];return{...p,projectColors:n};})))}</>)}
    </div>
    <div className="flex justify-between gap-2 px-4 md:px-6 py-3 border-t border-[rgba(15,23,42,0.08)]">
      <Btn variant="ghost" onClick={()=>setS(p=>({...p,deptColors:DEFAULT_DC,planFilters:(p.planFilters?.length?p.planFilters:DEFAULT_PLAN_FILTERS).map(f=>({...f,kleur:DEFAULT_DC[(f.afdeling as Afdeling)]?.bg||"#4E8C80"})),teamColors:{},statusColors:{},projectColors:{},projectleiderColors:{},borderColors:{},badgeColors:{}}))}>Alles standaard herstellen</Btn>
      <div className="flex gap-2">
        <Btn variant="secondary" onClick={onClose}>Annuleren</Btn>
        <Btn onClick={()=>{onSave(s);onClose();}}>Opslaan</Btn>
      </div>
    </div>
  </Modal>;
}


// ===== VASTE VRIJE DAGEN =====
export interface FixedFreeDraft{periodeId?:string;employeeId:string;weekdays:number[];startDate:string;endDate:string;}
export function FixedFreeDaysModal({employees,series,draft,onSave,onDelete,onClose}:{
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
        <p className="text-xs font-semibold text-[#5F6673] mb-1.5">Vaste vrije weekdagen</p>
        <div className="flex flex-wrap gap-1.5">
          {WD_LABELS.map((l,i)=><button key={l} type="button" onClick={()=>toggleWd(i)}
            className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold border ${f.weekdays.includes(i)?"bg-[#1E3A7B] text-white border-transparent":"bg-white text-[#5F6673] border-[rgba(15,23,42,0.12)]"}`}>{l}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Vanaf datum" type="date" value={f.startDate} onChange={v=>setF(p=>({...p,startDate:v}))}/>
        <Input label="Tot en met datum" type="date" value={f.endDate} onChange={v=>setF(p=>({...p,endDate:v}))}/>
      </div>
      <p className="text-xs text-[#5F6673]">Op deze dagen wordt de medewerker automatisch als hele dag <b>Vrij</b> gezet. Bestaande projectplanning en losse uitzonderingen blijven altijd staan.</p>
      {own.length>0&&<div className="space-y-1.5">
        <p className="text-xs font-semibold text-[#5F6673]">Bestaande reeksen</p>
        {own.map(s=><div key={s.periodeId} className="flex items-center gap-2 border border-[rgba(15,23,42,0.08)] rounded-md px-3 py-2">
          <span className="flex-1 min-w-0 truncate text-xs text-[#23272F]">{s.serieWeekdays.map(i=>WD_FULL[i]).join(", ")} — {fmtDate(s.serieStartDate)} t/m {fmtDate(s.serieEndDate)}</span>
          <button className="text-[11px] font-semibold text-[#1E3A7B]" onClick={()=>setF({periodeId:s.periodeId,employeeId:s.employeeId,weekdays:[...s.serieWeekdays],startDate:s.serieStartDate,endDate:s.serieEndDate})}>Wijzigen</button>
          <button className="text-[11px] font-semibold text-[#B3301F]" disabled={busy} onClick={async()=>{setBusy(true);await onDelete(s.periodeId);setBusy(false);}}>Verwijderen</button>
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
export type PlanView="dag"|"week"|"maand"|"kwartaal";
// Vaste kolombreedtes (px) zodat iedere dag/week even breed is
export const MONTH_COL_W=72;
export const QUARTER_COL_W=96;
// Greep rechts op een blok: slepen (week) of het venster "Periode aanpassen" (kleine cellen)
// Periode/tijd van een blok aanpassen via een venster (kleine cellen of mobiel)
export function PeriodResizeModal({block,start,end,onClose,onSave}:{block:AvailEntry;start:string;end:string;onClose:()=>void;onSave:(p:{endTime?:string;endDate?:string})=>Promise<void>;}){
  const [endDate,setEndDate]=useState(end);
  const [endTime,setEndTime]=useState(block.endTime);
  return <Modal title="Periode aanpassen" onClose={onClose} width="max-w-md">
    <div className="p-4 md:p-6 space-y-4">
      <p className="text-sm text-[#5F6673]">Startdatum <b>{fmtDate(start)}</b> · begintijd <b>{block.startTime}</b></p>
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

export function ResizeHandle({small,active,label,onStart,onOpen}:{small:boolean;active:boolean;label?:string;onStart:(ev:React.PointerEvent)=>void;onOpen:()=>void;}){
  return <>
    <span title={small?"Periode aanpassen":"Sleep om de einddatum aan te passen"}
      onPointerDown={ev=>{if(small)return;onStart(ev);}}
      onClick={ev=>{ev.stopPropagation();if(small)onOpen();}}
      className={`absolute right-0 top-0 h-full flex items-center justify-center touch-none ${small?"w-3 cursor-pointer":"w-2.5 cursor-ew-resize"} opacity-100 md:opacity-0 md:group-hover:opacity-100`}>
      <span className="w-1 h-3/4 rounded-full bg-white/90 ring-1 ring-[#1E3A7B]"/>
    </span>
    {active&&label&&<span className="absolute -top-4 right-0 z-20 whitespace-nowrap rounded bg-[#1E3A7B] px-1 text-[10px] text-white">{label}</span>}
  </>;
}

// Krijgt bewust NIET de volledige projectenlijst als prop: alle projectdata komt
// uit de centrale projectindex met O(1) lookups.
// ===== Weekweergave op de telefoon, zoals Google Agenda =====
// Kolommen per dag, uren onder elkaar, werken als blokken op hun tijd (één blok per werk en tijd, met de namen),
// afwezigheid als balkje bovenaan de dag. Vegen = vorige/volgende week, tik op een blok = details.
export type WeekBlok={sleutel:string;proj:Project;start:string;eind:string;kleur:string;namen:string[]};
export type WeekChip={sleutel:string;tekst:string;status:AvailStatus};
export const UUR_H=44;
export const minuten=(t:string)=>{const [h,m]=t.split(":").map(Number);return (h||0)*60+(m||0);};
export function MobieleWeek({dagen,medewerkers,blokkenVan,kleurVan,feestdag,onOpenProject,onVorige,onVolgende,onDag}:{
  dagen:Date[];medewerkers:Employee[];
  blokkenVan:(empId:string,d:Date)=>{av:AvailEntry;proj?:Project}[];
  kleurVan:(a:AvailEntry)=>string;feestdag:(ds:string)=>string|null|undefined;
  onOpenProject:(p:Project)=>void;onVorige:()=>void;onVolgende:()=>void;onDag:(d:Date)=>void;
}){
  const [wie,setWie]=useState("");
  const [detail,setDetail]=useState<WeekBlok|null>(null);
  const veegStart=useRef<{x:number;y:number}|null>(null);
  const mensen=wie?medewerkers.filter(e=>e.id===wie):medewerkers;
  const perDag=dagen.map(d=>{
    const blokken=new Map<string,WeekBlok>();const chips:WeekChip[]=[];
    for(const e of mensen)for(const {av,proj} of blokkenVan(e.id,d)){
      if(proj){
        const k=`${proj.id}|${av.startTime}|${av.endTime}`;
        const b=blokken.get(k)||{sleutel:k,proj,start:av.startTime,eind:av.endTime,kleur:kleurVan(av),namen:[]};
        b.namen.push(e.naam);blokken.set(k,b);
      }else if(av.status!=="Beschikbaar")chips.push({sleutel:av.id,status:av.status,tekst:`${av.status} · ${e.naam.split(" ")[0]}`});
    }
    // overlappende blokken naast elkaar (zoals Google Agenda)
    const lijst=[...blokken.values()].sort((a,b)=>a.start.localeCompare(b.start));
    const kol:number[]=[];const plek=new Map<string,{k:number;n:number}>();
    let groep:WeekBlok[]=[];let groepEind=0;
    const sluit=()=>{const n=Math.max(1,...groep.map(b=>plek.get(b.sleutel)!.k+1));groep.forEach(b=>plek.get(b.sleutel)!.n=n);groep=[];kol.length=0;};
    for(const b of lijst){
      if(groep.length&&minuten(b.start)>=groepEind)sluit();
      let k=kol.findIndex(eind=>eind<=minuten(b.start));if(k<0){k=kol.length;kol.push(0);}
      kol[k]=minuten(b.eind);plek.set(b.sleutel,{k,n:1});groep.push(b);groepEind=Math.max(groepEind,minuten(b.eind));
    }
    if(groep.length)sluit();
    return {d,ds:toDateStr(d),lijst,plek,chips};
  });
  const alle=perDag.flatMap(x=>x.lijst);
  const vanUur=Math.min(7,...alle.map(b=>Math.floor(minuten(b.start)/60)));
  const totUur=Math.max(17,...alle.map(b=>Math.ceil(minuten(b.eind)/60)));
  const uren=Array.from({length:totUur-vanUur},(_,i)=>vanUur+i);
  const nu=new Date();const nuMin=nu.getHours()*60+nu.getMinutes();
  const raster="36px repeat(7, minmax(0, 1fr))";
  return <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] mm-tabel overflow-hidden"
    onTouchStart={ev=>{const t=ev.touches[0];veegStart.current={x:t.clientX,y:t.clientY};}}
    onTouchEnd={ev=>{const s=veegStart.current;veegStart.current=null;if(!s)return;const t=ev.changedTouches[0];const dx=t.clientX-s.x,dy=t.clientY-s.y;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5){if(dx<0)onVolgende();else onVorige();}}}>
    <div className="px-2 py-2 border-b border-[rgba(15,23,42,0.06)]">
      <select value={wie} onChange={ev=>setWie(ev.target.value)} aria-label="Medewerker kiezen" className="w-full py-2 px-2 text-sm rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-white text-[#23272F]">
        <option value="">Iedereen ({medewerkers.length})</option>
        {medewerkers.map(e=><option key={e.id} value={e.id}>{e.naam}</option>)}
      </select>
    </div>
    <div className="sticky top-0 z-10 bg-white border-b border-[rgba(15,23,42,0.08)]">
      <div className="grid" style={{gridTemplateColumns:raster}}>
        <div className="text-[10px] text-[#1E3A7B] font-bold flex items-end justify-center pb-1">wk {getWeekNumber(dagen[0])}</div>
        {perDag.map(({d,ds})=>{const vandaag=ds===TODAY_STR;const we=d.getDay()===0||d.getDay()===6;return <button key={ds} onClick={()=>onDag(d)} className="py-1.5 flex flex-col items-center" aria-label={`Dag ${d.getDate()} openen`}>
          <span className={`text-[10px] font-semibold ${vandaag?"text-[#1E3A7B]":we?"text-[#9AA1AD]":"text-[#5F6673]"}`}>{DAYS_NL[(d.getDay()+6)%7]}</span>
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${vandaag?"bg-[#1E3A7B] text-white":"text-[#23272F]"}`}>{d.getDate()}</span>
        </button>;})}
      </div>
      {/* Hele dag: feestdagen en afwezigheid */}
      {perDag.some(x=>x.chips.length||feestdag(x.ds))&&<div className="grid pb-1" style={{gridTemplateColumns:raster}}>
        <div/>
        {perDag.map(({ds,chips})=>{const hol=feestdag(ds);return <div key={ds} className="px-0.5 space-y-0.5 min-w-0">
          {hol&&<div className="text-[10px] leading-tight px-1 py-0.5 rounded bg-[#FDE4E0] text-[#A42A1E] truncate" title={hol}>{hol}</div>}
          {chips.slice(0,2).map(ch=><div key={ch.sleutel} className="text-[10px] leading-tight px-1 py-0.5 rounded truncate" style={{backgroundColor:AS[ch.status].bg,color:AS[ch.status].text}} title={ch.tekst}>{ch.tekst}</div>)}
          {chips.length>2&&<div className="text-[10px] text-[#5F6673] px-1">+{chips.length-2}</div>}
        </div>;})}
      </div>}
    </div>
    <div className="grid" style={{gridTemplateColumns:raster}}>
      <div className="relative" style={{height:uren.length*UUR_H}}>
        {uren.map((u,i)=><span key={u} className="absolute right-1 text-[10px] text-[#9AA1AD] -translate-y-1/2" style={{top:i*UUR_H}}>{i===0?"":`${String(u).padStart(2,"0")}:00`}</span>)}
      </div>
      {perDag.map(({d,ds,lijst,plek})=>{const we=d.getDay()===0||d.getDay()===6;return <div key={ds} className={`relative border-l border-[rgba(15,23,42,0.06)] ${we?"bg-[#F6F8FA]":""}`}
        style={{height:uren.length*UUR_H,backgroundImage:`repeating-linear-gradient(to bottom, rgba(15,23,42,0.07) 0 1px, transparent 1px ${UUR_H}px)`}}>
        {lijst.map(b=>{const p=plek.get(b.sleutel)!;const top=(minuten(b.start)-vanUur*60)/60*UUR_H;const h=Math.max(22,(minuten(b.eind)-minuten(b.start))/60*UUR_H-2);
          return <button key={b.sleutel} onClick={()=>setDetail(b)} className="absolute rounded-[5px] px-1 py-0.5 text-left text-white overflow-hidden shadow-sm"
            style={{top,height:h,left:`calc(${(p.k/p.n)*100}% + 1px)`,width:`calc(${100/p.n}% - 2px)`,backgroundColor:b.kleur}}>
            <span className="block text-[10px] font-semibold leading-tight overflow-hidden" style={{overflowWrap:"normal",wordBreak:"normal",hyphens:"auto"}} lang="nl">{b.proj.projectnaam||b.proj.werknummer}</span>
            {h>48&&<span className="block text-[10px] leading-tight opacity-90 mt-0.5">{b.namen.length===1?b.namen[0].split(" ")[0]:`${b.namen.length} mensen`}</span>}
          </button>;})}
        {ds===TODAY_STR&&nuMin>=vanUur*60&&nuMin<=totUur*60&&<div className="absolute left-0 right-0 h-0.5 bg-[#E0402F] z-[1]" style={{top:(nuMin-vanUur*60)/60*UUR_H}}><span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-[#E0402F]"/></div>}
      </div>;})}
    </div>
    {detail&&<Modal title={detail.proj.projectnaam||detail.proj.werknummer} onClose={()=>setDetail(null)} width="max-w-md">
      <div className="p-5 space-y-3 text-sm">
        <p className="text-[#5F6673]">{detail.proj.werknummer}{detail.proj.plaats?` · ${detail.proj.plaats}`:""}</p>
        <p><span className="font-semibold text-[#23272F]">Tijd:</span> {detail.start}–{detail.eind}</p>
        <div><p className="font-semibold text-[#23272F] mb-1">Ingepland ({detail.namen.length})</p>
          <ul className="space-y-0.5">{detail.namen.map(n=><li key={n} className="text-[#23272F]">{n}</li>)}</ul></div>
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="secondary" onClick={()=>setDetail(null)}>Sluiten</Btn>
          <Btn onClick={()=>{const p=detail.proj;setDetail(null);onOpenProject(p);}}>Werk openen</Btn>
        </div>
      </div>
    </Modal>}
  </div>;
}

// Telefoon (staand): compactere personeelsplanning
export function useSmal(){
  const q="(max-width: 639px)";
  const [smal,setSmal]=useState(()=>typeof window!=="undefined"&&window.matchMedia(q).matches);
  useEffect(()=>{const m=window.matchMedia(q);const op=()=>setSmal(m.matches);m.addEventListener("change",op);return()=>m.removeEventListener("change",op);},[]);
  return smal;
}
export function PersoneelsplanningView({employees,availability,settings,onSaveSettings,onSavePlanning,onSaveManyPlanning,onResizePlanning,onDeletePlanning,onSaveAbsence,onDeleteAbsence,onOpenProject,onVacImport}:{
  employees:Employee[];availability:AvailEntry[];
  settings:AppSettings;onSaveSettings:(s:AppSettings)=>void;
  onSavePlanning:(e:AvailEntry)=>Promise<boolean>;onSaveManyPlanning:(e:AvailEntry[])=>Promise<boolean>;
  onResizePlanning:(e:AvailEntry[],removeIds:string[])=>Promise<boolean>;
  onDeletePlanning:(id:string)=>Promise<void>;
  onSaveAbsence:(d:AbsenceDraft)=>Promise<void>;onDeleteAbsence:(periodeId:string)=>Promise<void>;
  onOpenProject:(p:Project)=>void;onVacImport:()=>void;
}){
  const dc=useDC();
  // Op de telefoon start de planning in de dagweergave (per medewerker een kaart, goed leesbaar)
  const [view,setView]=useState<PlanView>(()=>typeof window!=="undefined"&&window.innerWidth<640?"dag":"week");
  const smal=useSmal();
  const NAAM_B=smal?104:176;
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
  // Geen kleurcontrole meer over de volledige projectenlijst bij het openen van dit scherm.
  // Handmatige kleuren blijven leidend; ontbrekende kleuren komen deterministisch uit projectId.
  const borderColors=settings.borderColors||{};
  const badgeColors=settings.badgeColors||{};
  const holColor=holidayColorOf(settings);
  const activeAfds=filters.filter(f=>f.actief&&f.afdeling).map(f=>f.afdeling);
  const afdKey=activeAfds.join("|");
  // Staan alle afdelingsfilters aan (de standaardsituatie), dan is er feitelijk geen filter:
  // "Openstaande werken" toont dan elk werk met status "O", ook zonder bekende afdeling.
  const openAfdKey=filters.filter(f=>f.afdeling).every(f=>f.actief)?"":afdKey;
  // employees → employeePlanningOrder → filters → render
  const orderedEmployees=useMemo(()=>sortEmployeesByPlanningOrder(employees,settings.employeePlanningOrder||[]),[employees,settings.employeePlanningOrder]);
  const visEmp=orderedEmployees.filter(e=>activeAfds.length===0||activeAfds.includes(e.afdeling));
  // Eén projectbron voor de hele pagina: O(1) lookup via de centrale projectindex,
  // gecombineerd met een goedkope afdelingscontrole. De volledige projectenlijst wordt
  // hier nooit gefilterd of gekopieerd, zodat 10.000+ werken de grid niet vertragen.
  const projVersion=useProjectIndexVersion(projectIndex);
  const projectVisible=useCallback((p?:Project|null)=>!!p&&(activeAfds.length===0||getAllAfds(p).some(a=>activeAfds.includes(a))),[afdKey]);
  const visProj=useCallback((id?:string|null):Project|undefined=>{
    const p=getIndexedProject(id);
    return projectVisible(p)?p:undefined;
    // projVersion zorgt dat lookups na een projectwijziging opnieuw evalueren
  },[projectVisible,projVersion]);
  // Availability-indexen: één opbouw per wijziging van de planningregels
  const avIdx=useMemo(()=>buildAvailabilityIndexes(availability),[availability]);
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

  // ===== Handmatige volgorde van medewerkers (alleen weergave) =====
  const [dragEmp,setDragEmp]=useState<string|null>(null);
  const [dropEmp,setDropEmp]=useState<{id:string;pos:"before"|"after"}|null>(null);
  const fullOrder=useMemo(()=>orderedEmployees.map(e=>e.id),[orderedEmployees]);
  const saveEmployeePlanningOrder=(newOrder:string[])=>{
    const valid=new Set(employees.map(e=>e.id));
    const clean:string[]=[];
    newOrder.forEach(id=>{if(valid.has(id)&&!clean.includes(id))clean.push(id);});
    employees.forEach(e=>{if(!clean.includes(e.id))clean.push(e.id);});
    // Opslaan gebeurt centraal: alleen de gewijzigde instelling gaat naar de database.
    onSaveSettings({...settings,employeePlanningOrder:clean});
  };
  // Alleen de onderlinge volgorde van zichtbare medewerkers wijzigt; verborgen ID's blijven op hun plek.
  const applyVisibleOrder=(visibleIds:string[])=>{
    const set=new Set(visibleIds);let k=0;
    return fullOrder.map(id=>set.has(id)?visibleIds[k++]:id);
  };
  const moveEmp=(empId:string,dir:-1|1)=>{
    const ids=visEmp.map(e=>e.id);const i=ids.indexOf(empId);const j=i+dir;
    if(i<0||j<0||j>=ids.length)return;
    [ids[i],ids[j]]=[ids[j],ids[i]];
    saveEmployeePlanningOrder(applyVisibleOrder(ids));
  };
  const dropEmpOn=(targetId:string)=>{
    const src=dragEmp;const pos=dropEmp?.pos||"before";
    setDragEmp(null);setDropEmp(null);
    if(!src||src===targetId)return;
    const ids=visEmp.map(e=>e.id).filter(id=>id!==src);
    const ti=ids.indexOf(targetId);if(ti<0)return;
    ids.splice(pos==="after"?ti+1:ti,0,src);
    saveEmployeePlanningOrder(applyVisibleOrder(ids));
  };
  const empDragProps=(empId:string)=>({
    onDragOver:(ev:React.DragEvent)=>{
      if(!dragEmp||dragEmp===empId)return;
      ev.preventDefault();ev.stopPropagation();
      const r=(ev.currentTarget as HTMLElement).getBoundingClientRect();
      const pos:"before"|"after"=ev.clientY<r.top+r.height/2?"before":"after";
      setDropEmp(d=>d&&d.id===empId&&d.pos===pos?d:{id:empId,pos});
    },
    onDrop:(ev:React.DragEvent)=>{if(!dragEmp)return;ev.preventDefault();ev.stopPropagation();dropEmpOn(empId);},
  });
  const empDropStyle=(empId:string)=>dropEmp&&dropEmp.id===empId
    ?(dropEmp.pos==="before"?{boxShadow:"inset 0 3px 0 0 #4E8C80"}:{boxShadow:"inset 0 -3px 0 0 #4E8C80"}):undefined;
  const EmpOrderControls=({empId}:{empId:string})=>{
    const ids=visEmp.map(x=>x.id);const i=ids.indexOf(empId);
    return <span className="flex items-center gap-0.5 flex-shrink-0">
      <span draggable onDragStart={ev=>{ev.stopPropagation();setDragEmp(empId);ev.dataTransfer.effectAllowed="move";ev.dataTransfer.setData("text/employee-reorder",empId);}}
        onDragEnd={()=>{setDragEmp(null);setDropEmp(null);}} onClick={ev=>ev.stopPropagation()}
        title="Sleep om de volgorde te wijzigen" className="cursor-grab active:cursor-grabbing text-[#9AA1AD] hover:text-[#5F6673]">
        <GripVertical className="w-3.5 h-3.5"/>
      </span>
      <span className="flex flex-col">
        <button disabled={i<=0} onClick={ev=>{ev.stopPropagation();moveEmp(empId,-1);}} title="Omhoog"
          className="text-[#9AA1AD] hover:text-[#1E3A7B] disabled:opacity-30 leading-none"><ChevronUp className="w-3 h-3"/></button>
        <button disabled={i<0||i>=ids.length-1} onClick={ev=>{ev.stopPropagation();moveEmp(empId,1);}} title="Omlaag"
          className="text-[#9AA1AD] hover:text-[#1E3A7B] disabled:opacity-30 leading-none"><ChevronDown className="w-3 h-3"/></button>
      </span>
    </span>;
  };
  const navigate=(dir:number)=>{const d=new Date(refDate);if(view==="dag")d.setDate(d.getDate()+dir);else if(view==="week")d.setDate(d.getDate()+dir*7);else if(view==="maand")d.setMonth(d.getMonth()+dir);else d.setMonth(d.getMonth()+dir*3);setRefDate(d);};

  // Alles komt uit dezelfde planningregels (availability met projectId)
  const rowsFor=(empId:string,ds:string)=>avIdx.forEmployeeDate(empId,ds).filter(a=>!!a.projectId&&a.status==="Ingepland").sort(byVolgorde);
  // ===== Filter op projectleider (alleen weergave) =====
  const [plFilter,setPlFilter]=useState("");
  const [regioFilter,setRegioFilter]=useState("");
  // Een blok telt mee als het werk door het projectleider- én het regiofilter komt
  const plOk=(p?:Project|null)=>(!plFilter||(!!p&&projectleiderKey(p,employees)===plFilter))&&(!regioFilter||(!!p&&regioVan(p)===regioFilter));
  const {plOptions,plSchilder}=useMemo(()=>{
    const s=new Set<string>(),sw=new Set<string>();
    avIdx.planByProjectId.forEach((_rows,pid)=>{const p=getIndexedProject(pid);if(p){const n=projectleiderKey(p,employees);if(n){s.add(n);if(isSchilderwerk(p))sw.add(n);}}});
    const sort=(x:Set<string>)=>[...x].sort((a,b)=>a.localeCompare(b,"nl"));
    return {plOptions:sort(s),plSchilder:sort(sw)};
  },[avIdx,projVersion,employees]);
  const planRegios=useMemo(()=>regioOpties([...avIdx.planByProjectId.keys()].map(pid=>getIndexedProject(pid))),[avIdx,projVersion]);
  const getEmpProjsDate=(empId:string,date:Date)=>{
    const ds=toDateStr(date);
    return rowsFor(empId,ds).map(a=>({row:a,proj:visProj(a.projectId)})).filter(x=>!!x.proj&&plOk(x.proj)) as {row:AvailEntry;proj:Project}[];
  };
  const getEmpProjsWeek=(empId:string,wk:Date)=>{
    const days=Array.from({length:7},(_,i)=>{const d=new Date(wk);d.setDate(wk.getDate()+i);return toDateStr(d);});
    const seen=new Set<string>();const out:Project[]=[];
    days.flatMap(d=>rowsFor(empId,d)).forEach(a=>{
      const p=visProj(a.projectId);
      if(p&&plOk(p)&&!seen.has(p.id)){seen.add(p.id);out.push(p);}
    });
    return out;
  };

  // Afwezigheidsregels (vakantie/ziek/vrij/bezet) horen bij dezelfde bron
  const absFor=(empId:string,ds:string)=>avIdx.forEmployeeDate(empId,ds).filter(a=>!a.projectId&&ABSENCE_STATS.includes(a.status)).sort((a,b)=>a.startTime.localeCompare(b.startTime));
  // Kleur van een planningregel: uitsluitend op projectId (teamkleur telt hier niet mee).
  // Kleur van een planningblok: de afdelingskleur van het werk (Schilderwerk krijgt daarnaast de projectleiderkleur)
  const rowColor=(a:AvailEntry)=>werkAfdKleur(getIndexedProject(a.projectId),dc);
  // Schilderwerk: tweede kleur voor de projectleider
  const plColors=settings.projectleiderColors||{};
  const plColorFor=(p:Project):string|null=>{
    if(!isSchilderwerk(p))return null;
    const n=projectleiderKey(p,employees);
    return n?projectleiderColorOf(n,plColors):null;
  };
  const blockStyle=(row:AvailEntry,p:Project)=>planBlockBg(rowColor(row),plColorFor(p));
  const blockTitle=(row:AvailEntry,p:Project)=>`${tooltipText(row,p,employees)}${plColorFor(p)?`\nProjectleider: ${projectleiderKey(p,employees)}`:""}`;

  const openPlan=(empId:string,date:string,startTime=WORKDAY_START,endTime=WORKDAY_END,projectId?:string)=>setPlanModal({empId,date,startTime,endTime,projectId});
  const openEditPlan=(a:AvailEntry)=>{if(!canAct(a.projectId,a.employeeId))return;setPlanModal({empId:a.employeeId,date:a.date,startTime:a.startTime,endTime:a.endTime,projectId:a.projectId,editId:a.id});};
  const openAbsence=(empId:string,startDate:string,endDate:string)=>setAbsModal({employeeId:empId,startDate,endDate,startTime:WORKDAY_START,endTime:WORKDAY_END,status:"Vakantie",note:"",wholeDay:true});
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
    const vv=avIdx.forEmployeeDate(empId,ds).find(a=>a.serieType==="vastevrij"&&!!a.periodeId&&a.status==="Vrij");
    if(vv){setVrijAsk(vv);return;}
    openPlan(empId,ds);
  };

  // ===== Opslaan met conflictcontrole (blokkerend vs. waarschuwing) =====
  const evaluate=(entries:AvailEntry[],extraIgnore:string[]=[]):PlanConflict[]=>{
    const ids=[...entries.map(e=>e.id),...extraIgnore];
    return entries.flatMap(e=>findConflicts(avIdx.forEmployeeDate(e.employeeId,e.date).filter(a=>!ids.includes(a.id)),employees,getIndexedProject,e.employeeId,e.date,e.startTime,e.endTime));
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
  const tryCommit=async(alle:AvailEntry[],removeIds:string[]=[],checkFirst=false)=>{
    if(!rowsAllowed(alle)){toast.error(FILTER_MSG);return false;}
    // Dagen waarop de medewerker vrij/afwezig is, worden zonder foutmelding overgeslagen
    const eigen=[...alle.map(e=>e.id),...removeIds];
    const entries=alle.filter(e=>!e.projectId||!isGeblokkeerd(availability,e.employeeId,e.date,e.startTime,e.endTime,eigen));
    if(!entries.length&&!removeIds.length)return false;
    const c=evaluate(entries,removeIds);
    const b=blockingOnly(c);
    if(b.length){toast.error(`Conflict: ${conflictLine(b[0])}`);return false;}
    const w=warningsOnly(c);
    if(w.length){setOverlapAsk({entries,warnings:w,removeIds,checkFirst});return true;}
    await commitPlanning(entries,removeIds,checkFirst);
    return true;
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
      // Doortrekken slaat zaterdag/zondag over; bestaande (bewust geplande) weekenddagen blijven staan.
      const fullSpan=getDatesInRange(new Date(start+"T12:00"),new Date(endDate+"T12:00"));
      // Nieuwe dagen waarop de medewerker vrij/afwezig is, worden overgeslagen
      const kept=fullSpan.filter(d=>rows.some(r=>r.date===d)||(!isWeekendStr(d)&&!feestdagOp(d)&&!isGeblokkeerd(availability,row.employeeId,d,row.startTime,endTime,rows.map(r=>r.id))));
      const span=kept.length?kept:[start];
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
    if(await tryCommit(ups,rem,true))vraagNotitie(baseRows[0]?.projectId,"Planning verlengd of ingekort");
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
    if(await tryCommit(metMeeschuiven(availability,rows.map(r=>({...r,employeeId:rows.length>1?r.employeeId:empId,date:ds,isFirstOfDay:false,volgorde:undefined})),r=>canActSilent(r.projectId,r.employeeId)),[],true))
      vraagNotitie(rows[0]?.projectId,`Verschoven naar ${fmtDate(ds)}`);
  };


  const dropOnCell=async(empId:string,ds:string)=>{
    const block=dragBlock;const pid=dragProject;
    setDragProject(null);setDragBlock(null);
    if(block){
      if(block.employeeId===empId&&block.date===ds)return;
      if(!canAct(block.projectId,block.employeeId)||!visEmpIds.has(empId)){if(block.projectId)toast.error(FILTER_MSG);return;}
      const teamRows=block.projectId?teamRowsForDay(availability,block.projectId,block.date):[];
      if(teamRows.length>1){setTeamChoice({block,empId,date:ds,teamRows});return;}
      if(await tryCommit(metMeeschuiven(availability,[{...block,employeeId:empId,date:ds,isFirstOfDay:false,volgorde:undefined}],r=>canActSilent(r.projectId,r.employeeId)),[],true))
        vraagNotitie(block.projectId,`Verschoven naar ${fmtDate(ds)}`);
      return;
    }
    if(!pid)return;
    const p=visProj(pid);if(!p||!visEmpIds.has(empId)){toast.error(FILTER_MSG);return;}
    // Werkdag van de afdeling (Stoffering/Schilderwerk 07:00, Zonwering 08:00) tot 17:00
    const st=defaultStartFor(p);const et=WORKDAY_END;
    await tryCommit([{id:"plan-"+nid(),employeeId:empId,date:ds,startTime:st,endTime:et,status:"Ingepland",note:`${p.werknummer} – ${p.projectnaam}`,projectId:p.id}],[],true);
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
    // Bezet: eerst een omschrijving laten invullen (bijv. waarmee de medewerker bezet is)
    // Bezet en Gereserveerd: eerst een omschrijving laten invullen
    if(status==="Bezet"||status==="Gereserveerd"){setAbsModal({employeeId:empId,startDate:ds,endDate:ds,startTime:"00:00",endTime:"23:59",status,note:"",wholeDay:true});return;}
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
    const abs=avIdx.forEmployeeDate(empId,ds).filter(a=>!planRows([a]).length)
      .map(av=>({av,proj:undefined as Project|undefined})).sort((a,b)=>a.av.startTime.localeCompare(b.av.startTime));
    const plans=rowsFor(empId,ds).map(av=>({av,proj:visProj(av.projectId)})).filter(x=>!!x.proj&&plOk(x.proj));
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
  const titleStr=view==="dag"?`${DAYS_FULL[(refDate.getDay()+6)%7]} ${refDate.getDate()} ${MONTHS_NL[month]} ${year} · week ${getWeekNumber(refDate)}`:view==="week"?`${wd7[0].getDate()} ${MONTHS_NL[wd7[0].getMonth()].slice(0,3)} – ${wd7[6].getDate()} ${MONTHS_NL[wd7[6].getMonth()].slice(0,3)} ${year} · week ${getWeekNumber(wd7[0])}`:view==="maand"?`${MONTHS_NL[month]} ${year}`:`Q${quarter+1} ${year}`;

  // ===== Periode =====
  const periodStart=view==="kwartaal"?new Date(year,quarter*3,1):dates[0];
  const periodEnd=view==="kwartaal"?new Date(year,quarter*3+3,0):dates[dates.length-1];

  // Datums van de zichtbare periode: de basis voor alle periode-afhankelijke berekeningen.
  const visibleDateStrings=useMemo(()=>(
    periodStart&&periodEnd?getDatesInRange(new Date(periodStart),new Date(periodEnd)):[]
  ),[periodStart?.getTime(),periodEnd?.getTime()]);
  // Met een projectleiderfilter: alleen medewerkers die in deze periode op een werk van die projectleider staan.
  const plEmpIds=useMemo(()=>{
    if(!plFilter&&!regioFilter)return null;
    const s=new Set<string>();
    planRows(avIdx.forDates(visibleDateStrings)).forEach(a=>{const p=visProj(a.projectId);
      if(p&&(!plFilter||projectleiderKey(p,employees)===plFilter)&&(!regioFilter||regioVan(p)===regioFilter))s.add(a.employeeId);});
    return s;
  },[plFilter,regioFilter,avIdx,visibleDateStrings,visProj,employees]);
  const shownEmp=plEmpIds?visEmp.filter(e=>plEmpIds.has(e.id)):visEmp;

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

  // ===== Openstaande werken =====
  // Querygebaseerd (max 100 resultaten renderen, alles blijft vindbaar) en losgekoppeld
  // van de planning-render: het paneel hertekent niet mee met celinteracties.
  // Alleen werken met Excel-status "O" én zonder enige planningregel blijven openstaan.
  const avIdxRef=useRef(avIdx);
  avIdxRef.current=avIdx;
  // ===== Ingeplande medewerkers per werk =====
  // Planning telt voor een werk als ze op hetzelfde werk-ID staat óf op een werk met hetzelfde
  // werknummer (dubbel ingelezen werken). Planningregels waarvan het werk niet meer bestaat,
  // worden via de omschrijving ("werknummer – naam") aan het juiste werk gekoppeld.
  const werkSleutel=(p:Project)=>werkKey(p.werknummer)||"id:"+p.id;
  const ingeplandPerWerk=useMemo(()=>{
    const map=new Map<string,Set<string>>();
    const voegToe=(k:string,emp:string)=>{if(!k)return;const s=map.get(k);if(s)s.add(emp);else map.set(k,new Set([emp]));};
    avIdx.planByProjectId.forEach((rows,pid)=>{
      const p=getIndexedProject(pid);
      rows.forEach(r=>{
        if(p){voegToe(werkSleutel(p),r.employeeId);voegToe("id:"+p.id,r.employeeId);return;}
        // Werk-ID onbekend: werknummer uit de omschrijving halen
        const wn=String(r.note||"").split(" – ")[0];
        const gevonden=wn?getIndexedProjectsByWerknummer(wn.trim())[0]:undefined;
        voegToe(gevonden?werkSleutel(gevonden):werkKey(wn),r.employeeId);
      });
    });
    return map;
  },[avIdx,projVersion]);
  const aantalIngepland=(p:Project)=>{
    const a=ingeplandPerWerk.get(werkSleutel(p)),b=ingeplandPerWerk.get("id:"+p.id);
    return new Set([...(a||[]),...(b||[])]).size;
  };
  const aantalIngeplandRef=useRef(aantalIngepland);
  aantalIngeplandRef.current=aantalIngepland;
  const openProjectsProvider=useMemo<OpenProjectsProvider<Project>>(()=>createIndexOpenProjectsProvider<Project>({
    index:projectIndex,
    // Uit de lijst zodra er minstens één medewerker op het werk staat
    isHidden:p=>String((p as Project).statusExcel||"").trim().toUpperCase()!=="O"
      ||aantalIngeplandRef.current(p as Project)>0,
    getAfdelingen:p=>getAllAfds(p as Project),
  }),[]);
  // Verandert alleen na een echte planningwijziging (nieuwe availability-referentie).
  const planningVersionRef=useRef(0);
  const planningVersion=useMemo(()=>++planningVersionRef.current,[avIdx,ingeplandPerWerk]);
  // Zware renderdata wordt uitsluitend voor de zichtbare (max 100) rijen opgebouwd.
  const openRowData=useCallback((p:Project)=>{
    // Teller en label op basis van de echte toewijzingen (ook via werknummer gekoppeld)
    const n=aantalIngepland(p);
    const nodig=benodigd(p);
    const st:PlanStatus=n===0?"Niet ingepland":n>=nodig?"Ingepland":"Gedeeltelijk ingepland";
    const rest=Math.max(0,nodig-n);
    return{
      title:`${p.werknummer} – ${p.projectnaam}`,
      subtitle:`${fmtDate(p.startdatum)} – ${fmtDate(p.afloopdatum)} · ${p.projectnaam||"—"}`,
      color:werkAfdKleur(p,dc),
      badgeStyle:badgeStyle(st,badgeColors),
      statusLabel:`${PLAN_STATUS_LABEL[st]}${rest>0?` · nog ${rest}`:""}`,
      countLabel:`${n}/${nodig}`,
    };
  },[ingeplandPerWerk,projectColors,badgeColors]);

  // Teams (unieke combinaties) in deze periode, voor de legenda
  const teams:{key:string;kleur:string;label:string}[]=[];
  // Alleen de zichtbare periode wordt verwerkt (nooit alle planningregels).
  planRows(avIdx.forDates(visibleDateStrings)).forEach(a=>{
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
      <div><h1 className="text-[26px] md:text-[30px] leading-[32px] md:leading-[38px] font-semibold text-[#23272F]">Personeelsplanning</h1><p className="hidden sm:block text-[#5F6673] text-xs md:text-sm">Bezetting per medewerker · klik = inplannen, shift-klik op twee dagen = afwezigheid</p></div>
      <div className="flex gap-2 overflow-x-auto sm:flex-wrap -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
        <Btn variant="secondary" onClick={onVacImport} size="sm"><Table2 className="w-3.5 h-3.5"/>Vakantie importeren</Btn>
        <Btn variant="secondary" size="sm" onClick={()=>openAbsence(visEmp[0]?.id||employees[0]?.id||"",toDateStr(refDate),toDateStr(refDate))}><CalendarDays className="w-3.5 h-3.5"/>Afwezigheid</Btn>
        <Btn variant="secondary" size="sm" onClick={()=>openFixedFree()}><CalendarDays className="w-3.5 h-3.5"/>Vaste vrije dagen</Btn>
        <Btn variant="secondary" size="sm" onClick={()=>setShowColors(true)}><Palette className="w-3.5 h-3.5"/>Kleuren beheren</Btn>
      </div>
    </div>
    <div className="flex gap-2 items-center flex-wrap">
      <div className="flex items-center gap-1 border border-[rgba(15,23,42,0.12)] rounded-[10px] overflow-hidden">
        <button onClick={()=>navigate(-1)} className="p-1.5 hover:bg-[#F2F4F7] text-[#5F6673]"><ChevronLeft className="w-4 h-4"/></button>
        <span className="text-xs md:text-sm px-2 md:px-3 text-[#23272F] font-medium min-w-36 md:min-w-52 text-center">{titleStr}</span>
        <button onClick={()=>navigate(1)} className="p-1.5 hover:bg-[#F2F4F7] text-[#5F6673]"><ChevronRight className="w-4 h-4"/></button>
      </div>
      <div className="flex rounded-[10px] border border-[rgba(15,23,42,0.12)] overflow-hidden">
        {(["dag","week","maand","kwartaal"] as PlanView[]).map(v=><button key={v} onClick={()=>setView(v)} className={`px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors ${view===v?"bg-[#1E3A7B] text-white":"text-[#5F6673] hover:bg-[#F2F4F7]"}`}>{v==="kwartaal"?"Kw.":v.charAt(0).toUpperCase()+v.slice(1)}</button>)}
      </div>
      <div className="flex gap-1.5 items-center overflow-x-auto sm:flex-wrap w-full sm:w-auto pb-1 sm:pb-0 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
        {filters.map(f=><button key={f.id} onClick={()=>toggleFilter(f.id)} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] text-xs font-medium border transition-opacity ${f.actief?"border-transparent text-white":"border-[rgba(15,23,42,0.12)] text-[#9AA1AD] bg-white"}`} style={f.actief?{backgroundColor:f.kleur}:undefined}>
          <span className="w-2 h-2 rounded-full" style={{backgroundColor:f.actief?"rgba(255,255,255,0.9)":f.kleur}}/>{f.naam}
        </button>)}
        <Btn variant="secondary" size="sm" onClick={()=>setShowFilters(true)}><Settings className="w-3.5 h-3.5"/>Filters</Btn>
        <select value={plFilter} onChange={ev=>setPlFilter(ev.target.value)} title="Filter op projectleider"
          className={`py-1.5 px-2 text-xs rounded-[10px] border focus:outline-none focus:ring-1 focus:ring-[#1E3A7B]/50 ${plFilter?"border-[#1E3A7B] text-[#23272F] font-semibold bg-[#EEF1F5]":"border-[rgba(15,23,42,0.12)] text-[#5F6673] bg-white"}`}>
          <option value="">Alle projectleiders</option>
          {plOptions.map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        {plFilter&&<button onClick={()=>setPlFilter("")} className="text-xs text-[#1E3A7B] font-semibold">Wis</button>}
        {planRegios.length>0&&<RegioFilter value={regioFilter} onChange={setRegioFilter} opties={planRegios}/>}
        {regioFilter&&<button onClick={()=>setRegioFilter("")} className="text-xs text-[#1E3A7B] font-semibold">Wis regio</button>}
      </div>
    </div>
    {(plFilter||regioFilter)&&shownEmp.length===0&&<p className="text-xs text-[#5F6673]">Geen medewerkers ingepland op werken{plFilter?` van ${plFilter}`:""}{regioFilter?` in regio ${regioFilter}`:""} in deze periode.</p>}

    {view==="dag"&&<div className="space-y-3">
      {getDHol(toDateStr(refDate))&&<div className="rounded-lg px-4 py-2.5 text-sm font-semibold" style={{backgroundColor:withAlpha(holColor,0.1),borderLeft:`4px solid ${holColor}`,color:holColor}}>
        Landelijke feestdag — {getDHol(toDateStr(refDate))}
      </div>}
      {shownEmp.map(e=>{
        const blocks=getDayBlocks(e.id,refDate);
        const ds=toDateStr(refDate);
        return <div key={e.id} {...empDragProps(e.id)} style={empDropStyle(e.id)} className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden" onContextMenu={ev=>openCellMenu(ev,e.id,ds)}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(15,23,42,0.06)]" style={{borderLeftColor:dc[e.afdeling].bg,borderLeftWidth:4}}>
            {!smal&&<EmpOrderControls empId={e.id}/>}
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
            <div className="flex-1"><p className="font-semibold text-[#23272F] text-sm">{e.naam}</p><p className="text-xs text-[#5F6673]">{e.functie}</p></div>
            <Btn variant="secondary" size="sm" onClick={()=>openPlan(e.id,ds)}><Plus className="w-3.5 h-3.5"/>Inplannen</Btn>
          </div>
          {blocks.length===0
            ?<button onClick={()=>openPlan(e.id,ds)} onContextMenu={ev=>openCellMenu(ev,e.id,ds)} className="w-full text-left px-4 py-3 text-xs text-[#9AA1AD] hover:bg-[#F8F9FB]">Geen tijdblokken — klik om in te plannen</button>
            :<div className="divide-y divide-[rgba(15,23,42,0.05)]">
              {blocks.map(({av:b,proj})=>(
                <div key={b.id} draggable={!!proj} onDragStart={()=>proj&&setDragBlock(b)} onDragEnd={()=>setDragBlock(null)}
                  onContextMenu={ev=>openCellMenu(ev,e.id,ds,b)}
                  className="group relative flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 pb-4 md:pb-2.5 cursor-pointer hover:bg-[#F8F9FB]" onClick={()=>proj?onOpenProject(proj):ABSENCE_STATS.includes(b.status)?clickAbsence(b):openPlan(e.id,ds)}>
                  {b.isFirstOfDay&&<Star className="w-3.5 h-3.5 text-[#D08A4E] flex-shrink-0" fill="currentColor" aria-label="Als eerste uitvoeren"/>}
                  <span className="text-xs tabular-nums text-[#5F6673] whitespace-nowrap sm:w-28 flex-shrink-0">{b.startTime}–{resizePv?.id===b.id?resizePv.label:b.endTime}</span>
                  {proj&&<span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor:rowColor(b)}} title="Kleur van het werk"/>}
                  {proj&&plColorFor(proj)&&<span className="w-2.5 h-2.5 rounded-full flex-shrink-0 -ml-2 ring-2 ring-white" style={{backgroundColor:plColorFor(proj)||undefined}} title={`Projectleider: ${projectleiderKey(proj,employees)}`}/>}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0" style={{backgroundColor:statusBgOf(b.status,statusColors),color:AS[b.status].text}}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor:statusColorOf(b.status,statusColors)}}/>
                    {b.status}
                  </span>
                  <span className="text-sm sm:text-xs font-medium sm:font-normal text-[#23272F] basis-full sm:basis-auto order-last sm:order-none sm:flex-1 whitespace-normal leading-snug sm:leading-tight" style={{overflowWrap:"anywhere"}} title={proj?`${proj.werknummer}\n${proj.projectnaam||""}\n${proj.opmerkingen||""}\n${plName(proj,employees)||"—"} · ${getAllAfds(proj).join(", ")}`:(b.note||"")}>{proj?`${proj.projectnaam||proj.werknummer||""}`:(b.note||"")}</span>
                  {resizePv?.id===b.id&&<span className="text-[10px] font-semibold text-[#1E3A7B] flex-shrink-0">tot {resizePv.label}</span>}
                  {proj&&<button onClick={ev=>{ev.stopPropagation();onOpenProject(proj);}} className="text-[10px] text-[#1E3A7B] font-semibold flex-shrink-0">Project</button>}
                  {/* Resize-handle: eindtijd doortrekken */}
                  <span onPointerDown={ev=>startResize(ev,b,"time")} onClick={ev=>ev.stopPropagation()} title="Sleep om de eindtijd aan te passen"
                    className="absolute left-0 right-0 bottom-0 h-3 md:h-2 flex items-center justify-center cursor-ns-resize touch-none opacity-100 md:opacity-0 md:group-hover:opacity-100">
                    <span className="w-14 h-1 rounded-full bg-[#1E3A7B]"/>
                  </span>
                </div>
              ))}
            </div>
          }
        </div>;
      })}
    </div>}

    {smal&&view==="week"&&<MobieleWeek dagen={dates} medewerkers={shownEmp} blokkenVan={getDayBlocks} kleurVan={rowColor} feestdag={getDHol}
      onOpenProject={onOpenProject} onVorige={()=>navigate(-1)} onVolgende={()=>navigate(1)} onDag={d=>{setRefDate(new Date(d));setView("dag");}}/>}
    {((view==="week"&&!smal)||view==="maand")&&(
    // Eigen scrolgebied: zo blijft de kopregel met de dagen bovenaan staan bij naar beneden scrollen
    <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-auto mm-tabel" style={{maxHeight:"calc(100vh - 210px)"}}>
      {/* Vaste tabelindeling: elke dag is even breed, lange teksten lopen nooit een kolom op */}
      <table className={`text-xs ${view==="week"?"w-full":""}`} style={{tableLayout:"fixed",minWidth:`${NAAM_B+dates.length*(view==="week"?(smal?64:90):MONTH_COL_W)}px`,...(view==="maand"?{width:`${NAAM_B+dates.length*MONTH_COL_W}px`}:null)}}>
        <thead className="bg-[#F2F4F7] sticky top-0 z-10">
          <tr>
            <th className="px-2 sm:px-4 py-3 text-left text-[#5F6673] font-semibold sticky left-0 bg-[#F2F4F7] z-20" style={{width:NAAM_B}}>{smal?"Naam":"Medewerker"}</th>
            {dates.map(d=>{const ds=toDateStr(d);const hol=getDHol(ds);const isT=ds===TODAY_STR;const isWE=d.getDay()===0||d.getDay()===6;return<th key={ds}
              style={{...(view==="week"?{width:`calc((100% - ${NAAM_B}px) / ${dates.length})`}:{width:MONTH_COL_W}),...(hol?{backgroundColor:withAlpha(holColor,0.1),borderTop:`2px solid ${holColor}`,color:holColor}:null)}}
              className={`py-2 text-center font-semibold min-w-10 ${isT?"text-[#1E3A7B]":isWE?"text-[#9AA1AD]":"text-[#5F6673]"} ${isWE&&!hol?"bg-[#E8ECF1]":""}`} title={hol||undefined}>
              {/* Weeknummer boven elke maandag (en boven de eerste dag in beeld) */}
              <div className="text-[10px] leading-none h-3 text-[#1E3A7B] font-bold">{d.getDay()===1||ds===toDateStr(dates[0])?`wk ${getWeekNumber(d)}`:""}</div>
              <div>{DAYS_NL[(d.getDay()+6)%7]}</div>
              <div className={`w-6 h-6 rounded-full mx-auto flex items-center justify-center ${isT?"bg-[#1E3A7B] text-white":""}`}>{d.getDate()}</div>
              {hol&&view!=="maand"&&<div className="text-[10px] truncate mx-auto" style={{color:holColor}}>{hol}</div>}
              {hol&&view==="maand"&&<div className="w-1.5 h-1.5 rounded-full mx-auto mt-0.5" style={{backgroundColor:holColor}}/>}
            </th>;})}
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(15,23,42,0.05)]">
          {shownEmp.map(e=><tr key={e.id} className="hover:bg-[#F8F9FB]">
            <td {...empDragProps(e.id)} style={empDropStyle(e.id)} className="px-2 sm:px-3 py-2.5 sticky left-0 bg-white z-10 border-r border-[rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-1.5">
                {!smal&&<EmpOrderControls empId={e.id}/>}
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
                <div className="min-w-0"><p className="font-semibold text-[#23272F] truncate">{e.naam}</p><p className="hidden sm:block text-[#5F6673] truncate">{e.functie}</p></div>
              </div>
            </td>
            {dates.map(d=>{const ds=toDateStr(d);const ps=getEmpProjsDate(e.id,d);const isWE=d.getDay()===0||d.getDay()===6;const abs=absFor(e.id,ds);const sel=rangeStart&&rangeStart.empId===e.id&&rangeStart.date===ds;
            const blockState=dayBlockState(availability,e.id,ds);
            // Cellen met een doorlopende reeks krijgen geen horizontale padding, zodat de balk aansluit
            const linkedCell=view==="week"&&ps.some(x=>{const s=segInfo(x.row);return s.prev||s.next;});
            const cellHol=getDHol(ds);
            return<td key={ds} onClick={ev=>cellClick(e.id,ds,ev)} onContextMenu={ev=>{ev.preventDefault();setCellMenu({empId:e.id,date:ds,x:ev.clientX,y:ev.clientY});}}
              onDragOver={ev=>{if(dragProject||dragBlock)ev.preventDefault();}} onDrop={()=>dropOnCell(e.id,ds)}
              style={{...(blockState?{boxShadow:`inset 0 0 0 2px ${borderColorOf(blockState,borderColors,statusColors)}`}:null),
                ...(cellHol?{backgroundColor:withAlpha(holColor,0.08),borderTop:`2px solid ${withAlpha(holColor,0.7)}`}:null)}}
              className={`py-1 ${linkedCell?"px-0":"px-0.5"} text-center align-middle cursor-pointer ${isWE&&!cellHol?"bg-[#F6F8FA]":""} ${sel?"ring-2 ring-inset ring-[#1E3A7B]":""} ${dragProject||dragBlock?"hover:bg-[#EEF1F5]":"hover:bg-[#F2F4F7]"}`} title={cellHol?`${cellHol} · klik = inplannen`:"Klik = inplannen · shift-klik = periode afwezigheid · rechtsklik = snelmenu"}>
              <div className="space-y-0.5">
                {abs.map(a=><div key={a.id} className="group relative">
                  <button onClick={ev=>{ev.stopPropagation();clickAbsence(a);}}
                    className="mm-planblok rounded px-1 text-[10px] font-semibold w-full text-left hover:opacity-90"
                    style={absenceStyle(a.status,statusColors)} title={`${a.status}${a.note?" – "+a.note:""} (${a.startTime}–${a.endTime})`}>
                    <span style={TWO_LINES}>{a.note?`${view==="week"?a.status:a.status.slice(0,4)}: ${a.note}`:(view==="week"?a.status:a.status.slice(0,4))}</span>
                  </button>
                  {seriesEnd(a)===ds&&<ResizeHandle small={view!=="week"} active={resizePv?.id===a.id} label={resizePv?.id===a.id?resizePv.label:undefined}
                    onStart={ev=>{if(view==="week")startResize(ev,a,"date");}} onOpen={()=>setPeriodModal(a)}/>}
                </div>)}
                {ps.map(({row,proj},bi)=>{
                  // Maand: losse blokjes per dag (geen doorlopende balk); week: aansluitende reeksbalken
                  const seg=view==="maand"?{prev:false,next:false}:segInfo(row);return<div key={row.id} className="group relative">

                  <button draggable onDragStart={ev=>{ev.stopPropagation();setDragBlock(row);}} onDragEnd={()=>setDragBlock(null)}
                  onContextMenu={ev=>openCellMenu(ev,e.id,ds,row)}
                  onClick={ev=>{ev.stopPropagation();onOpenProject(proj);}} className={`mm-planblok text-white px-1 text-[10px] font-medium hover:opacity-80 transition-opacity w-full text-left cursor-grab active:cursor-grabbing ${dragBlock?.id===row.id?"opacity-50":""}`} style={{...blockStyle(row,proj),borderTopLeftRadius:seg.prev?0:4,borderBottomLeftRadius:seg.prev?0:4,borderTopRightRadius:seg.next?0:4,borderBottomRightRadius:seg.next?0:4}} title={blockTitle(row,proj)}>
                    {row.isFirstOfDay&&!seg.prev&&<Star className="w-2.5 h-2.5 flex-shrink-0 mb-0.5" fill="currentColor"/>}
                    <span className="min-w-0" style={TWO_LINES}>{seg.prev?"\u00A0":(proj.projectnaam||proj.werknummer||"")}</span>
                  </button>

                  {ps.length>1&&<span className="hidden group-hover:flex absolute -left-0.5 top-0 h-full flex-col justify-center">
                    <button onClick={ev=>{ev.stopPropagation();reorderDayPlans(row,-1);}} disabled={bi===0} className="text-[10px] leading-none text-white/90 disabled:opacity-30 px-0.5" title="Omhoog">▲</button>
                    <button onClick={ev=>{ev.stopPropagation();reorderDayPlans(row,1);}} disabled={bi===ps.length-1} className="text-[10px] leading-none text-white/90 disabled:opacity-30 px-0.5" title="Omlaag">▼</button>
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
    <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-auto mm-tabel" style={{maxHeight:"calc(100vh - 210px)"}}>
      <table className="text-xs" style={{tableLayout:"fixed",width:`${NAAM_B+weeks.length*QUARTER_COL_W}px`}}>
        <thead className="bg-[#F2F4F7] sticky top-0 z-10">
          <tr>
            <th className="px-2 sm:px-4 py-3 text-left text-[#5F6673] font-semibold sticky left-0 bg-[#F2F4F7] z-20" style={{width:NAAM_B}}>{smal?"Naam":"Medewerker"}</th>
            {weeks.map((wk,i)=>{const wn=getWeekNumber(wk);
              const hols=Array.from({length:7},(_,k)=>{const d=new Date(wk);d.setDate(wk.getDate()+k);return getDHol(toDateStr(d));}).filter(Boolean) as string[];
              return<th key={i} className="py-2 px-1 text-center font-semibold text-[#5F6673]" title={hols.join(", ")||undefined}
                style={{width:QUARTER_COL_W,...(hols.length?{backgroundColor:withAlpha(holColor,0.08),borderTop:`2px solid ${holColor}`}:null)}}>
              <div className="text-[10px] text-[#9AA1AD] mb-0.5">Wk{wn}</div>
              <div className="text-[10px]">{wk.getDate()} {MONTHS_NL[wk.getMonth()].slice(0,3)}</div>
              {!!hols.length&&<div className="w-1.5 h-1.5 rounded-full mx-auto mt-0.5" style={{backgroundColor:holColor}}/>}
            </th>;})}
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(15,23,42,0.05)]">
          {shownEmp.map(e=><tr key={e.id} className="hover:bg-[#F8F9FB]">
            <td {...empDragProps(e.id)} style={empDropStyle(e.id)} className="px-2 sm:px-3 py-2.5 sticky left-0 bg-white z-10 border-r border-[rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-1.5">
                {!smal&&<EmpOrderControls empId={e.id}/>}
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
                <div className="min-w-0"><p className="font-semibold text-[#23272F] truncate">{e.naam}</p><p className="hidden sm:block text-[#5F6673] truncate">{e.functie}</p></div>
              </div>
            </td>
            {weeks.map((wk,i)=>{const ps=getEmpProjsWeek(e.id,wk);return<td key={i} onClick={()=>openPlan(e.id,toDateStr(wk))} className="py-1.5 px-1 text-center align-middle cursor-pointer hover:bg-[#F2F4F7]">
              {ps.length>0?<div className="space-y-0.5">
                {ps.slice(0,2).map(p=><button key={p.id} onClick={ev=>{ev.stopPropagation();onOpenProject(p);}} className="rounded text-white px-1 py-0.5 text-[10px] font-medium hover:opacity-80 transition-opacity block w-full text-left" style={planBlockBg(werkAfdKleur(p,dc),plColorFor(p))} title={`${p.werknummer}\n${p.projectnaam||"—"}\n${plName(p,employees)||"—"} · ${getAllAfds(p).join(", ")}`}>
                  <span style={TWO_LINES}>{p.projectnaam||p.werknummer}</span>
                </button>)}
                {ps.length>2&&<div className="text-[10px] text-[#5F6673]">+{ps.length-2}</div>}
              </div>:<span className="text-[10px] text-[#E2E7F0]">+</span>}
            </td>;})}
          </tr>)}
        </tbody>
      </table>
    </div>
    )}

    {/* ===== Openstaande werken ===== */}
    <OpenProjectsPanel<Project> openProjectsProvider={openProjectsProvider} afdelingenKey={openAfdKey}
      projectVersion={projVersion} planningVersion={planningVersion} getRowData={openRowData}
      onOpen={onOpenProject} onPlan={p=>setProjMenu(p)}
      onDragStartProject={id=>setDragProject(id)} onDragEndProject={()=>setDragProject(null)}/>

    <div className="flex items-center gap-4 flex-wrap">
      {filters.map(f=><div key={f.id} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{backgroundColor:f.kleur}}/><span className="text-xs text-[#5F6673]">{f.naam}</span></div>)}
      {AVAIL_STATS.filter(s=>s!=="Vrij").map(s=><div key={s} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full" style={{backgroundColor:statusColorOf(s,statusColors)}}/><span className="text-xs text-[#5F6673]">{s}</span></div>)}
    </div>
    {plSchilder.length>0&&<div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs font-semibold text-[#5F6673]">Projectleiders Schilderwerk (rechterdeel van het blok):</span>
      {plSchilder.map(n=><div key={n} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{backgroundColor:projectleiderColorOf(n,plColors)}}/><span className="text-xs text-[#5F6673]">{n}</span></div>)}
    </div>}
    {teams.length>0&&<div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4">
      <h3 className="text-xs font-bold text-[#23272F] mb-2">Teams in deze periode</h3>
      <div className="flex flex-wrap gap-3">
        {teams.map(t=><div key={t.key} className="flex items-center gap-1.5">
          <input type="color" value={t.kleur} onChange={ev=>setTeamColor(t.key,ev.target.value)} className="w-4 h-4 rounded cursor-pointer border-0 bg-transparent p-0" title="Teamkleur aanpassen"/>
          <span className="text-xs text-[#5F6673]">{t.label}</span>
        </div>)}
      </div>
    </div>}

    {showFilters&&<FilterManagerModal filters={filters} onSave={saveFilters} onClose={()=>setShowFilters(false)}/>}
    {projMenu&&<PlanEmployeeModal employees={visEmp.length?visEmp:employees} availability={availability} multiEmployeeSelect
      empId="" date={toDateStr(validDate(projMenu.startdatum)?new Date(projMenu.startdatum):refDate)}
      startTime={timePart(projMenu.startdatum)||WORKDAY_START} endTime={timePart(projMenu.afloopdatum)||WORKDAY_END} projectId={projMenu.id}
      onSave={async es=>{setProjMenu(null);await commitPlanning(es,undefined,true);}} onClose={()=>setProjMenu(null)}/>}
    {planModal&&<PlanEmployeeModal employees={visEmp.length?visEmp:employees} availability={availability}
      empId={planModal.empId} date={planModal.date} startTime={planModal.startTime} endTime={planModal.endTime}
      projectId={planModal.projectId} editId={planModal.editId} multiEmployeeSelect={!planModal.editId}
      onSave={async es=>{
        setVrijEx(null);setPlanModal(null);
        const rows=es.map(e=>{
          const prev=availability.find(a=>a.id===e.id);
          // Bij bewerken blijven volgorde en markering behouden; bij een andere dag/medewerker vervallen ze
          const same=prev&&prev.employeeId===e.employeeId&&prev.date===e.date;
          // Vaste vrije dag waarop nu een project komt: alleen deze datum is een uitzondering
          const vv=vrijEx&&vrijEx.row.employeeId===e.employeeId&&vrijEx.row.date===e.date?vrijEx.periodeId:null;
          return {...e,volgorde:same?prev.volgorde:undefined,isFirstOfDay:same?prev.isFirstOfDay:false,reeksId:e.reeksId??prev?.reeksId,teamId:prev?.teamId,
            vasteVrijExceptionIds:vv?[...new Set([...(prev?.vasteVrijExceptionIds||[]),vv])]:prev?.vasteVrijExceptionIds};
        });
        await commitPlanning(rows,undefined,true);
      }}
      onDelete={async id=>{const b=availability.find(a=>a.id===id);setPlanModal(null);if(b)await deletePlanRow(b);else await onDeletePlanning(id);}}
      onClose={async()=>{setPlanModal(null);await cancelVrijException();}}/>}
    {ffModal&&<FixedFreeDaysModal employees={visEmp.length?visEmp:employees} series={fixedSeries} draft={ffModal}
      onSave={saveFixedFree} onDelete={async pid=>{await deleteFixedFree(pid);setFfModal(null);}} onClose={()=>setFfModal(null)}/>}
    {ffAsk&&<Modal title="Er staat al werk gepland" onClose={()=>setFfAsk(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#5F6673]">Op deze vaste vrije dagen staat al projectplanning. De planning blijft volledig staan; deze datums worden geen vrije dag.</p>
        <div className="rounded-md border border-[#F6DCA5] bg-[#FEF3DC] p-3 space-y-1 max-h-40 overflow-y-auto">
          {ffAsk.dates.map(d=><p key={d} className="text-xs text-[#7A4A00]">{fmtDate(d)}</p>)}
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={()=>setFfAsk(null)}>Annuleren</Btn>
          <Btn onClick={async()=>{const a=ffAsk;setFfAsk(null);await commitFixedFree(a.draft);}}>Doorgaan</Btn>
        </div>
      </div>
    </Modal>}
    {dayOrSeries&&<Modal title="Vaste vrije dag" onClose={()=>setDayOrSeries(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#5F6673]">{fmtDate(dayOrSeries.date)} hoort bij een vaste vrije reeks. Wil je alleen deze dag wijzigen of de hele reeks?</p>
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
        <p className="text-sm text-[#5F6673]">Deze medewerker is normaal op deze dag Vrij. Alleen deze datum beschikbaar maken en een project inplannen?</p>
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={()=>setVrijAsk(null)}>Annuleren</Btn>
          <Btn onClick={async()=>{const v=vrijAsk;setVrijAsk(null);await startVrijException(v);}}>Ja, inplannen</Btn>
        </div>
      </div>
    </Modal>}
    {absModal&&<AbsenceModal employees={employees} availability={availability} draft={absModal}
      onSave={async d=>{await onSaveAbsence(d);setAbsModal(null);}}
      onDelete={async pid=>{await onDeleteAbsence(pid);setAbsModal(null);}}
      onClose={()=>setAbsModal(null)}/>}
    {showColors&&<ColorManagerModal settings={settings} teams={teams.map(t=>({key:t.key,label:t.label}))} projectleiders={plSchilder}
      onSave={s=>onSaveSettings(s)} onClose={()=>setShowColors(false)}/>}
    {rangeStart&&<div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-[#1E3A7B] text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-3">
      Kies de einddag voor de afwezigheid
      <button className="underline" onClick={()=>setRangeStart(null)}>Annuleren</button>
    </div>}

    {/* Snelmenu op een cel */}
    {cellMenu&&<>
      <div className="fixed inset-0 z-40" onClick={()=>setCellMenu(null)} onContextMenu={ev=>{ev.preventDefault();setCellMenu(null);}}/>
      <div ref={menuRef} className="fixed z-50 bg-white rounded-md border border-[rgba(15,23,42,0.12)] shadow-lg py-1 text-xs min-w-44"
        style={{left:Math.max(8,Math.min(cellMenu.x,window.innerWidth-200)),top:Math.max(8,Math.min(cellMenu.y,window.innerHeight-menuH-8))}}>
        <p className="px-3 py-1.5 text-[10px] text-[#9AA1AD]">{employees.find(e=>e.id===cellMenu.empId)?.naam} · {fmtDate(cellMenu.date)}{cellMenu.block?` · ${cellMenu.block.startTime}–${cellMenu.block.endTime}`:""}</p>
        {cellMenu.block&&<>
          {cellMenu.block.projectId&&<button className="w-full text-left px-3 py-1.5 hover:bg-[#F2F4F7] text-[#23272F] flex items-center gap-2" onClick={async()=>{const b=cellMenu.block!;setCellMenu(null);await markFirstOfDay(b,!b.isFirstOfDay);}}>
            <Star className="w-3.5 h-3.5 text-[#D08A4E]" fill="currentColor"/>{cellMenu.block.isFirstOfDay?"Markering verwijderen":"Als eerste uitvoeren"}
          </button>}
          <button className="w-full text-left px-3 py-1.5 hover:bg-[#F2F4F7] text-[#23272F]" onClick={()=>{const b=cellMenu.block!;setCellMenu(null);if(b.projectId)openEditPlan(b);else clickAbsence(b);}}>Bewerken…</button>
          {isSeriesVrij(cellMenu.block)&&<button className="w-full text-left px-3 py-1.5 hover:bg-[#F2F4F7] text-[#23272F]" onClick={()=>{const b=cellMenu.block!;setCellMenu(null);editSeries(b.periodeId!);}}>Vaste vrije reeks wijzigen…</button>}
          <button className="w-full text-left px-3 py-1.5 hover:bg-[#F2F4F7] text-[#23272F]" onClick={()=>{const b=cellMenu.block!;setCellMenu(null);setPeriodModal(b);}}>Periode aanpassen…</button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-[#F2F4F7] text-[#B3301F]" onClick={async()=>{const b=cellMenu.block!;setCellMenu(null);if(b.projectId)await deletePlanRow(b);else if(b.periodeId)await onDeleteAbsence(b.periodeId);else await onDeletePlanning(b.id);}}>Verwijderen</button>
          <div className="my-1 border-t border-[rgba(15,23,42,0.08)]"/>
        </>}
        <button className="w-full text-left px-3 py-1.5 hover:bg-[#F2F4F7] text-[#23272F]" onClick={()=>{
          const c=cellMenu;setCellMenu(null);
          const vrij=availability.find(a=>a.employeeId===c.empId&&a.date===c.date&&isSeriesVrij(a)&&a.status==="Vrij");
          if(vrij){setVrijAsk(vrij);return;}
          openPlan(c.empId,c.date,c.startTime||WORKDAY_START,c.endTime||WORKDAY_END);
        }}>Project inplannen…</button>
        {ABSENCE_STATS.map(s=><button key={s} className="w-full text-left px-3 py-1.5 hover:bg-[#F2F4F7] text-[#23272F] flex items-center gap-2" onClick={()=>quickStatus(cellMenu.empId,cellMenu.date,s)}>
          <span className="w-2 h-2 rounded-full" style={{backgroundColor:statusColorOf(s,statusColors)}}/>{s==="Bezet"?"Bezet (met omschrijving)…":s==="Gereserveerd"?"Reserveren (met omschrijving)…":`${s} (hele dag)`}
        </button>)}
        <button className="w-full text-left px-3 py-1.5 hover:bg-[#F2F4F7] text-[#5F6673]" onClick={()=>{const c=cellMenu;setCellMenu(null);openAbsence(c.empId,c.date,c.date);}}>Afwezigheid met periode…</button>
        <button className="w-full text-left px-3 py-1.5 hover:bg-[#F2F4F7] text-[#5F6673]" onClick={()=>{const c=cellMenu;setCellMenu(null);openFixedFree(c.empId);}}>Vaste vrije dagen…</button>
      </div>
    </>}

    {/* Keuze bij het slepen van een teamblok */}
    {teamChoice&&<Modal title="Planning verplaatsen" onClose={()=>setTeamChoice(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#5F6673]">Deze dag werken {teamChoice.teamRows.length} medewerkers samen aan dit project. Standaard verplaatst het hele team mee.</p>
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
        <p className="text-sm text-[#5F6673]">Deze medewerker staat in dit tijdvak al op een ander project:</p>
        <div className="rounded-md border border-[#F6DCA5] bg-[#FEF3DC] p-3 space-y-1">
          {overlapAsk.warnings.slice(0,6).map((c,i)=><p key={i} className="text-xs text-[#7A4A00]">{conflictLine(c)}</p>)}
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
        <p className="text-sm text-[#5F6673]">{firstAsk.kind==="start"
          ?"Er is nu een werk dat eerder begint. Wilt u dit werk automatisch als eerste uitvoeren markeren?"
          :"Dit project als eerste uitvoeren?"}</p>
        <div className="rounded-md border border-[rgba(15,23,42,0.1)] bg-[#F8F9FB] p-3 text-xs text-[#23272F]">
          {getIndexedProject(firstAsk.target.projectId)?.projectnaam||firstAsk.target.note||"Werk"} · {firstAsk.target.startTime}–{firstAsk.target.endTime} · {fmtDate(firstAsk.target.date)}
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
        <p className="text-sm text-[#5F6673]">Je trekt dit blok door tot <b>{lateAsk.endTime}</b>, na de standaard werkdag ({WORKDAY_END}).</p>
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={async()=>{const l=lateAsk;setLateAsk(null);if(l.fallback!==l.block.endTime)await applyResize(l.block,{endTime:l.fallback});}}>Stoppen om {lateAsk.fallback}</Btn>
          <Btn onClick={async()=>{const l=lateAsk;setLateAsk(null);await applyResize(l.block,{endTime:l.endTime});}}>Doorplannen tot {lateAsk.endTime}</Btn>
        </div>
      </div>
    </Modal>}

    {/* Alleen deze medewerker of het hele team verlengen */}
    {resizeTeam&&<Modal title="Hele team aanpassen?" onClose={()=>setResizeTeam(null)} width="max-w-md">
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-[#5F6673]">Er staan {resizeTeam.teamRows.length} medewerkers op dit project in dit tijdvak.</p>
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

