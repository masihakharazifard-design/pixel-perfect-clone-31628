# Twee fixes in Personeelsplanning

## 1. Openstaande projecten: alleen weg bij status "Afgerond"

De zichtbaarheid wordt meteen definitief doorgevoerd, zonder eerst onderzoek:

```
const openProjects = visProjects.filter(project =>
  String(project.status || "").trim().toLowerCase() !== "afgerond");
```

Gefactureerd blijft dus zichtbaar. Inplannen, volledig inplannen, slepen, datumwijzigingen,
aantallen en badges beïnvloeden de zichtbaarheid nooit.

Wat ik in de code al heb vastgesteld:

- De lijst (rond regel 2992) bevat nu nog de extra voorwaarde `!== "gefactureerd"`; die vervalt.
  `rest > 0`, `periodProjects`, `showPlanned` en datumvoorwaarden zitten er al niet meer in.
- In `dropOnCell`, `tryCommit`, `commitPlanning` en `savePlanningMany` staat geen
  `setOpenProjects`, geen `filter(p => p.id !== draggedProjectId)` en geen optimistische
  verwijdering. Die blijven zo.

Extra controle en zo nodig correctie: `applyDerivedDates` en alle opslagfuncties
(`savePlanning`, `savePlanningMany`, `savePlanningResize`, `deletePlanning`) mogen bij het
afleiden van projectdatums uitsluitend `startdatum`, `afloopdatum` en `medewerkers` raken —
nooit `status`, `afdeling`, `afdelingen`, `projectId` of zichtbaarheid. Ik leg dat vast door
alleen die drie velden expliciet te overschrijven op een spread van het bestaande project.

Na drag & drop wordt alleen de planningregel opgeslagen; het projectrecord blijft verder
ongewijzigd. Daarna herladen en enkel badge (Niet/Gedeeltelijk/Volledig ingepland) en
aantallen herberekenen.

## 2. Doorgetrokken project: één kleur, één doorlopende balk

Bevestigde oorzaak van de kleurwissel: `rowColor` (regel 2745) bepaalt de kleur via
`teamKey(projectId, a.date, teamleden)` — de **datum** zit in de sleutel, dus elke extra dag
krijgt een andere kleur.

Nieuwe kleurbepaling, in deze volgorde:

1. opgeslagen teamkleur via `teamId`;
2. opgeslagen projectkleur (`projectColors[projectId]`);
3. stabiele fallback uitsluitend op `projectId`.

Datum, availability-id en rij-index maken nooit deel uit van de kleursleutel. Resizen of
doortrekken wijzigt de kleur nooit; `projectId`, `reeksId` en `teamId` blijven behouden op
alle gekoppelde dagregels. Projecten met meerdere afdelingskleuren houden dezelfde
split/gestreepte weergave over de hele periode.

Weergave als één reeks:

- Groeperen op medewerkerId + projectId + reeksId + teamId (indien aanwezig) + aaneengesloten
  datums.
- De reeks wordt bij voorkeur als één balk over een CSS Grid getekend dat over de
  opeenvolgende dagkolommen van de weekweergave loopt (grid-column start/eind = dagindex),
  in plaats van losse blokken met negatieve marges.
- Past één gridbalk technisch niet binnen de bestaande tabelstructuur, dan losse
  dagsegmenten die visueel naadloos aansluiten: ronding links op de eerste dag, rechte
  aansluitende randen in het midden, ronding rechts op de laatste dag, geen zichtbare gaten,
  en altijd exact dezelfde opgeslagen kleur.
- Zelfde hoogte, achtergrond, rand en tekststijl over de hele reeks; label alleen op de
  eerste dag. De resize-handle blijft op de laatste dag van de reeks.

## Technische details

Alles in `src/components/planning-app.tsx`:

- `openProjects` (~2992): conditie terug naar alleen `status !== "afgerond"`.
- `applyDerivedDates` (~3685) en de opslagfuncties: expliciet alleen datums + medewerkers
  overschrijven, overige projectvelden onaangeroerd.
- `rowColor` (~2745): datum-onafhankelijke kleursleutel volgens de drietrapsvolgorde hierboven.
- Weekweergave (~3115-3145): reeksberekening per medewerkerrij, celinhoud rendert een
  grid-overlay per reeks (of naadloze dagsegmenten als fallback).
- Geen wijzigingen aan database, agenda, projectenpagina of overige functies.

## Test

Slepen naar medewerker, tweede medewerker toevoegen, volledig inplannen, naar andere datum
verplaatsen: project blijft steeds in Openstaande projecten. Status op Afgerond: verdwijnt.
Project van één naar vier dagen doortrekken: identieke kleur, één doorlopende balk zonder
gaten; na refresh onveranderd.
