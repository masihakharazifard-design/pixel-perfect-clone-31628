// Onderdeel van de planning-app (uit planning-app.tsx gehaald om het overzichtelijk te houden).
import { useState, useEffect, useMemo } from "react";
import { Plus, Pencil, Trash2, Search, Phone, Mail, Check, AlertTriangle, Table2 } from "lucide-react";
import { DEFAULT_PL_NAMEN, normPlAliases } from "@/lib/projectleiders";
import { maakWerkbon } from "@/lib/werkbon";
import { toast } from "sonner";
import { loadPersonalNotes, savePersonalNote, deletePersonalNote, resetDemoData, type PersonalNote, type SettingsPathPatch } from "@/lib/store";
import { DEMO_MODE } from "@/lib/demo-mode";
import { addWorkdays } from "@/lib/werkdagen";
import { useAuth } from "@/components/auth-gate";
import { Afdeling, Project, Employee, AppSettings, useDC, AFDS, TODAY_STR, fmtDate, plName, getAllAfds, DeptBadge, Btn, Input, Select, ConfirmModal } from "./basis";

// ===== PERSOONLIJKE NOTITIES =====
// Privé per ingelogde gebruiker: alleen de eigenaar ziet zijn eigen notities.
export function NotitiesView(){
  const {user}=useAuth();
  const realUserId=user&&/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(user.id)?user.id:null;
  // Zonder echt account (demo) worden notities lokaal op dit apparaat bewaard.
  const noteOwnerId=realUserId??(DEMO_MODE?"demo-local":null);
  const [notes,setNotes]=useState<PersonalNote[]>([]);
  const [loading,setLoading]=useState(true);
  const [datum,setDatum]=useState(TODAY_STR);
  const [tekst,setTekst]=useState("");
  const [editId,setEditId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    if(!noteOwnerId){setLoading(false);return;}
    let alive=true;
    loadPersonalNotes().then(n=>{if(alive)setNotes(n);}).catch(()=>toast.error("Notities konden niet worden geladen."))
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[noteOwnerId]);

  const reset=()=>{setEditId(null);setTekst("");setDatum(TODAY_STR);};
  const save=async()=>{
    if(!noteOwnerId||!tekst.trim()||busy)return;
    setBusy(true);
    try{
      const saved=await savePersonalNote(noteOwnerId,datum,tekst.trim(),editId||undefined);
      setNotes(prev=>{const rest=prev.filter(n=>n.id!==saved.id);return [saved,...rest].sort((a,b)=>b.datum.localeCompare(a.datum));});
      reset();
    }catch{toast.error("Notitie kon niet worden opgeslagen.");}
    setBusy(false);
  };
  const remove=async(id:string)=>{
    setBusy(true);
    try{await deletePersonalNote(id);setNotes(prev=>prev.filter(n=>n.id!==id));if(editId===id)reset();}
    catch{toast.error("Notitie kon niet worden verwijderd.");}
    setBusy(false);
  };

  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div>
      <h1 className="text-[26px] md:text-[30px] leading-[32px] md:leading-[38px] font-semibold text-[#23272F]">Persoonlijke notities</h1>
      <p className="text-[#5F6673] text-xs md:text-sm">{noteOwnerId&&!realUserId?"Zonder account worden je notities op dit apparaat bewaard.":"Alleen jij ziet deze notities — ze zijn gekoppeld aan jouw account."}</p>
    </div>
    {!noteOwnerId
      ?<div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-6 text-sm text-[#5F6673]">
        Persoonlijke notities werken alleen met een echt account. Log in met je Microsoft-account om je eigen notities veilig op te slaan.
      </div>
      :<>
        <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Datum" value={datum} onChange={setDatum} type="date"/>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#5F6673]">Notitie</label>
            <textarea value={tekst} onChange={e=>setTekst(e.target.value)} rows={4} placeholder="Waar wil je aan denken?"
              className="w-full px-3 py-2 bg-white border border-[rgba(15,23,42,0.1)] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A7B]/40"/>
          </div>
          <div className="flex justify-end gap-2">
            {editId&&<Btn variant="secondary" onClick={reset}>Annuleren</Btn>}
            <Btn onClick={save} disabled={busy||!tekst.trim()}>{editId?"Notitie bijwerken":"Notitie opslaan"}</Btn>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-hidden">
          {loading?<p className="px-4 py-3 text-xs text-[#9AA1AD]">Laden…</p>
          :notes.length===0?<p className="px-4 py-3 text-xs text-[#9AA1AD]">Nog geen notities.</p>
          :<div className="divide-y divide-[rgba(15,23,42,0.05)]">
            {notes.map(n=><div key={n.id} className="flex items-start gap-3 px-4 py-3">
              <span className="text-xs tabular-nums text-[#5F6673] w-24 flex-shrink-0">{fmtDate(n.datum)}</span>
              <p className="text-sm text-[#23272F] flex-1 whitespace-pre-wrap">{n.tekst}</p>
              <button onClick={()=>{setEditId(n.id);setDatum(n.datum);setTekst(n.tekst);}} className="text-xs text-[#1E3A7B] font-semibold flex-shrink-0">Bewerken</button>
              <button onClick={()=>remove(n.id)} className="text-[#9AA1AD] hover:text-[#C2604D] flex-shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>)}
          </div>}
        </div>
      </>}
  </div>;
}

// ===== MEDEWERKERS =====
export function MedewerkersView({employees,onAdd,onEdit,onDelete,onVacImport,onAlsSchilder}:{
  employees:Employee[];onAdd:()=>void;onEdit:(e:Employee)=>void;onDelete:(id:string)=>void;
  onVacImport:()=>void;onAlsSchilder?:(id:string)=>void;
}){
  const dc=useDC();
  const [search,setSearch]=useState("");const [afdFilter,setAfdFilter]=useState<string>("");
  const [del,setDel]=useState<string|null>(null);
  const filtered=employees.filter(e=>{const q=search.toLowerCase();return(!q||e.naam.toLowerCase().includes(q)||e.functie.toLowerCase().includes(q))&&(!afdFilter||e.afdeling===afdFilter);});
  return <div className="p-4 md:p-6 space-y-4 md:space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h1 className="text-[26px] md:text-[30px] leading-[32px] md:leading-[38px] font-semibold text-[#23272F]">Medewerkers</h1><p className="text-[#5F6673] text-xs md:text-sm">{employees.length} medewerkers</p></div>
      <div className="flex gap-2 flex-shrink-0">
        <Btn variant="secondary" onClick={onVacImport} size="sm"><Table2 className="w-3.5 h-3.5"/>Vakantie importeren</Btn>
        {onAlsSchilder&&<select value="" onChange={e=>{if(e.target.value)onAlsSchilder(e.target.value);}} aria-label="Bekijk de app als medewerker"
          className="py-1.5 px-2 text-xs rounded-[10px] border border-[rgba(15,23,42,0.12)] bg-white text-[#23272F]">
          <option value="">Bekijk als schilder…</option>
          {[...employees].filter(e=>e.functie!=="Projectleider").sort((a,b)=>a.naam.localeCompare(b.naam,"nl")).map(e=><option key={e.id} value={e.id}>{e.naam}</option>)}
        </select>}
        <Btn onClick={onAdd}><Plus className="w-4 h-4"/><span className="hidden sm:inline">Nieuwe medewerker</span></Btn>
      </div>
    </div>
    <div className="flex gap-2 flex-wrap">
      <div className="relative flex-1 min-w-0"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5F6673]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Zoeken..." className="w-full pl-9 pr-3 py-2 bg-white border border-[rgba(15,23,42,0.1)] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A7B]/40"/></div>
      <Select value={afdFilter} onChange={setAfdFilter} options={AFDS.map(a=>({value:a,label:a}))} className="w-36 md:w-40"/>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      {filtered.map(e=><div key={e.id} className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-5 hover:shadow-md transition-all">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg flex items-center justify-center text-white text-lg font-bold" style={{backgroundColor:dc[e.afdeling].bg}}>{e.naam.slice(0,1)}</div>
            <div><p className="font-bold text-[#23272F]">{e.naam}</p><p className="text-xs text-[#5F6673]">{e.functie}</p></div>
          </div>
          <div className="flex gap-1">
            <button onClick={()=>onEdit(e)} className="p-1.5 rounded-[10px] hover:bg-[#F2F4F7] text-[#5F6673]"><Pencil className="w-3.5 h-3.5"/></button>
            <button onClick={()=>setDel(e.id)} className="p-1.5 rounded-[10px] hover:bg-[#F5E1DC] text-[#5F6673] hover:text-[#C2604D]"><Trash2 className="w-3.5 h-3.5"/></button>
          </div>
        </div>
        <div className="mb-3"><DeptBadge afd={e.afdeling}/></div>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-[#5F6673]"><Phone className="w-3.5 h-3.5"/>{e.telefoon||"—"}</div>
          <div className="flex items-center gap-2 text-[#5F6673]"><Mail className="w-3.5 h-3.5"/>{e.email||"—"}</div>
        </div>
        {e.competenties.length>0&&<div className="mt-3 flex flex-wrap gap-1">
          {e.competenties.slice(0,3).map(c=><span key={c} className="px-2 py-0.5 bg-[#F2F4F7] text-[#5F6673] rounded-full text-xs">{c}</span>)}
          {e.competenties.length>3&&<span className="px-2 py-0.5 bg-[#F2F4F7] text-[#5F6673] rounded-full text-xs">+{e.competenties.length-3}</span>}
        </div>}
      </div>)}
    </div>
    {del&&<ConfirmModal message="Weet je zeker dat je deze medewerker wilt verwijderen? De medewerker wordt verwijderd uit alle werken en tijdblokken." onConfirm={()=>{onDelete(del);setDel(null);}} onCancel={()=>setDel(null)}/>}
  </div>;
}

// ===== INSTELLINGEN =====
export function InstellingenView({settings,onSave,projects=[],employees=[]}:{settings:AppSettings;onSave:(s:AppSettings)=>void;projects?:Project[];employees?:Employee[]}){
  const [form,setForm]=useState<AppSettings>(settings);
  const [saved,setSaved]=useState(false);
  const [activeTab,setActiveTab]=useState<"bedrijf"|"kleuren"|"projectleiders"|"werkbon">("bedrijf");
  // Voorbeeld van de werkbon met een echt werk en een schilder uit de lijst
  const werkbonVoorbeeld=useMemo(()=>{
    if(activeTab!=="werkbon")return "";
    const emp=employees.find(e=>e.afdeling==="Schilderwerk")||employees[0];
    const p=projects.find(x=>getAllAfds(x).includes("Schilderwerk"))||projects[0];
    return maakWerkbon({
      medewerker:emp?.naam||"Jan de Schilder",
      werk:{werknummer:p?.werknummer||"24001",projectnaam:p?.projectnaam||"Voorbeeldwerk",opdrachtgever:p?.opdrachtgever||"",adres:p?.straatObject||p?.adres||"",plaats:p?.plaatsObject||p?.plaats||"",projectleider:p?plName(p,employees):"",opmerkingen:p?.opmerkingen||"",afdeling:p?getAllAfds(p).join(", "):"Schilderwerk"},
      dagen:[0,1,2].map(i=>({datum:addWorkdays(TODAY_STR,i+1),start:form.werkdagStart||"07:00",eind:form.werkdagEind||"17:00"})),
      bedrijf:{naam:form.bedrijfsnaam,telefoon:form.telefoon,email:form.email},
    }).html;
  },[activeTab,employees,projects,form.bedrijfsnaam,form.telefoon,form.email,form.werkdagStart,form.werkdagEind]);
  // Projectleiders: lijst van afkorting → volledige naam (standaardlijst + eigen aanvullingen)
  const plRows=Object.entries({...DEFAULT_PL_NAMEN,...(form.projectleiderNamen||{})});
  const setPlName=(code:string,naam:string)=>setForm(p=>({...p,projectleiderNamen:{...(p.projectleiderNamen||{}),[code]:naam}}));
  const [newCode,setNewCode]=useState("");const [newNaam,setNewNaam]=useState("");
  // Afkortingen die in de werken voorkomen maar nog niet aan een naam gekoppeld zijn
  const onbekend=useMemo(()=>{
    const bekend=new Set(Object.keys(normPlAliases({...DEFAULT_PL_NAMEN,...(settings.projectleiderNamen||{})})));
    const mensen=new Set(employees.map(e=>e.id));
    const tel=new Map<string,number>();
    projects.forEach(p=>{const raw=String(p.projectleider||"").trim();if(!raw||mensen.has(raw))return;const k=raw.toUpperCase();
      if(!/^[A-Z.]{2,5}$/.test(k)||bekend.has(k))return;tel.set(k,(tel.get(k)||0)+1);});
    return [...tel.entries()].sort((a,b)=>b[1]-a[1]);
  },[projects,employees,settings.projectleiderNamen]);

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
      <h1 className="text-[26px] md:text-[30px] leading-[32px] md:leading-[38px] font-semibold text-[#23272F]">Instellingen</h1>
      <p className="text-[#5F6673] text-xs md:text-sm">Bedrijfsinstellingen en voorkeuren</p>
    </div>
    <div className="flex gap-1 bg-[#F2F4F7] p-1 rounded-md w-fit">
      {(["bedrijf","kleuren","projectleiders","werkbon"] as const).map(t=><button key={t} onClick={()=>setActiveTab(t)} className={`px-4 py-1.5 rounded-[10px] text-sm font-medium transition-colors ${activeTab===t?"bg-white text-[#23272F] shadow-sm":"text-[#5F6673] hover:text-[#23272F]"}`}>{t==="bedrijf"?"Bedrijfsgegevens":t==="kleuren"?"Kleuren":t==="werkbon"?"Werkbon":"Projectleiders"}</button>)}
    </div>
    {activeTab==="werkbon"&&<div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4 md:p-6 space-y-4">
      <div>
        <p className="font-semibold text-[#23272F]">Werkbon mailen bij inplannen</p>
        <p className="text-sm text-[#5F6673]">Als een medewerker op een werk wordt ingepland, kan de app een werkbon naar zijn of haar e-mailadres sturen (uit Medewerkers). De werkbon bevat het werk, het adres en alle komende ingeplande dagen.</p>
      </div>
      <div className="space-y-2">
        {([["uit","Uit","Er worden geen werkbonnen gemaild."],["vragen","Eerst vragen","Na het inplannen verschijnt een knop Mailen; pas als je daarop klikt, gaat de werkbon weg."],["automatisch","Automatisch","De werkbon wordt direct na het inplannen gemaild."]] as const).map(([v,l,uitleg])=>
          <label key={v} className={`flex items-start gap-3 p-3 rounded-[10px] border cursor-pointer ${(form.werkbonMail||"uit")===v?"border-[#1E3A7B] bg-[#EEF1F5]":"border-[rgba(15,23,42,0.1)]"}`}>
            <input type="radio" name="werkbonMail" checked={(form.werkbonMail||"uit")===v} onChange={()=>setForm(p=>({...p,werkbonMail:v}))} className="mt-1 accent-[#1E3A7B]"/>
            <span><span className="block text-sm font-semibold text-[#23272F]">{l}</span><span className="block text-xs text-[#5F6673]">{uitleg}</span></span>
          </label>)}
      </div>
      <label className="flex items-center gap-2 text-sm text-[#23272F]">
        <input type="checkbox" checked={form.werkbonAlleenSchilders!==false} onChange={e=>setForm(p=>({...p,werkbonAlleenSchilders:e.target.checked}))} className="accent-[#1E3A7B]"/>
        Alleen voor medewerkers van Schilderwerk
      </label>
      {(()=>{const zonder=employees.filter(e=>(form.werkbonAlleenSchilders===false||e.afdeling==="Schilderwerk")&&!e.email).map(e=>e.naam);
        return zonder.length>0&&<p className="text-xs text-[#8A5300] bg-[#FEF3DC] rounded-[10px] px-3 py-2">Nog geen e-mailadres bij: {zonder.slice(0,12).join(", ")}{zonder.length>12?` en ${zonder.length-12} anderen`:""}. Vul dit in bij Medewerkers, anders krijgen zij geen werkbon.</p>;})()}
      <div>
        <p className="text-sm font-semibold text-[#23272F] mb-2">Voorbeeld (voorlopige opmaak)</p>
        <iframe title="Voorbeeld werkbon" srcDoc={werkbonVoorbeeld} sandbox="" className="w-full h-[560px] rounded-[10px] border border-[rgba(15,23,42,0.1)] bg-[#EEF1F5]"/>
      </div>
    </div>}
    {activeTab==="projectleiders"&&<div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4 md:p-6 space-y-3">
      <p className="text-sm text-[#5F6673]">In Excel staat bij "Projectl." vaak een afkorting. Overal in de planning wordt in plaats daarvan de volledige naam getoond. Laat de naam leeg om een afkorting niet meer te vertalen.</p>
      {onbekend.length>0&&<div className="rounded-[10px] border border-[#F6DCA5] bg-[#FEF3DC] p-3 space-y-2">
        <p className="text-sm font-semibold text-[#7A4A00] flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" aria-hidden="true"/>Nog niet gekoppeld ({onbekend.length})</p>
        <p className="text-xs text-[#7A4A00]">Deze afkortingen staan bij werken, maar hebben nog geen volledige naam. Vul de naam in en sla op; daarna krijgen ze overal de juiste naam en kleur.</p>
        {onbekend.map(([code,n])=><div key={code} className="flex items-center gap-2">
          <span className="w-20 flex-shrink-0 tabular-nums text-sm font-semibold text-[#23272F]">{code}</span>
          <input value={form.projectleiderNamen?.[code]||""} onChange={e=>setPlName(code,e.target.value)} placeholder={`Volledige naam (${n} werk${n===1?"":"en"})`}
            className="flex-1 py-1.5 px-2.5 text-sm border border-[rgba(15,23,42,0.12)] rounded-[10px] bg-white text-[#23272F] focus:outline-none focus:ring-1 focus:ring-[#1E3A7B]/50"/>
        </div>)}
      </div>}
      <div className="space-y-2">
        {plRows.map(([code,naam])=><div key={code} className="flex items-center gap-2">
          <span className="w-20 flex-shrink-0 tabular-nums text-sm font-semibold text-[#23272F]">{code}</span>
          <input value={naam} onChange={e=>setPlName(code,e.target.value)} placeholder="Volledige naam"
            className="flex-1 py-1.5 px-2.5 text-sm border border-[rgba(15,23,42,0.12)] rounded-[10px] text-[#23272F] focus:outline-none focus:ring-1 focus:ring-[#1E3A7B]/50"/>
        </div>)}
      </div>
      <div className="flex items-end gap-2 pt-2 border-t border-[rgba(15,23,42,0.06)]">
        <Input label="Afkorting" value={newCode} onChange={setNewCode} placeholder="Bijv. RSA" className="w-28"/>
        <Input label="Volledige naam" value={newNaam} onChange={setNewNaam} placeholder="Voor- en achternaam" className="flex-1"/>
        <Btn variant="secondary" disabled={!newCode.trim()||!newNaam.trim()} onClick={()=>{setPlName(newCode.trim().toUpperCase(),newNaam.trim());setNewCode("");setNewNaam("");}}><Plus className="w-4 h-4"/>Toevoegen</Btn>
      </div>
      <p className="text-xs text-[#5F6673]">Vergeet niet onderaan op <b>Instellingen opslaan</b> te klikken.</p>
    </div>}
    {activeTab==="bedrijf"&&<div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4 md:p-6 space-y-4">
      <Input label="Bedrijfsnaam" value={form.bedrijfsnaam} onChange={v=>setForm(p=>({...p,bedrijfsnaam:v}))}/>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Adres" value={form.adres} onChange={v=>setForm(p=>({...p,adres:v}))}/>
        <Input label="Postcode" value={form.postcode} onChange={v=>setForm(p=>({...p,postcode:v}))}/>
      </div>
      <Input label="Plaats" value={form.plaats} onChange={v=>setForm(p=>({...p,plaats:v}))}/>
      <div>
        <p className="text-xs font-semibold text-[#5F6673] mb-1">Standaard werkdag (nieuwe planning)</p>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Begintijd" type="time" value={form.werkdagStart||"07:00"} onChange={v=>setForm(p=>({...p,werkdagStart:v}))}/>
          <Input label="Eindtijd" type="time" value={form.werkdagEind||"17:00"} onChange={v=>setForm(p=>({...p,werkdagEind:v}))}/>
        </div>
        <p className="text-xs text-[#5F6673] mt-1">Geldt voor alle afdelingen. Per planning kun je de tijden in het inplanvenster nog aanpassen.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Telefoon" value={form.telefoon} onChange={v=>setForm(p=>({...p,telefoon:v}))}/>
        <Input label="E-mail" value={form.email} onChange={v=>setForm(p=>({...p,email:v}))}/>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[#5F6673] mb-1">Primaire kleur</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.primaryColor} onChange={e=>setForm(p=>({...p,primaryColor:e.target.value}))} className="w-10 h-10 rounded-[10px] border border-[rgba(15,23,42,0.1)] cursor-pointer p-0.5 bg-[#F2F4F7]"/>
            <span className="text-sm text-[#23272F] tabular-nums">{form.primaryColor}</span>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#5F6673] mb-1">Accentkleur</label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.accentColor} onChange={e=>setForm(p=>({...p,accentColor:e.target.value}))} className="w-10 h-10 rounded-[10px] border border-[rgba(15,23,42,0.1)] cursor-pointer p-0.5 bg-[#F2F4F7]"/>
            <span className="text-sm text-[#23272F] tabular-nums">{form.accentColor}</span>
          </div>
        </div>
      </div>
    </div>}
    {activeTab==="kleuren"&&<div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4 md:p-6 space-y-4">
      <p className="text-sm text-[#5F6673]">Stel de kleur in voor elke afdeling. Wijzigingen zijn direct zichtbaar na opslaan.</p>
      {AFDS.map(a=><div key={a} className="flex items-center gap-4 p-3 rounded-md border border-[rgba(15,23,42,0.08)]">
        <input type="color" value={form.deptColors[a].bg} onChange={e=>setDeptColor(a,e.target.value)} className="w-12 h-12 rounded-md border-0 cursor-pointer p-0.5 flex-shrink-0" style={{backgroundColor:form.deptColors[a].bg}}/>
        <div className="flex-1">
          <p className="font-semibold text-[#23272F]">{a}</p>
          <p className="text-xs text-[#5F6673] tabular-nums">{form.deptColors[a].bg}</p>
        </div>
        <div className="w-8 h-8 rounded-[10px]" style={{backgroundColor:form.deptColors[a].bg}}/>
      </div>)}
    </div>}
    {DEMO_MODE&&<div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] p-4 md:p-6 space-y-3">
      <div>
        <p className="font-semibold text-[#23272F]">Demo-omgeving</p>
        <p className="text-xs text-[#5F6673]">Alle gegevens staan alleen lokaal in deze browser. Resetten zet de voorbeelddata terug.</p>
      </div>
      <button onClick={()=>{if(window.confirm("Weet je zeker dat je alle demo-gegevens wilt terugzetten?")){void resetDemoData().then(()=>window.location.reload());}}}
        className="px-4 py-2 rounded-md border border-[#C2604D] text-[#C2604D] text-sm font-semibold hover:bg-[#F5E1DC]">Demo resetten</button>
    </div>}
    <div className="flex gap-3">
      <Btn onClick={save}>
        {saved?<><Check className="w-4 h-4"/>Opgeslagen!</>:<>Instellingen opslaan</>}
      </Btn>
      {saved&&<p className="text-sm text-[#1F8A55] flex items-center gap-1"><Check className="w-4 h-4"/>Wijzigingen opgeslagen</p>}
    </div>

  </div>;
}

// ===== Instellingen: verschil bepalen zodat alleen gewijzigde onderdelen naar de database gaan =====
export const NESTED_SETTING_MAPS=["projectColors","projectleiderColors","deptColors","teamColors","statusColors","borderColors","badgeColors"] as const;
export function diffSettings(prev:AppSettings,next:AppSettings):{changes:Record<string,unknown>;paths:SettingsPathPatch[]}{
  const changes:Record<string,unknown>={};const paths:SettingsPathPatch[]=[];
  const keys=new Set([...Object.keys(prev||{}),...Object.keys(next||{})]);
  keys.forEach(key=>{
    const a=(prev as unknown as Record<string,unknown>)[key];
    const b=(next as unknown as Record<string,unknown>)[key];
    if(JSON.stringify(a)===JSON.stringify(b))return;
    const nested=(NESTED_SETTING_MAPS as readonly string[]).includes(key);
    if(nested&&a&&b&&typeof a==="object"&&typeof b==="object"&&!Array.isArray(a)&&!Array.isArray(b)){
      const am=a as Record<string,unknown>,bm=b as Record<string,unknown>;
      new Set([...Object.keys(am),...Object.keys(bm)]).forEach(sub=>{
        if(JSON.stringify(am[sub])===JSON.stringify(bm[sub]))return;
        if(!(sub in bm))paths.push({path:[key,sub],remove:true});
        else paths.push({path:[key,sub],value:bm[sub]});
      });
      return;
    }
    changes[key]=b;
  });
  return{changes,paths};
}

