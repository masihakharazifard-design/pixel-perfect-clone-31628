# Agenda: projectkleur altijd op afdeling, ook bij Offerte

Alleen de kleurweergave van projectblokken in Agenda verandert. Geen databasewijziging, geen aanpassing aan Personeelsplanning of andere pagina's.

## Oorzaak

De gedeelde stijlhelper geeft projecten met status Offerte een grijze, gestreepte weergave die vóór de afdelingskleur gaat. Zonwering-projecten met status Offerte worden daardoor grijs in plaats van geel.

## Wat er verandert

- Elk projectblok in Agenda krijgt de kleur van zijn afdeling: Stoffering, Schilderwerk of Zonwering, uit de centrale kleurinstellingen.
- Twee afdelingen houden de diagonale tweekleurenverdeling; drie afdelingen (Turnkey) de driedeling.
- Status Offerte, andere projectstatussen, teamkleur, planningsstatus en beschikbaarheidsstatus bepalen in Agenda nooit meer de kleur.
- De grijs-gestreepte Offerte-weergave blijft buiten Agenda bestaan (o.a. in de projectenlijst).
- Landelijke feestdagen en schoolvakanties blijven ongewijzigd.
- Een kleurwijziging via Kleuren beheren is direct zichtbaar in Agenda en blijft na refresh behouden.

## Technisch

- Nieuwe helper `agendaProjStyle(p, dc)` naast de bestaande `projStyle` in `src/components/planning-app.tsx`: bepaalt de stijl uitsluitend via `getAllAfds(p)` en `dc` (1 / 2 / 3 afdelingen), zonder offerte-, team- of statuslogica.
- De globale `projStyle` blijft ongewijzigd, omdat die ook buiten Agenda wordt gebruikt.
- Alle `projStyle(...)`-aanroepen binnen `MonthView`, `WeekView`, `DayView` en `KwartaalView` (all-day blokken, gewone blokken, blokken uit planningregels) worden vervangen door `agendaProjStyle(...)`. Aanroepen buiten die vier weergaven blijven staan.
- De blokken die uit planningregels worden afgeleid, behouden `afdeling`, `afdelingen`, `projectId` en overige projectvelden; `teamKleur` wordt daar niet gezet (staat al op `undefined` en blijft zo).
- Kleuren komen uit `DeptColorCtx` / `settings.deptColors`; geen hardcoded kleurwaarden.
- Controle in een echte browser: Agenda gefilterd op Zonwering (incl. een Offerte-project), Stoffering, Schilderwerk, een Turnkey-project, plus een kleurwijziging via Kleuren beheren — ook na refresh.
