# Twee fixes in Personeelsplanning

## 1. Openstaande projecten: alleen weg bij status "Afgerond"

De zichtbaarheid wordt meteen definitief doorgevoerd:

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

### Projectrecord blijft ongemoeid

`applyDerivedDates` past uitsluitend `startdatum` en `afloopdatum` aan. Het veld
`projects.data.medewerkers` wordt niet meer bijgewerkt en is geen bron van waarheid; de
ingeplande medewerkers worden altijd dynamisch afgeleid uit de `availability`-planningregels
met hetzelfde `projectId` (zoals `assignedEmpIds` nu al doet in de weergave).

Alle overige projectgegevens blijven ongewijzigd: status, afdeling, afdelingen, calculator,
werkzaamheden, projectnummer, werknummer, opdrachtgever. Na drag & drop of resize wordt alleen
de planning opgeslagen; het project krijgt hooguit nieuwe datums wanneer de bestaande
planningsregels dat voorschrijven.

## 2. Doorgetrokken project: één kleur, één doorlopende balk

Bevestigde oorzaak van de kleurwissel: `rowColor` (regel 2745) bepaalt de kleur via
`teamKey(projectId, a.date, teamleden)` — de **datum** zit in de sleutel, dus elke extra dag
krijgt een andere kleur.

Nieuwe kleurbepaling, in deze volgorde:

1. opgeslagen teamkleur via `teamId`;
2. opgeslagen projectkleur via `projectId`;
3. stabiele fallbackkleur uitsluitend op `projectId`.

Datum, rij-index en availability-record-id worden nooit gebruikt om kleur te bepalen. Resizen
of doortrekken wijzigt de kleur nooit; `projectId`, `reeksId` en `teamId` blijven behouden.
Projecten met meerdere afdelingskleuren houden dezelfde split/gestreepte weergave over de
hele periode.

### Veilig groeperen

- Met `reeksId`: groeperen op medewerkerId + projectId + reeksId + teamId (indien aanwezig) +
  aaneengesloten datums.
- Zonder `reeksId`: regels worden **niet** automatisch samengevoegd, ook niet als project,
  medewerker en datums aansluiten.
- Combineren zonder `reeksId` mag alleen als aantoonbaar dezelfde doortrekactie geldt:
  gelijke medewerker, project, team én exact gelijke begin- en eindtijd.
- Bij twijfel blijft elke regel een afzonderlijk blok; het unieke planningrecord-id is de
  fallback-groepssleutel, zodat losse handmatige planningen nooit één balk worden.

### Weergave

- De reeks wordt bij voorkeur als één balk over een CSS Grid getekend dat over de
  opeenvolgende dagkolommen van de weekweergave loopt (grid-column start/eind = dagindex).
- Past dat technisch niet in de bestaande tabel, dan naadloos aansluitende dagsegmenten:
  ronding links op de eerste dag, rechte randen in het midden, ronding rechts op de laatste
  dag, geen zichtbare gaten, altijd dezelfde opgeslagen kleur.
- Zelfde hoogte, achtergrond, rand en tekststijl over de hele reeks; label alleen op de
  eerste dag. De resize-handle blijft op de laatste dag van de reeks.

## Technische details

Alles in `src/components/planning-app.tsx`:

- `openProjects` (~2992): conditie terug naar alleen `status !== "afgerond"`.
- `applyDerivedDates` (~3685): alleen `startdatum` en `afloopdatum` overschrijven, geen
  `medewerkers` meer; opslagfuncties (`savePlanning`, `savePlanningMany`,
  `savePlanningResize`, `deletePlanning`) raken verder geen projectvelden.
- `viewProjects` blijft de medewerkers dynamisch afleiden uit `availability`.
- `rowColor` (~2745): datum-onafhankelijke kleursleutel volgens de drietrapsvolgorde.
- Weekweergave (~3115-3145): reeksberekening per medewerkerrij met bovenstaande
  groeperingsregels, daarna grid-overlay per reeks (of naadloze dagsegmenten als fallback).
- Geen wijzigingen aan database, agenda, projectenpagina of overige functies.

## Test

Slepen naar medewerker, tweede medewerker toevoegen, volledig inplannen, naar andere datum
verplaatsen: project blijft steeds in Openstaande projecten. Status op Afgerond: verdwijnt.
Project van één naar vier dagen doortrekken: identieke kleur, één doorlopende balk zonder
gaten. Twee losse handmatige planningen op opeenvolgende dagen blijven twee blokken. Na
refresh onveranderd.
