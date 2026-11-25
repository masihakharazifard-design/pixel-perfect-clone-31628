// Onderdeel van de planning-app (uit planning-app.tsx gehaald om het overzichtelijk te houden).
import { useState, useRef, useEffect } from "react";
import { Check, Upload, Calendar, AlertTriangle, Download, Table2 } from "lucide-react";
import { werkKey, type ImportRow, type VacBaseRow, type ImportWorkerRequest, type ImportWorkerResponse } from "@/lib/excel-parse";
import { AvailStatus, Project, Employee, AvailEntry, DEFAULT_DC, AS, fmtDate, getDatesInRange, findConflicts, Btn, Modal } from "./basis";

// ===== EXCEL IMPORT MODAL =====
// Parsing gebeurt volledig in een Web Worker (src/workers/excel-import.worker.ts).
// De UI houdt alleen tellingen en maximaal 20 voorbeeldregels per lijst in state;
// de volledige regels blijven in een ref en komen nooit in de React-state.
export interface ImportPreview {
  total:number; duplicaten:number;
  nieuwCount:number; bestaandCount:number; ongeldigCount:number;
  nieuwSample:ImportRow[]; bestaandSample:ImportRow[]; ongeldigSample:ImportRow[];
  missingColumns:string[];
}


// Maximaal aantal voorbeeldregels per lijst in het importvenster (DOM klein houden)
export const PREVIEW_LIMIT=20;
// Maximaal aantal gerenderde regels in "Openstaande werken" en rijen per pagina in Werken
export const OPEN_LIMIT=100;
export const PAGE_SIZE=50;

export const createImportWorker=()=>new Worker(new URL("../../workers/excel-import.worker.ts",import.meta.url),{type:"module"});

