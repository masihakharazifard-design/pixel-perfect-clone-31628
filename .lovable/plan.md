# Vier correcties in Personeelsplanning

Alles in `src/components/planning-app.tsx`. Geen andere pagina's, databasevelden of functies.

## 1. Openstaande projecten blijven op dezelfde plaats

Bevestigd in de code (regel ~3014-3020): de statusfilter is al correct, maar de lijst eindigt met
`.sort((a,b)=>(b.rest-a.rest)||((a.p.startdatum||"9999").localeCompare(...)))`. Zodra `rest` 0 wordt
zakt het project naar beneden in de `max-h-80 overflow-y-auto`-lijst en lijkt het verdwenen.

- Sortering volledig verwijderen; de volgorde van `visProjects` blijft leidend.
- Nergens meer sorteren op rest, aantallen, badge, start-/afloopdatum of afgeleide datums.
- Alleen teller en badge veranderen na inplannen of slepen.
- Verbergen uitsluitend bij status exact "afgerond"; Gefactureerd blijft zichtbaar.
- Lege melding wordt "Geen openstaande projecten." (regel ~3219).

## 2. "Markering verwijderen" definitief

In `normalizeFirstOfDay` (regel ~318) staat `const want=marked?marked.id:(rows.length===1?rows[0].id:null);`
Daardoor krijgt een dag met één projectblok direct opnieuw een ster.

- Wordt: `const want = marked ? marked.id : null;`
- `markFirstOfDay` (regel ~2806) slaat de keuze rechtstreeks op via `onSaveManyPlanning(applyFirstOfDay(rows, on?row.id:null))`
  in plaats van via `commitPlanning`, zodat de normalisatie de keuze niet overschrijft.
- Na "Markering verwijderen" hebben alle projectregels van die medewerker op die dag `isFirstOfDay: false`,
  ook na een refresh.

## 3. Automatische markering na verwijderen

In `deletePlanRow` (regel ~2959) staat `(b.isFirstOfDay||rest.length===1)`.

- Wordt: `const target = keep ? keep.id : (b.isFirstOfDay ? (rest[0]?.id||null) : null);`
- Alleen wanneer het verwijderde blok zelf gemarkeerd was, neemt het volgende blok de ster over.

## 4. Doorgetrokken project als één doorlopende balk

`rowColor` is al datum-onafhankelijk (teamkleur → projectkleur → stabiele fallback op projectId) en blijft zo.

De weekweergave (regel ~3150) plakt segmenten nu met `marginLeft/-3px` aan elkaar; daardoor blijft er
zichtbare ruimte over. Aanpassing:

- Cel met gekoppelde segmenten krijgt geen horizontale padding meer (`px-0.5` vervalt wanneer een
  blok in die cel links of rechts doorloopt), zodat de balk cel-tot-cel doorloopt.
- Segmentwrapper gebruikt volledige celbreedte zonder negatieve marges; hoeken:
  eerste segment alleen links afgerond, midden geen ronding, laatste alleen rechts.
- Resize-handle en projectnaam/ster uitsluitend op respectievelijk het laatste en het eerste segment.
- Achtergrondkleur, randkleur, hoogte, teamkleur en split-/gestreepte afdelingsweergave identiek
  over de hele reeks.
- Groepering blijft op employeeId + projectId + reeksId + teamId + startTime + endTime + aaneengesloten datums
  (bestaande `linkedOn`/`segInfo`); zonder reeksId blijft elk blok los.

## Test

Browsertest via Playwright: project slepen naar een medewerker en controleren dat de regel op dezelfde
positie blijft (alleen teller/badge wijzigen), status Afgerond laat hem verdwijnen; ster zetten en
verwijderen inclusief refresh, ook op een dag met één blok; project van één naar vier dagen doortrekken
en controleren op gelijke kleur en één balk zonder gaten na refresh.
