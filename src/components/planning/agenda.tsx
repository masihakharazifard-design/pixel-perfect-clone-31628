// Onderdeel van de planning-app (uit planning-app.tsx gehaald om het overzichtelijk te houden).
import { useState, useRef, useEffect, useMemo } from "react";
import { Users, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { feestdagOp } from "@/lib/feestdagen";
import { toDateStr, shiftDate, isWeekendStr, verschuifMetSprong } from "@/lib/werkdagen";
import { werkKey } from "@/lib/excel-parse";
import { Afdeling, CalView, Project, Employee, AvailEntry, WORKDAY_START, WORKDAY_END, toMin, fromMin, useDC, DAYS_NL, DAYS_FULL, MONTHS_NL, AFDS, HOUR_HEIGHT, BASE_HOUR, HOURS, TODAY_STR, validDate, fmtDate, fmtTime, datePart, timePart, combineLocalDT, sameDay, getDHol, getSHols, projLabel, agendaEmpNames, agendaLabel, getDatesInRange, getWeekNumber, getAllAfds, agendaProjStyle, projectPlans, isGeblokkeerd, metMeeschuiven, getMonthWeeks, getWeekDays, layoutWeek, Btn, regioVan, regioOpties, RegioFilter, Select } from "./basis";
import { vraagNotitie } from "./schermen";

// ===== AGENDA - MONTH VIEW =====
export function MonthView({year,month,projects,employees,schoolRegions,onClickProject,onClickDate,onDropProject,showWeekNumbers}:{
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
    <div className={`grid border-b border-[rgba(15,23,42,0.08)]`} style={{gridTemplateColumns:showWeekNumbers?"28px repeat(7,1fr)":"repeat(7,1fr)"}}>
      {showWeekNumbers&&<div className="py-2 text-center text-[10px] font-semibold text-[#9AA1AD]">Wk</div>}
      {DAYS_NL.map(d=><div key={d} className="py-2 text-center text-xs font-semibold text-[#5F6673]">{d}</div>)}
    </div>
    {weeks.map((week,wi)=>{
      const evs=layoutWeek(week,projects);
      const maxSlot=evs.length?Math.max(...evs.map(e=>e.slot)):-1;
      const rowH=Math.max(88,36+(maxSlot+1)*22+6);
      const wn=getWeekNumber(week[0]);
      return <div key={wi} className="relative border-b border-[rgba(15,23,42,0.06)]" style={{height:rowH}}>
        <div className="absolute inset-0" style={{display:"grid",gridTemplateColumns:showWeekNumbers?"28px repeat(7,1fr)":"repeat(7,1fr)"}}>
          {showWeekNumbers&&<div className="border-r border-[rgba(15,23,42,0.06)] flex items-start justify-center pt-1">
            <span className="text-[10px] text-[#9AA1AD] font-medium">W{wn}</span>
          </div>}
          {week.map((day,di)=>{
            const ds=toDateStr(day);
            const isToday=ds===TODAY_STR;
            const inMonth=day.getMonth()===month;
            const hol=getDHol(ds);
            const shols=getSHols(ds,schoolRegions);
            const isDragOver=dragOverDate===ds;
            return <div key={di} className={`border-r border-[rgba(15,23,42,0.06)] p-1 cursor-pointer transition-colors ${!inMonth?"opacity-35":""}${isDragOver?" bg-[#EEF1F5]":hol?" bg-[#FDE4E0]/50":""}`}
              onDragOver={e=>{e.preventDefault();setDragOverDate(ds);}}
              onDragLeave={()=>setDragOverDate(null)}
              onDrop={e=>handleDrop(e,day)}
              onClick={()=>onClickDate(day)}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${isToday?"bg-[#1E3A7B] text-white":"text-[#23272F]"}`}>{day.getDate()}</div>
              {hol&&<div className="text-[10px] text-[#B5503F] leading-tight truncate mt-0.5">{hol}</div>}
              {shols.length>0&&<div className="text-[10px] text-[#C2362A] leading-tight truncate">{shols[0].name.split(" ")[0]}</div>}
            </div>;
          })}
        </div>
        {evs.map(ev=>{
          // Zelfde maatvoering als het raster: vaste weeknummerkolom (28px) + 7 gelijke dagkolommen
          const wk=showWeekNumbers?28:0;
          const span=ev.ec-ev.sc+1;
          const top=36+ev.slot*22;
          const st=agendaProjStyle(ev.project,dc);
          const label=agendaLabel(ev.project,employees);
          return <div key={ev.project.id} draggable title={label}
            onDragStart={e=>handleDragStart(e,ev.project,week[ev.sc])}
            onClick={e=>{e.stopPropagation();onClickProject(ev.project);}}
            className="absolute h-5 rounded flex items-center text-white text-xs font-medium px-1.5 cursor-grab hover:brightness-110 transition-all z-10 overflow-hidden select-none"
            style={{left:`calc(${wk}px + (100% - ${wk}px) * ${ev.sc} / 7 + 2px)`,width:`calc((100% - ${wk}px) * ${span} / 7 - 4px)`,top,...st,borderRadius:ev.cl?"0 4px 4px 0":ev.cr?"4px 0 0 4px":"4px"}}>
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
export function WeekView({weekDays,projects,employees,onClickProject,onClickDateTime,onDropProject,onResizeProject}:{
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
    <div className="flex border-b border-[rgba(15,23,42,0.08)]">
      <div className="w-14 flex-shrink-0 flex items-end justify-center pb-1"><span className="text-[10px] text-[#9AA1AD] font-medium">Wk{wn}</span></div>
      {weekDays.map((d,i)=>{const ds=toDateStr(d);const hol=getDHol(ds);const isT=ds===TODAY_STR;return <div key={i} className={`flex-1 py-2 text-center border-l border-[rgba(15,23,42,0.06)] ${hol?"bg-[#FDE4E0]/40":""}`}>
        <p className={`text-xs font-semibold ${isT?"text-[#1E3A7B]":"text-[#5F6673]"}`}>{DAYS_NL[i]}</p>
        <p className={`text-sm font-bold ${isT?"text-[#23272F]":"text-[#5F6673]"}`}>{d.getDate()}</p>
        {hol&&<p className="text-[10px] text-[#E0574A] truncate px-1">{hol}</p>}
      </div>;})}
    </div>
    <div className="flex border-b border-[rgba(15,23,42,0.08)]" style={{minHeight:adH}}>
      <div className="w-14 flex-shrink-0 flex items-center justify-end pr-2"><span className="text-[10px] text-[#5F6673]">All-day</span></div>
      <div className="flex-1 relative" style={{height:adH}}>
        <div className="grid grid-cols-7 h-full absolute inset-0">{weekDays.map((_,i)=><div key={i} className="border-l border-[rgba(15,23,42,0.06)]"/>)}</div>
        {allDayEvs.map(ev=>{const st=agendaProjStyle(ev.project,dc);const lbl=agendaLabel(ev.project,employees);return <div key={ev.project.id} title={lbl} onClick={()=>onClickProject(ev.project)} draggable className="absolute h-5 rounded text-white text-xs font-medium px-1.5 flex items-center cursor-pointer hover:brightness-110 z-10 overflow-hidden" style={{left:`${ev.sc/7*100+0.3}%`,width:`${(ev.ec-ev.sc+1)/7*100-0.6}%`,top:6+ev.slot*22,...st}}><span className="truncate">{lbl}</span></div>;})}
      </div>
    </div>
    <div className="flex flex-1 overflow-y-auto">
      <div className="w-14 flex-shrink-0">
        {HOURS.map(h=><div key={h} style={{height:HOUR_HEIGHT}} className="border-b border-[rgba(15,23,42,0.04)] flex items-start justify-end pr-2 pt-0.5"><span className="text-[10px] text-[#9AA1AD]">{String(h).padStart(2,"0")}:00</span></div>)}
      </div>
      <div className="flex-1 grid grid-cols-7">
        {weekDays.map((day,di)=>{
          const dayProjs=tdProjects.filter(p=>sameDay(new Date(p.startdatum),day));
          return <div key={di} className="relative border-l border-[rgba(15,23,42,0.06)]" style={{height:HOURS.length*HOUR_HEIGHT}}>
            {HOURS.map(h=>{
              const slotKey=`${toDateStr(day)}-${h}`;
              return <div key={h} style={{height:HOUR_HEIGHT}} className={`border-b border-[rgba(15,23,42,0.04)] cursor-pointer transition-colors ${dragOverSlot===slotKey?"bg-[#EEF1F5]":""}`}
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
                className="absolute left-0.5 right-0.5 rounded-[10px] overflow-hidden cursor-grab text-white text-xs z-10 shadow-sm hover:shadow-md transition-shadow"
                style={{top,height:h,...st}}>
                <div className="p-1.5 h-full flex flex-col">
                  <p className="font-semibold truncate" title={agendaLabel(p,employees)}>{projLabel(p,employees)}</p>
                  <p className="opacity-80 text-[10px]">{fmtTime(s)} – {fmtTime(e)}</p>
                  {agendaEmpNames(p,employees)&&<p className="opacity-90 text-[10px] truncate">{agendaEmpNames(p,employees)}</p>}
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
export function DayView({date,projects,employees,onClickProject,onClickTime,onDropProject,onResizeProject}:{
  date:Date;projects:Project[];employees:Employee[];
  onClickProject:(p:Project)=>void;onClickTime:(h:number)=>void;
  onDropProject:(id:string,newStart:Date)=>void;
  onResizeProject:(id:string,newEnd:Date)=>void;
}){
  const dc=useDC();
  const selectedDateKey=toDateStr(date);
  // Alleen werken die binnen deze ene dag vallen krijgen een tijdblok; meerdaagse werken staan bovenaan (één keer)
  const dayProjs=projects.filter(p=>datePart(p.startdatum)===selectedDateKey&&datePart(p.afloopdatum)===selectedDateKey&&!!timePart(p.startdatum));
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
    <div className={`flex items-center gap-4 p-4 border-b border-[rgba(15,23,42,0.08)] ${hol?"bg-[#FDE4E0]/30":""}`}>
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl ${isT?"bg-[#1E3A7B] text-white":"bg-[#F2F4F7] text-[#23272F]"}`}>{date.getDate()}</div>
      <div>
        <p className="font-bold text-lg text-[#23272F]">{DAYS_FULL[(date.getDay()+6)%7]} {date.getDate()} {MONTHS_NL[date.getMonth()]}</p>
        <p className="text-xs text-[#5F6673]">Week {wn}{hol&&<span className="text-[#B5503F] ml-2">{hol}</span>}</p>
      </div>
      <div className="flex flex-wrap gap-1 ml-2">
        {allDay.map(p=><button key={p.id} title={agendaLabel(p,employees)} onClick={()=>onClickProject(p)} className="px-3 py-1 rounded-full text-xs font-medium text-white cursor-pointer hover:opacity-80 transition-opacity" style={agendaProjStyle(p,dc)}>{p.projectnaam}{agendaEmpNames(p,employees)?` · ${agendaEmpNames(p,employees)}`:""}</button>)}
      </div>
    </div>
    <div className="flex flex-1 overflow-y-auto">
      <div className="w-16 flex-shrink-0">
        {HOURS.map(h=><div key={h} style={{height:HOUR_HEIGHT}} className="flex items-start justify-end pr-3 pt-0.5 border-b border-[rgba(15,23,42,0.04)]"><span className="text-[10px] text-[#9AA1AD]">{String(h).padStart(2,"0")}:00</span></div>)}
      </div>
      <div className="flex-1 relative border-l border-[rgba(15,23,42,0.08)]" style={{height:HOURS.length*HOUR_HEIGHT}}>
        {HOURS.map(h=><div key={h} style={{height:HOUR_HEIGHT}} className="border-b border-[rgba(15,23,42,0.04)] hover:bg-[#F8F9FB] cursor-pointer transition-colors"
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
            className="absolute left-2 right-2 rounded-md overflow-hidden cursor-grab text-white shadow-sm hover:shadow-md z-10 transition-shadow"
            style={{top,height:ht,...st}}>
            <div className="p-3 h-full">
              <p className="font-bold text-sm truncate">{projLabel(p,employees)}</p>
              <p className="opacity-80 text-xs">{fmtTime(s)} – {fmtTime(e)}</p>
              {agendaEmpNames(p,employees)&&<p className="text-xs mt-1 truncate flex items-center gap-1"><Users className="w-3 h-3 flex-shrink-0" aria-hidden="true"/>{agendaEmpNames(p,employees)}</p>}
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
export function KwartaalView({year,quarter,projects,employees,schoolRegions,onClickProject,onClickDate,onDropProject,showWeekNumbers}:{
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
    <div className="grid grid-cols-3 min-h-full divide-x divide-[rgba(15,23,42,0.08)]">
      {months.map(month=>{
        const weeks=getMonthWeeks(year,month);
        return <div key={month} className="flex flex-col">
          <div className="px-4 py-3 bg-[#F8F9FB] border-b border-[rgba(15,23,42,0.08)] sticky top-0 z-10">
            <h3 className="font-bold text-sm text-[#23272F]">{MONTHS_NL[month]} {year}</h3>
          </div>
          <div className="grid border-b border-[rgba(15,23,42,0.06)]" style={{gridTemplateColumns:showWeekNumbers?"24px repeat(7,1fr)":"repeat(7,1fr)"}}>
            {showWeekNumbers&&<div className="py-1.5 text-center text-[10px] font-semibold text-[#9AA1AD]">W</div>}
            {DAYS_NL.map(d=><div key={d} className="py-1.5 text-center text-[10px] font-semibold text-[#5F6673]">{d}</div>)}
          </div>
          {weeks.map((week,wi)=>{
            const evs=layoutWeek(week,projects);
            const maxSlot=evs.length?Math.max(...evs.map(e=>e.slot)):-1;
            const rowH=Math.max(60,26+(maxSlot+1)*18+4);
            const wn=getWeekNumber(week[0]);
            return <div key={wi} className="relative border-b border-[rgba(15,23,42,0.05)]" style={{height:rowH}}>
              <div className="absolute inset-0" style={{display:"grid",gridTemplateColumns:showWeekNumbers?"24px repeat(7,1fr)":"repeat(7,1fr)"}}>
                {showWeekNumbers&&<div className="border-r border-[rgba(15,23,42,0.05)] flex items-start justify-center pt-0.5">
                  <span className="text-[10px] text-[#9AA1AD] font-medium">W{wn}</span>
                </div>}
                {week.map((day,di)=>{
                  const ds=toDateStr(day);
                  const isToday=ds===TODAY_STR;
                  const inMonth=day.getMonth()===month;
                  const hol=getDHol(ds);
                  const shols=getSHols(ds,schoolRegions);
                  const isDragOver=dragOverDate===ds;
                  return <div key={di}
                    className={`border-r border-[rgba(15,23,42,0.05)] p-0.5 cursor-pointer transition-colors ${!inMonth?"opacity-30":""}${isDragOver?" bg-[#EEF1F5]":hol?" bg-[#FDE4E0]/60":""}`}
                    onDragOver={e=>{e.preventDefault();setDragOverDate(ds);}}
                    onDragLeave={()=>setDragOverDate(null)}
                    onDrop={e=>handleDrop(e,day)}
                    onClick={()=>onClickDate(day)}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${isToday?"bg-[#1E3A7B] text-white":"text-[#23272F]"}`}>{day.getDate()}</div>
                    {hol&&<div className="text-[10px] text-[#B5503F] leading-tight truncate">{hol.split(" ")[0]}</div>}
                    {shols.length>0&&!hol&&<div className="text-[10px] text-[#E0402F] leading-tight truncate">{shols[0].name.split(" ")[0]}</div>}
                  </div>;
                })}
              </div>
              {evs.map(ev=>{
                // Zelfde maatvoering als het raster: vaste weeknummerkolom (24px) + 7 gelijke dagkolommen
                const wk=showWeekNumbers?24:0;
                const span=ev.ec-ev.sc+1;
                const top=26+ev.slot*18;
                const st=agendaProjStyle(ev.project,dc);
                const label=agendaLabel(ev.project,employees);
                return <div key={ev.project.id} draggable title={label}
                  onDragStart={e=>handleDragStart(e,ev.project,week[ev.sc])}
                  onClick={e=>{e.stopPropagation();onClickProject(ev.project);}}
                  className="absolute h-4 rounded flex items-center text-white font-medium px-1 cursor-grab hover:brightness-110 transition-all z-10 overflow-hidden select-none"
                  style={{left:`calc(${wk}px + (100% - ${wk}px) * ${ev.sc} / 7 + 1px)`,width:`calc((100% - ${wk}px) * ${span} / 7 - 2px)`,top,...st,fontSize:"9px",borderRadius:ev.cl?"0 3px 3px 0":ev.cr?"3px 0 0 3px":"3px"}}>
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
export function AgendaView({projects,employees,availability,updateProject,onOpenProject,onCreateProject,onSaveManyPlanning}:{
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
  const [regioFilter,setRegioFilter]=useState<string>("");
  const agendaRegios=useMemo(()=>regioOpties(projects),[projects]);
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
    if(regioFilter&&regioVan(p)!==regioFilter)return false;
    return true;
  }).map(p=>validDate(p.afloopdatum)?p:{...p,afloopdatum:(()=>{const d=new Date(p.startdatum);d.setHours(17,0,0,0);return d.toISOString();})()});
  // Elk werk staat maar één keer in de Agenda. Werken met hetzelfde werknummer (dubbel ingelezen
  // werken) tellen als één werk: al hun planningregels (alle medewerkers) vormen samen één blok.
  // Het blok wordt alleen onderbroken waar geen planning is (zoals het weekend): elke reeks
  // aaneengesloten ingeplande dagen is één blok, zodat zaterdag en zondag leeg blijven.
  const agendaProjects:Project[]=[];
  // Agendablok-id → de planningregels die erbij horen
  const blockRowsById=new Map<string,AvailEntry[]>();
  const groups=new Map<string,Project[]>();
  filteredProjects.forEach(p=>{const k=werkKey(p.werknummer)||"id:"+p.id;groups.set(k,[...(groups.get(k)||[]),p]);});
  groups.forEach(list=>{
    const withRows=list.map(p=>({p,rows:projectPlans(availability,p.id)}));
    const rows=withRows.flatMap(x=>x.rows);
    // Hoofdwerk: het werk met de meeste planningregels (anders het eerste)
    const main=[...withRows].sort((a,b)=>b.rows.length-a.rows.length)[0].p;
    if(!rows.length){
      // Werk zonder planningregels: periode uit het werk zelf, zonder zaterdag/zondag.
      const all=getDatesInRange(new Date(main.startdatum),new Date(main.afloopdatum));
      const wd=all.filter(d=>!isWeekendStr(d));
      if(all.length<=1||!wd.length||wd.length===all.length){agendaProjects.push(main);return;}
      const spans:string[][]=[];
      wd.forEach(d=>{const cur=spans[spans.length-1];if(cur&&shiftDate(cur[cur.length-1],1)===d)cur.push(d);else spans.push([d]);});
      const firstDay=all[0],lastDay=all[all.length-1];
      spans.forEach((sp,i)=>{
        const s=sp[0],e=sp[sp.length-1];
        agendaProjects.push({...main,id:`${main.id}~${i}`,
          startdatum:s===firstDay?main.startdatum:combineLocalDT(s,WORKDAY_START,7,0),
          afloopdatum:e===lastDay?main.afloopdatum:combineLocalDT(e,WORKDAY_END,17,0)});
      });
      return;
    }
    // Opsplitsen in reeksen aaneengesloten dagen
    const dates=[...new Set(rows.map(r=>r.date))].sort();
    const runs:string[][]=[];
    dates.forEach(d=>{const cur=runs[runs.length-1];if(cur&&shiftDate(cur[cur.length-1],1)===d)cur.push(d);else runs.push([d]);});
    runs.forEach((run,i)=>{
      const runSet=new Set(run);
      const rs=rows.filter(r=>runSet.has(r.date));
      const first=run[0],last=run[run.length-1];
      const st=rs.filter(r=>r.date===first).map(r=>r.startTime).sort()[0]||WORKDAY_START;
      const et=rs.filter(r=>r.date===last).map(r=>r.endTime).sort().slice(-1)[0]||WORKDAY_END;
      const id=`${main.id}::plan::${i}`;
      blockRowsById.set(id,rs);
      agendaProjects.push({...main,id,medewerkers:[...new Set(rs.map(r=>r.employeeId))].sort(),
        startdatum:combineLocalDT(first,st,7,0),afloopdatum:combineLocalDT(last,et,17,0),
        eersteVanDag:rs.some(r=>r.isFirstOfDay),
        // Agenda kleurt projectblokken uitsluitend op afdeling (geen team-/statuskleur)
        teamKleur:undefined});
    });
  });
  // Agenda toont uitsluitend projecten/projectplanningen; persoonlijke afwezigheid blijft in Personeelsplanning.
  // Agenda-id's: "werk::plan::n" (planningsblok) of "werk~n" (deel van een werk zonder planning)
  const realId=(id:string)=>id.split("::")[0].split("~")[0];
  const isPlanBlock=(id:string)=>id.includes("::");
  // De planningregels achter één agendablok (ook van dubbele werken met hetzelfde werknummer)
  const blockRows=(id:string)=>blockRowsById.get(id)||projectPlans(availability,realId(id));
  const openReal=(vp:Project)=>{const real=projects.find(x=>x.id===realId(vp.id));onOpenProject(real||vp);};
  // Maand/kwartaal: blok verslepen = alle planningregels van het werk verschuiven (weekend blijft leeg).
  // Verschuiven met sprong: dagen waarop de medewerker vrij/afwezig is (of een feestdag) worden overgeslagen,
  // de planning gaat dan verder op de eerstvolgende beschikbare werkdag.
  const verschuifBlok=(rows:AvailEntry[],naar:string)=>{
    const eigen=rows.map(r=>r.id);
    const moved=verschuifMetSprong(rows,naar,(r,d)=>!!feestdagOp(d)||isGeblokkeerd(availability,r.employeeId,d,r.startTime,r.endTime,eigen));
    return moved.length?metMeeschuiven(availability,moved):moved;
  };
  const handleDropProject=(id:string,newStart:Date)=>{
    if(isPlanBlock(id)){
      const moved=verschuifBlok(blockRows(id),toDateStr(newStart));
      if(moved.length){void onSaveManyPlanning(moved);vraagNotitie(realId(id),`Verschoven naar ${fmtDate(toDateStr(newStart))}`);}
      return;
    }
    const p=projects.find(x=>x.id===realId(id));if(!p)return;
    vraagNotitie(p.id,`Verschoven naar ${fmtDate(toDateStr(newStart))}`);
    // Versleept deel van een werk (zonder planning): verschuif het hele werk met hetzelfde aantal dagen
    const seg=id.includes("~")?agendaProjects.find(x=>x.id===id):undefined;
    if(seg){
      const days=Math.round((new Date(toDateStr(newStart)+"T12:00").getTime()-new Date(datePart(seg.startdatum)+"T12:00").getTime())/86400000);
      newStart=new Date(p.startdatum);newStart.setDate(newStart.getDate()+days);
    }
    id=p.id;
    const dur=new Date(p.afloopdatum).getTime()-new Date(p.startdatum).getTime();
    const origStart=new Date(p.startdatum);
    newStart.setHours(origStart.getHours(),origStart.getMinutes(),0,0);
    updateProject(id,{startdatum:newStart.toISOString(),afloopdatum:new Date(newStart.getTime()+dur).toISOString()});
  };
  // Week/dag: blok naar een ander tijdstip slepen. Bij een werk van één dag krijgen alle medewerkers
  // de nieuwe dag en begintijd (duur blijft gelijk); bij meerdere dagen schuift de hele planning mee.
  const handleDropProjectTime=(id:string,newStart:Date)=>{
    if(isPlanBlock(id)){
      const rows=blockRows(id);
      if(!rows.length)return;
      const newDate=toDateStr(newStart);
      vraagNotitie(realId(id),`Verschoven naar ${fmtDate(newDate)}`);
      if(new Set(rows.map(r=>r.date)).size>1){const moved=verschuifBlok(rows,newDate);if(moved.length)void onSaveManyPlanning(moved);return;}
      const newStartMin=newStart.getHours()*60+newStart.getMinutes();
      void onSaveManyPlanning(rows.map(r=>{
        const dur=Math.max(15,toMin(r.endTime)-toMin(r.startTime));
        return {...r,date:newDate,startTime:fromMin(newStartMin),endTime:fromMin(Math.min(24*60-1,newStartMin+dur))};
      }));
      return;
    }
    const p=projects.find(x=>x.id===realId(id));if(!p)return;id=p.id;
    vraagNotitie(p.id,`Verschoven naar ${fmtDate(toDateStr(newStart))}`);
    const dur=new Date(p.afloopdatum).getTime()-new Date(p.startdatum).getTime();
    updateProject(id,{startdatum:newStart.toISOString(),afloopdatum:new Date(newStart.getTime()+dur).toISOString()});
  };
  const handleDropProjectDayTime=handleDropProjectTime;
  // Eindtijd verslepen: bij een werk van één dag krijgen alle regels van die dag de nieuwe eindtijd.
  const handleResize=(id:string,newEnd:Date)=>{
    if(isPlanBlock(id)){
      const rows=blockRows(id);
      if(!rows.length||new Set(rows.map(r=>r.date)).size>1)return;
      const et=fromMin(newEnd.getHours()*60+newEnd.getMinutes());
      const ok=rows.filter(r=>toMin(et)>toMin(r.startTime));
      if(ok.length){void onSaveManyPlanning(ok.map(r=>({...r,endTime:et})));vraagNotitie(realId(id),"Eindtijd aangepast");}
      return;
    }
    updateProject(realId(id),{afloopdatum:newEnd.toISOString()});
    vraagNotitie(realId(id),"Einddatum aangepast");
  };
  const handleClickDate=(d:Date)=>{const s=new Date(d);s.setHours(7,0,0,0);const e=new Date(d);e.setHours(17,0,0,0);onCreateProject({startdatum:s.toISOString(),afloopdatum:e.toISOString()});};
  const handleClickDateTime=(d:Date,h:number)=>{const s=new Date(d);s.setHours(h,0,0,0);const e=new Date(d);e.setHours(h+2,0,0,0);onCreateProject({startdatum:s.toISOString(),afloopdatum:e.toISOString()});};
  const qLabels=["Q1 (jan–mrt)","Q2 (apr–jun)","Q3 (jul–sep)","Q4 (okt–dec)"];
  const titleStr=view==="month"?`${MONTHS_NL[month]} ${year}`:view==="week"?`${weekDays[0].getDate()} ${MONTHS_NL[weekDays[0].getMonth()]} – ${weekDays[6].getDate()} ${MONTHS_NL[weekDays[6].getMonth()]} ${year}`:view==="kwartaal"?`${qLabels[quarter]} ${year}`:`${DAYS_FULL[(date.getDay()+6)%7]} ${date.getDate()} ${MONTHS_NL[date.getMonth()]} ${year}`;

  return <div className="flex flex-col h-full" style={{height:"calc(100vh - 0px)"}}>
    <div className="px-3 md:px-5 py-2 md:py-3 border-b border-[rgba(15,23,42,0.08)] flex-shrink-0 bg-white space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-[20px] md:text-[24px] leading-[28px] md:leading-[32px] font-semibold text-[#23272F]">Agenda</h1>
        <div className="flex items-center gap-1">
          <button onClick={()=>navigate(-1)} className="p-1.5 rounded-[10px] hover:bg-[#F2F4F7] text-[#5F6673] hover:text-[#23272F] transition-colors"><ChevronLeft className="w-4 h-4"/></button>
          <span className="font-semibold text-[#23272F] text-xs md:text-sm min-w-36 md:min-w-56 text-center">{titleStr}</span>
          <button onClick={()=>navigate(1)} className="p-1.5 rounded-[10px] hover:bg-[#F2F4F7] text-[#5F6673] hover:text-[#23272F] transition-colors"><ChevronRight className="w-4 h-4"/></button>
        </div>
        <button onClick={()=>setDate(new Date())} className="px-2 py-1 text-xs font-medium border border-[rgba(15,23,42,0.15)] rounded-[10px] text-[#5F6673] hover:bg-[#F2F4F7]">Vandaag</button>
        <div className="flex-1"/>
        <div className="flex rounded-[10px] border border-[rgba(15,23,42,0.12)] overflow-hidden">
          {([["month","Maand"],["week","Week"],["day","Dag"],["kwartaal","Kw."]] as [CalView,string][]).map(([v,l])=><button key={v} onClick={()=>setView(v)} className={`px-2 md:px-3 py-1.5 text-xs font-medium transition-colors ${view===v?"bg-[#1E3A7B] text-white":"text-[#5F6673] hover:bg-[#F2F4F7]"}`}>{l}</button>)}
        </div>
        <Btn size="sm" onClick={()=>onCreateProject({})}><Plus className="w-3.5 h-3.5"/><span className="hidden sm:inline">Nieuw werk</span></Btn>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={afdFilter} onChange={setAfdFilter} options={AFDS.map(a=>({value:a,label:a}))} className="w-32 md:w-36"/>
        {agendaRegios.length>0&&<RegioFilter value={regioFilter} onChange={setRegioFilter} opties={agendaRegios}/>}
        <button onClick={()=>setShowWeekNumbers(p=>!p)} className={`px-2 py-0.5 text-xs rounded-[10px] font-medium transition-colors ${showWeekNumbers?"bg-[#EEF1F5] text-[#1E3A7B]":"text-[#5F6673] hover:bg-[#F2F4F7]"}`}>Wk#</button>
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

