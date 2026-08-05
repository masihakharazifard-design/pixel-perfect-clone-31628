# Agenda dagweergave: gesleept project direct zichtbaar

Alleen de dagweergave van Agenda in `src/components/planning-app.tsx`. Geen databasewijziging, geen aanpassing aan Personeelsplanning.

## Oorzaak (geverifieerd)

Zodra een project planningregels heeft, bouwt Agenda de blokken op uit die planningregels (`projectPlans`), niet uit de projectdatums. De sleepactie in de dagweergave roept `handleDropProjectTime` aan, en die schrijft alleen `startdatum`/`afloopdatum` op het projectrecord. Die datums worden daarna weer overschreven door de planningperiode, dus het blok verschijnt niet op het gekozen tijdstip. Voor projecten zonder planningregels ontbreekt bovendien elke planningregel, waardoor er niets bewaard wordt dat de dagweergave als tijdblok kan tonen.

## Wat er verandert

- Een project dat in de dagweergave naar een uur wordt gesleept, komt op dat tijdstip te staan en blijft daar na verversen.
- Slepen van een blok dat uit planning komt: de bijbehorende planningregels krijgen de nieuwe dag, begintijd en eindtijd (duur blijft gelijk); medewerkers, project en overige velden blijven ongewijzigd.
- Slepen van een project zonder planning: het project houdt de bestaande werkwijze en krijgt de nieuwe start- en eindtijd op zijn projectdatums.
- Het blok wordt meteen op de juiste positie in de dagkolom getekend en krijgt de afdelingskleur via `agendaProjStyle`.
- De dagweergave verbergt zulke blokken niet meer op basis van status of medewerker; alleen het bestaande afdelingsfilter blijft gelden.

## Technisch

- `AgendaView` krijgt een extra prop `onSaveManyPlanning` (bestaande functie `savePlanningMany` uit de hoofdcomponent), doorgegeven bij de render op regel ~3924. Geen nieuwe opslagroute.
- `handleDropProjectTime(id, newStart)`:
  - Splits de virtuele id (`<projectId>::<date>::<startTime>`). Bij een virtuele id: zoek in `availability` de regels met dat `projectId`, die `date` en die `startTime`; bereken de duur uit `startTime`/`endTime`; schrijf nieuwe `date` (lokale sleutel van de doeldag), `startTime` en `endTime` en sla ze in één keer op via `onSaveManyPlanning`.
  - Bij een project zonder planningregels: huidig gedrag (project-`startdatum`/`afloopdatum` verschuiven) blijft.
- Datumvergelijking overal via genormaliseerde lokale datumstrings: `String(row.date).slice(0,10) === toDateStr(selectedDate)` (bestaande helper `toDateStr`), nooit via `new Date(...)`-vergelijking op UTC.
- In `DayView` wordt `dayProjs` op dezelfde genormaliseerde datumsleutel bepaald in plaats van `sameDay(new Date(p.startdatum), date)`, en blokken zonder geldige tijd worden overgeslagen; positionering (`top`/`height`) blijft ongewijzigd.
- `agendaProjects` blijft de enige bron voor de blokken; de groepering per `date|startTime|endTime` blijft.

## Controle

In een echte browser: project naar een uur slepen in de dagweergave, controleren dat het blok direct op dat uur staat, met afdelingskleur, en dat het na verversen op dezelfde plek blijft — zowel voor een project met bestaande planning als voor een project zonder planning. Personeelsplanning moet dezelfde regels tonen.