export function ExcelImportModal({projects,employees,onImport,onClose}:{
  projects:Project[];employees:Employee[];
  onImport:(rows:ImportRow[])=>void|Promise<void>;onClose:()=>void;
}){
  const [preview,setPreview]=useState<ImportPreview|null>(null);
  const [step,setStep]=useState<"upload"|"preview">("upload");
  const [loading,setLoading]=useState(false);
  const [progress,setProgress]=useState(0);
  const [importing,setImporting]=useState(false);
  const [parseError,setParseError]=useState<string>("");
  const [warning,setWarning]=useState<string>("");
  const busyRef=useRef(false);
  const fileRef=useRef<HTMLInputElement>(null);
  // Volledige importregels (±7.000) — bewust buiten de React-state
  const rowsRef=useRef<ImportRow[]>([]);
  const workerRef=useRef<Worker|null>(null);
  useEffect(()=>()=>{workerRef.current?.terminate();},[]);

  const parseFile=async(file:File)=>{
    if(busyRef.current)return;
    busyRef.current=true;
    setLoading(true);setProgress(0);setParseError("");setWarning("");
    rowsRef.current=[];
    const finish=()=>{
      setLoading(false);busyRef.current=false;
      if(fileRef.current)fileRef.current.value="";
      workerRef.current?.terminate();workerRef.current=null;
    };
    try{
      const buf=await file.arrayBuffer();
      const worker=createImportWorker();
      workerRef.current=worker;
      worker.onmessage=(ev:MessageEvent<ImportWorkerResponse>)=>{
        const msg=ev.data;
        if(msg.type==="progress"){setProgress(msg.pct);return;}
        if(msg.type==="error"){setParseError(msg.message);finish();return;}
        if(msg.type!=="projects")return;
        rowsRef.current=msg.nieuw; // bestaande werknummers worden overgeslagen
        setWarning(msg.warning);
        setPreview({
          total:msg.total,duplicaten:msg.duplicaten,
          nieuwCount:msg.nieuw.length,bestaandCount:msg.bestaand.length,ongeldigCount:msg.ongeldig.length,
          nieuwSample:msg.nieuw.slice(0,PREVIEW_LIMIT),
          bestaandSample:msg.bestaand.slice(0,PREVIEW_LIMIT),
          ongeldigSample:msg.ongeldig.slice(0,PREVIEW_LIMIT),
          missingColumns:msg.missingColumns,
        });
        setStep("preview");
        finish();
      };
      worker.onerror=()=>{setParseError("Fout bij het lezen van het bestand. Zorg dat het een geldig .xlsx of .xls bestand is.");finish();};
      const req:ImportWorkerRequest={
        mode:"projects",buffer:buf,
        existingWorkNumbers:projects.map(p=>werkKey(p.werknummer)).filter(Boolean),
      };
      worker.postMessage(req,[buf]);
    }catch(err){
      console.error(err);
      setParseError("Fout bij het lezen van het bestand. Zorg dat het een geldig .xlsx of .xls bestand is.");
      finish();
    }
  };

  const handleImport=async()=>{
    if(!preview||importing||rowsRef.current.length===0)return;
    setImporting(true);
    try{await onImport(rowsRef.current);}
    finally{setImporting(false);}
  };

  return <Modal title="Excel importeren" onClose={onClose} width="max-w-2xl">
    <div className="p-4 md:p-6 space-y-4">
      {step==="upload"&&<>
        <p className="text-sm text-[#5F6673]">Upload uw originele Excel-bestand. De importer herkent de kolommen aan de namen in de kopregel — u hoeft niets te hernoemen of te herordenen.</p>
        <div className={`border-2 border-dashed border-[rgba(15,23,42,0.15)] rounded-md p-8 text-center transition-colors ${loading?"opacity-60 cursor-not-allowed":"hover:border-[#1E3A7B] cursor-pointer"}`} onClick={()=>{if(!loading)fileRef.current?.click();}}>
          <Table2 className="w-10 h-10 text-[#5F6673] mx-auto mb-3"/>
          <p className="text-sm font-semibold text-[#23272F] mb-1">Klik om Excel-bestand te selecteren</p>
          <p className="text-xs text-[#9AA1AD]">.xlsx, .xls</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" disabled={loading}
            onChange={e=>{if(e.target.files?.[0])void parseFile(e.target.files[0]);}}/>
        </div>
        {loading&&<div className="space-y-2">
          <p className="text-center text-sm text-[#5F6673]">Excelbestand verwerken… {progress}%</p>
          <div className="h-1.5 rounded-full bg-[#F2F4F7] overflow-hidden"><div className="h-full bg-[#1E3A7B] transition-all" style={{width:`${progress}%`}}/></div>
        </div>}
        {parseError&&<div className="bg-[#FDE4E0] border border-[#F6C7BF] rounded-md p-3 text-sm text-[#A42A1E]">{parseError}</div>}
        <div className="bg-[#F2F4F7] rounded-md p-4 space-y-3 text-xs">
          <p className="font-semibold text-[#5F6673]">Verwachte kolommen</p>
          <table className="w-full text-left text-[#5F6673]">
            <thead><tr className="border-b border-[rgba(15,23,42,0.1)]"><th className="py-1 font-semibold text-[#23272F]">Excel kolom</th><th className="py-1 font-semibold text-[#23272F]">Veld</th><th className="py-1 font-semibold text-[#23272F]">Verplicht</th></tr></thead>
            <tbody className="divide-y divide-[rgba(15,23,42,0.06)]">
              {[
                ["Werknr.","Werknummer (uniek)","✓"],
                ["S","Status",""],
                ["A/R","A/R",""],
                ["Type","Type / afdeling",""],
                ["Calculatie.Code","Calculatiecode",""],
                ["Projectl.","Calculator",""],
                ["Vestiging","Vestiging",""],
                ["Naam opdrachtgever","Opdrachtgever",""],
                ["Straat object","Adres",""],
                ["Plaats object","Plaats",""],
                ["Opmerkingen","Opmerkingen",""],
              ].map(([col,veld,req])=><tr key={col}><td className="py-1 tabular-nums">{col}</td><td className="py-1">{veld}</td><td className="py-1 text-[#1E3A7B] font-bold">{req}</td></tr>)}
            </tbody>
          </table>
          <div className="flex items-start gap-2 bg-[#FEF3DC] rounded-[10px] px-3 py-2">
            <span className="text-[#C98208] flex-shrink-0 font-bold">★</span>
            <p className="text-[#8A5300]"><strong>Turnkey</strong> = alle 3 afdelingen. <strong>Combinatie</strong> = meerdere afdelingen. <strong>Schilderwerk binnen/buiten</strong>, <strong>Stoffering klein/groot</strong>, <strong>Zonwering binnen/buiten</strong> worden automatisch herkend.</p>
          </div>
        </div>
      </>}
      {step==="preview"&&preview&&<>
        {preview.missingColumns.length>0&&<div className="bg-[#FEF3DC] border border-[#F6DCA5] rounded-md p-3 text-xs text-[#8A5300]">
          Deze kolomkoppen zijn niet in het bestand gevonden: <strong>{preview.missingColumns.join(", ")}</strong>. Deze velden blijven leeg.
        </div>}
        {warning&&<div className="bg-[#FEF3DC] border border-[#F6DCA5] rounded-md p-3 text-xs text-[#8A5300]">{warning}</div>}
        <div className="grid grid-cols-4 gap-2 md:gap-3">
          <div className="bg-[#F2F4F7] rounded-md p-3 text-center">
            <p className="text-xl font-bold text-[#23272F]">{preview.total}</p>
            <p className="text-[10px] text-[#5F6673] font-medium">Rijen gelezen</p>
          </div>
          <div className="bg-[#E2F6EA] rounded-md p-3 text-center">
            <p className="text-xl font-bold text-[#16774A]">{preview.nieuwCount}</p>
            <p className="text-[10px] text-[#1F8A55] font-medium">Nieuw</p>
          </div>
          <div className="bg-[#FEF3DC] rounded-md p-3 text-center">
            <p className="text-xl font-bold text-[#8A5300]">{preview.bestaandCount}</p>
            <p className="text-[10px] text-[#9A6100] font-medium">Wordt overgeslagen (bestaat al)</p>
          </div>
          <div className="bg-[#FDE4E0] rounded-md p-3 text-center">
            <p className="text-xl font-bold text-[#A42A1E]">{preview.ongeldigCount}</p>
            <p className="text-[10px] text-[#B3301F] font-medium">Ongeldig</p>
          </div>
        </div>
        {preview.duplicaten>0&&<p className="text-xs text-[#5F6673]">{preview.duplicaten} dubbel{preview.duplicaten!==1?"e":""} werknummer{preview.duplicaten!==1?"s":""} in het bestand samengevoegd.</p>}
        {preview.nieuwCount>0&&<div>
          <p className="text-xs font-semibold text-[#5F6673] mb-2">Te importeren ({preview.nieuwCount})</p>
          <div className="max-h-52 overflow-y-auto space-y-1.5">
            {preview.nieuwSample.map((r,i)=><div key={i} className="flex items-center gap-2 p-2.5 bg-[#E2F6EA] rounded-[10px] text-xs flex-wrap">
              <span className="tabular-nums text-[#16774A] flex-shrink-0 min-w-12">{r.werknummer}</span>
              <span className="font-medium text-[#23272F] flex-1 min-w-0 truncate">{r.projectnaam}</span>
              {r.opdrachtgever&&<span className="text-[#5F6673] truncate max-w-28">{r.opdrachtgever}</span>}
              {r.projectleider&&<span className="text-[#5F6673] italic truncate max-w-20">{r.projectleider}</span>}
              {r.turnkey
                ?<span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white flex-shrink-0" style={{background:"linear-gradient(90deg,#26A69A 33%,#EF6A50 33% 66%,#F2A43A 66%)"}}>Turnkey</span>
                :<span className="flex gap-0.5 flex-shrink-0">{r.afdelingen.map(a=><span key={a} className="w-2 h-2 rounded-full" style={{backgroundColor:DEFAULT_DC[a].bg}} title={a}/>)}</span>
              }
            </div>)}
            {preview.nieuwCount>PREVIEW_LIMIT&&<p className="text-xs text-[#5F6673] px-1">Nog {preview.nieuwCount-PREVIEW_LIMIT} andere regels.</p>}
          </div>
        </div>}
        {preview.bestaandCount>0&&<div>
          <p className="text-xs font-semibold text-[#5F6673] mb-2">Wordt overgeslagen (bestaat al) ({preview.bestaandCount})</p>
          <div className="max-h-28 overflow-y-auto space-y-1">
            {preview.bestaandSample.map((r,i)=><div key={i} className="flex items-center gap-2 p-2 bg-[#FEF3DC] rounded-[10px] text-xs">
              <span className="tabular-nums text-[#8A5300] flex-shrink-0">{r.werknummer}</span>
              <span className="text-[#5F6673] truncate">{r.projectnaam}</span>
            </div>)}
            {preview.bestaandCount>PREVIEW_LIMIT&&<p className="text-xs text-[#5F6673] px-1">Nog {preview.bestaandCount-PREVIEW_LIMIT} andere regels.</p>}
          </div>
        </div>}
        {preview.ongeldigCount>0&&<div>
          <p className="text-xs font-semibold text-[#5F6673] mb-2">Ongeldig — niet geïmporteerd ({preview.ongeldigCount})</p>
          <div className="max-h-28 overflow-y-auto space-y-1">
            {preview.ongeldigSample.map((r,i)=><div key={i} className="flex items-start gap-2 p-2 bg-[#FDE4E0] rounded-[10px] text-xs">
              <span className="text-[#B5503F] tabular-nums flex-shrink-0">R{r.rowIndex}</span>
              <span className="text-[#A42A1E]">{r.invalidReason}</span>
            </div>)}
            {preview.ongeldigCount>PREVIEW_LIMIT&&<p className="text-xs text-[#5F6673] px-1">Nog {preview.ongeldigCount-PREVIEW_LIMIT} andere regels met een fout.</p>}
          </div>
        </div>}
        <div className="flex gap-2 justify-between pt-2 border-t border-[rgba(15,23,42,0.08)]">
          <Btn variant="secondary" onClick={()=>{setStep("upload");setPreview(null);setParseError("");rowsRef.current=[];}} disabled={importing}>Terug</Btn>
          <Btn onClick={handleImport} disabled={importing||preview.nieuwCount===0}>
            <Download className="w-4 h-4"/>
            {importing?"Bezig met importeren…":`${preview.nieuwCount} werk${preview.nieuwCount!==1?"en":""} importeren`}
          </Btn>
        </div>
      </>}
    </div>
  </Modal>;
}


// ===== VACATION IMPORT MODAL =====
export interface VacRow {
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
export interface VacPreview { total:number; rows:VacRow[]; }

export function VacationImportModal({employees,projects,availability,onImport,onClose}:{
  employees:Employee[];projects:Project[];availability:AvailEntry[];
  onImport:(entries:AvailEntry[])=>void|Promise<void>;onClose:()=>void;
}){
  const [step,setStep]=useState<"upload"|"preview">("upload");
  const [preview,setPreview]=useState<VacPreview|null>(null);
  const [loading,setLoading]=useState(false);
  const [progress,setProgress]=useState(0);
  const [parseError,setParseError]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  const busyRef=useRef(false);
  const workerRef=useRef<Worker|null>(null);
  useEffect(()=>()=>{workerRef.current?.terminate();},[]);
  const [importing,setImporting]=useState(false);


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

  const parseFile=async(file:File)=>{
    if(busyRef.current)return;
    busyRef.current=true;
    setLoading(true);setProgress(0);setParseError("");
    const finish=()=>{
      setLoading(false);busyRef.current=false;
      if(fileRef.current)fileRef.current.value="";
      workerRef.current?.terminate();workerRef.current=null;
    };
    try{
      const buf=await file.arrayBuffer();
      const worker=createImportWorker();
      workerRef.current=worker;
      worker.onmessage=(ev:MessageEvent<ImportWorkerResponse>)=>{
        const msg=ev.data;
        if(msg.type==="progress"){setProgress(msg.pct);return;}
        if(msg.type==="error"){setParseError(msg.message);finish();return;}
        if(msg.type!=="avail")return;
        // Medewerkermatching, duplicaten en conflicten: alleen op de hoofdthread mogelijk
        const rows:VacRow[]=msg.rows.map((b:VacBaseRow)=>{
          const{emp,ambiguous}=matchEmployee(b.rawName);
          let conflicts:{date:string;project:Project}[]=[];
          let duplicateDates:string[]=[];
          let entriesToCreate:AvailEntry[]=[];
          const status=b.status as AvailStatus;
          if(!b.invalidReason&&emp&&b.startDate){
            const allEntries=buildEntries(emp,b.startDate,b.endDate,b.startTime,b.endTime,status,b.note);
            entriesToCreate=allEntries.filter(e=>!isDuplicate(e));
            duplicateDates=allEntries.filter(e=>isDuplicate(e)).map(e=>e.date);
            conflicts=findConflicts(emp,b.startDate,b.endDate);
          }
          return{...b,status,matchedEmployee:emp,ambiguous,conflicts,duplicateDates,entriesToCreate};
        });
        setPreview({total:msg.total,rows});
        setStep("preview");
        finish();
      };
      worker.onerror=()=>{setParseError("Fout bij het lezen van het bestand.");finish();};
      const req:ImportWorkerRequest={mode:"avail",buffer:buf};
      worker.postMessage(req,[buf]);
    }catch(err){
      console.error(err);
      setParseError("Fout bij het lezen van het bestand.");
      finish();
    }
  };


  const handleImport=async()=>{
    if(!preview||importing)return;
    const all=preview.rows.flatMap(r=>r.matchedEmployee&&!r.ambiguous&&!r.invalidReason?r.entriesToCreate:[]);
    setImporting(true);
    try{await onImport(all);}
    finally{setImporting(false);}
  };

  if(!preview||step==="upload")return <Modal title="Beschikbaarheid importeren" onClose={onClose} width="max-w-xl">
    <div className="p-4 md:p-6 space-y-4">
      <p className="text-sm text-[#5F6673]">Upload een Excel-bestand met beschikbaarheid (vakantie, ziek, vrij, beschikbaar…). Bestaande planning wordt <strong>niet</strong> overschreven.</p>

      <div className="border-2 border-dashed border-[rgba(15,23,42,0.15)] rounded-md p-8 text-center hover:border-[#1E3A7B] transition-colors cursor-pointer" onClick={()=>fileRef.current?.click()}>
        <Calendar className="w-10 h-10 text-[#5F6673] mx-auto mb-3"/>
        <p className="text-sm font-semibold text-[#23272F] mb-1">Klik om Excel-bestand te selecteren</p>
        <p className="text-xs text-[#9AA1AD]">.xlsx, .xls</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" disabled={loading} onChange={e=>{if(e.target.files?.[0])void parseFile(e.target.files[0]);}}/>
      </div>
      {loading&&<div className="space-y-2"><p className="text-center text-sm text-[#5F6673]">Bestand verwerken… {progress}%</p><div className="h-1.5 rounded-full bg-[#F2F4F7] overflow-hidden"><div className="h-full bg-[#1E3A7B] transition-all" style={{width:`${progress}%`}}/></div></div>}
      {parseError&&<div className="bg-[#FDE4E0] border border-[#F6C7BF] rounded-md p-3 text-sm text-[#A42A1E]">{parseError}</div>}
      <div className="bg-[#F2F4F7] rounded-md p-4 text-xs space-y-2">
        <p className="font-semibold text-[#5F6673]">Verwachte kolommen</p>
        <table className="w-full text-left text-[#5F6673]">
          <tbody className="divide-y divide-[rgba(15,23,42,0.06)]">
            {[["Medewerker / Naam","Naam medewerker","✓"],["Startdatum","Eerste dag","✓"],["Einddatum","Laatste dag",""],["Starttijd","Begin (HH:MM)",""],["Eindtijd","Einde (HH:MM)",""],["Status / Type","Beschikbaar, Ingepland, Niet beschikbaar, Vakantie, Ziek, Vrij",""],["Notitie","Vrije tekst",""]].map(([col,desc,req])=>
              <tr key={col}><td className="py-1 tabular-nums pr-2">{col}</td><td className="py-1 text-[#9AA1AD]">{desc}</td><td className="py-1 text-[#1E3A7B] font-bold">{req}</td></tr>
            )}
          </tbody>
        </table>
        <p className="text-[#9AA1AD] pt-1">Als Einddatum ontbreekt → alleen Startdatum. Zonder tijden → volledige werkdag (08:00–17:00).</p>
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
        {[{label:"Rijen gelezen",val:preview.total,cls:"bg-[#F2F4F7] text-[#23272F]"},{label:"Nieuw aan te maken",val:totalNew,cls:"bg-[#E2F6EA] text-[#16774A]"},{label:"Al bestaand",val:totalDup,cls:"bg-[#FEF3DC] text-[#8A5300]"},{label:"Conflicten",val:conflictRows.length,cls:conflictRows.length?"bg-[#FDE4E0] text-[#A42A1E]":"bg-[#F2F4F7] text-[#5F6673]"}].map(s=>
          <div key={s.label} className={`rounded-md p-3 text-center ${s.cls}`}>
            <p className="text-xl font-bold">{s.val}</p>
            <p className="text-[10px] font-medium mt-0.5">{s.label}</p>
          </div>
        )}
      </div>

      {/* Import rows */}
      {validRows.length>0&&<div>
        <p className="text-xs font-semibold text-[#5F6673] mb-2">Te importeren ({validRows.length} medewerkers)</p>
        <div className="max-h-56 overflow-y-auto space-y-1.5">
          {validRows.map((r,i)=><div key={i} className={`flex items-center gap-2 p-2.5 rounded-[10px] text-xs flex-wrap ${r.conflicts.length?"bg-[#FEF3DC] border border-[#F6DCA5]":"bg-[#E2F6EA]"}`}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{backgroundColor:DEFAULT_DC[r.matchedEmployee!.afdeling].bg}}>{r.matchedEmployee!.naam.slice(0,1)}</div>
            <span className="font-medium text-[#23272F] flex-shrink-0">{r.matchedEmployee!.naam}</span>
            <span className="text-[#5F6673]">{fmtDate(r.startDate)}{r.endDate!==r.startDate&&` – ${fmtDate(r.endDate)}`}</span>
            {r.hasExplicitTimes&&<span className="text-[#5F6673]">{r.startTime}–{r.endTime}</span>}
            <span className="px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 text-[10px]" style={{backgroundColor:AS[r.status].bg,color:AS[r.status].text}}>{r.status}</span>
            {r.entriesToCreate.length>0&&<span className="text-[#1F8A55] font-semibold flex-shrink-0">+{r.entriesToCreate.length} dag{r.entriesToCreate.length!==1?"en":""}</span>}
            {r.duplicateDates.length>0&&<span className="text-[#9A6100] flex-shrink-0">{r.duplicateDates.length}× al bestaand</span>}
            {r.conflicts.length>0&&<span className="text-[#8A5300] font-semibold flex-shrink-0 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" aria-hidden="true"/>{r.conflicts.length} conflict{r.conflicts.length!==1?"en":""}</span>}
          </div>)}
        </div>
      </div>}

      {/* Conflicts */}
      {conflictRows.length>0&&<div>
        <p className="text-xs font-semibold text-[#8A5300] mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true"/>Conflicten — projectplanning overlapt</p>
        <div className="max-h-40 overflow-y-auto space-y-1.5 bg-[#FEF3DC] rounded-md p-3">
          {conflictRows.flatMap(r=>r.conflicts.map((c,ci)=><div key={`${r.rowIndex}-${ci}`} className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#23272F] flex-shrink-0">{r.matchedEmployee!.naam}</span>
            <span className="text-[#5F6673]">·</span>
            <span className="text-[#23272F] truncate">{c.project.projectnaam}</span>
            <span className="text-[#5F6673] tabular-nums flex-shrink-0">{c.project.werknummer}</span>
            <span className="text-[#8A5300] flex-shrink-0">{fmtDate(c.date)}</span>
          </div>))}
          <p className="text-[10px] text-[#9A6100] pt-1">De projectplanning wordt <strong>niet</strong> verwijderd. De vakantie wordt naast de bestaande planning toegevoegd.</p>
        </div>
      </div>}

      {/* Unmatched */}
      {unmatchedRows.length>0&&<div>
        <p className="text-xs font-semibold text-[#5F6673] mb-2">Niet gevonden ({unmatchedRows.length})</p>
        <div className="max-h-24 overflow-y-auto space-y-1">
          {unmatchedRows.map((r,i)=><div key={i} className="flex items-center gap-2 p-2 bg-[#F2F4F7] rounded-[10px] text-xs">
            <span className="tabular-nums text-[#5F6673]">R{r.rowIndex}</span>
            <span className="font-medium text-[#23272F]">"{r.rawName}"</span>
            <span className="text-[#5F6673]">{r.ambiguous?"Meerdere medewerkers gevonden — specificeer in Excel":"Medewerker niet gevonden"}</span>
          </div>)}
        </div>
      </div>}

      {/* Invalid */}
      {invalidRows.length>0&&<div>
        <p className="text-xs font-semibold text-[#5F6673] mb-2">Ongeldig ({invalidRows.length})</p>
        <div className="max-h-24 overflow-y-auto space-y-1">
          {invalidRows.map((r,i)=><div key={i} className="flex items-start gap-2 p-2 bg-[#FDE4E0] rounded-[10px] text-xs">
            <span className="text-[#B5503F] tabular-nums flex-shrink-0">R{r.rowIndex}</span>
            <span className="text-[#A42A1E]">{r.invalidReason}</span>
          </div>)}
        </div>
      </div>}

      <div className="flex gap-2 justify-between pt-2 border-t border-[rgba(15,23,42,0.08)]">
        <Btn variant="secondary" onClick={()=>{setStep("upload");setPreview(null);setParseError("");}} disabled={importing}>Terug</Btn>
        <Btn onClick={handleImport} disabled={importing||totalNew===0}>
          <Check className="w-4 h-4"/>
          {importing?"Bezig met importeren…":`${totalNew} tijdblok${totalNew!==1?"ken":""} importeren`}
        </Btn>
      </div>
    </div>
  </Modal>;
}

