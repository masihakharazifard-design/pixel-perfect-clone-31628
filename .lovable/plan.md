# Agenda dagweergave: gesleept project direct zichtbaar

Alleen de dagweergave van Agenda in `src/components/planning-app.tsx`. Geen databasewijziging, geen aanpassing aan Personeelsplanning of de weekweergave.

## Oorzaak (geverifieerd)

Projecten met planningregels worden in Agenda opgebouwd uit `availability` via `projectPlans`. `handleDropProjectTime` wijzigt alleen `startdatum`/`afloopdatum` van het projectrecord; die datums worden daarna weer afgeleid uit de ongewijzigde planningregels, dus het blok springt terug.

## Wat er verandert

- Een blok dat uit planningregels komt en in de dagweergave naar een ander uur of een andere dag wordt gesleept, verplaatst de gekoppelde planningregels zelf. Alleen dag, begintijd en eindtijd wijzigen; de duur blijft gelijk en alle overige gegevens (medewerker, project, status, reeks, team, periode, volgorde, "als eerste uitvoeren", notitie) blijven behouden.
- Dezelfde verplaatsing is meteen zichtbaar in Personeelsplanning en blijft na verversen staan.
- Een project zonder planningregels blijft werken zoals nu: alleen de projectdatums verschuiven, met behoud van duur. Er wordt geen planningregel aangemaakt en geen medewerker gekoppeld.
- Blokken van hetzelfde project met dezelfde dag en begintijd maar een andere eindtijd worden afzonderlijk behandeld: slepen verplaatst alleen het gesleepte blok.
- Blokken krijgen altijd de afdelingskleur; geen team-, status- of offertekleur in Agenda.
- De weekweergave houdt exact haar huidige sleepgedrag.

## Technisch

- `AgendaView` krijgt een nieuwe prop `onSaveManyPlanning: (entries: AvailEntry[]) => Promise<boolean>`, doorgegeven vanuit de hoofdcomponent als `onSaveManyPlanning={savePlanningMany}`.
- Virtuele id van planningblokken wordt `` `${p.id}::${date}::${st}::${et}` `` bij het opbouwen van `agendaProjects`; `realId` (split op `::`, eerste deel) blijft werken.
- Nieuwe handler `handleDropProjectDayTime(id, newStart)`, alleen doorgegeven aan `DayView`; `handleDropProjectTime` blijft ongewijzigd voor de weekweergave.
  - Bij een virtuele planning-id: splits in `projectId`, `oldDate`, `oldStartTime`, `oldEndTime`; selecteer regels met `String(row.projectId) === String(projectId) && String(row.date).slice(0,10) === oldDate && row.startTime === oldStartTime && row.endTime === oldEndTime`; bereken per regel de duur uit begin-/eindtijd; zet `date = toDateStr(newStart)`, `startTime` op de lokale tijd van `newStart` en `endTime = startTime + duur`; sla alle regels in één keer op via `onSaveManyPlanning` (die de centrale state en database bijwerkt, waarna `agendaProjects` opnieuw berekend wordt). Het projectrecord wordt niet aangeraakt.
  - Geen virtuele id en geen planningregels: bestaande projectdatum-verschuiving met behoud van duur.
- `DayView`: `const selectedDateKey = toDateStr(date)` en `dayProjs` op `datePart(p.startdatum) === selectedDateKey` in plaats van `sameDay(new Date(p.startdatum), date)`; geen `toISOString()`-vergelijkingen. Blokken zonder geldige begin-/eindtijd worden niet als tijdblok getekend; `top`/`height` blijven begrensd binnen de dagkolom.
- Kleur uitsluitend via `agendaProjStyle(project, dc)`; alleen het bestaande afdelingsfilter geldt, geen medewerker- of statusfilter.

## Controle

In een echte browser: blok slepen naar een ander uur en een andere dag, controle in Personeelsplanning, refresh, twee blokken met gelijke begintijd en verschillende eindtijd, een project zonder planning, afdelingskleuren, en wisselen Dag ↔ Week.
