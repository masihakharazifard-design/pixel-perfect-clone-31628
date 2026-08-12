# Personeelsplanning schaalbaar maken

Doel: de snelheid van Personeelsplanning hangt af van wat zichtbaar is (medewerkers x dagen + planningregels in die periode), niet van het totale aantal werken. Functionele planningregels blijven exact gelijk.

## Wat er nu gebeurt (geverifieerd in de code)

- `PersoneelsplanningView` filtert bij elke render de volledige projectenlijst (`visProjects`) en bouwt daarna `visProjById`.
- Bij openen loopt `ensureProjectColors(projects, …)` over ALLE projecten, dedupliceert kleuren en schrijft `settings.projectColors` weg — bij duizenden werken is dit de zwaarste stap.
- Dagcellen, afwezigheid, reeksen en teams filteren telkens de volledige `availability`-array (`availability.filter(...)` op ~20 plaatsen).
- Openstaande werken bouwt bij elke toetsaanslag zoekstrings over alle projecten en berekent `assignedEmpIds` / `planStatusOf` per zichtbaar item; de hele lijst hangt aan de render van het grid (hover, drag, celklik).
- `findConflicts` en enkele losse plekken gebruiken nog `projects.find(...)`.

## Aanpak

### 1. Centrale indexen (één keer per datawijziging)
Nieuwe hook `usePlanningIndexes(projects, availability)` in een apart bestand:
- `projectsById`, `projectsByProjectNr`
- `availabilityByEmployeeDate` (key `employeeId|YYYY-MM-DD`), `availabilityByEmployeeId`, `availabilityByProjectId`, `availabilityByPeriodeId`, `availabilityByReeksId`
- `plannedEmployeeIdsByProject`, `plannedCountByProject`
- `projectSearchIndex` (genormaliseerde zoektekst per project: werknummer, projectnr, projectnaam, werkzaamheden, calculator, opdrachtgever)

Alle `projects.find(...)` en `availability.filter(a => a.employeeId === … && a.date === …)` in de planningweergave worden O(1)-lookups op deze maps. `findConflicts` krijgt de dagindex als argument in plaats van de volledige arrays.

### 2. Alleen de zichtbare periode verwerken
Uit de indexen wordt per weergave (dag/week/maand/kwartaal) een `visibleAvailability` afgeleid via een datumindex; teams, legenda en celinhoud werken uitsluitend op die subset. Regels buiten de periode veroorzaken geen renderwerk.

### 3. Data-querylaag voor Openstaande werken
Nieuwe module `src/lib/open-projects.ts` met één interface:

```
getOpenProjects({ search, afdelingen, offset, limit }) -> { items, total, hasMore }
```

Implementatie nu: in-memory via de indexen (goedkope statuscontrole → filter → limiet → pas dan renderdata). Dezelfde interface kan later een IndexedDB-cursor of Supabase-pagination gebruiken zonder UI-wijziging. De UI gaat er niet meer van uit dat alle projecten als één array beschikbaar zijn.

### 4. Openstaande werken als losse component
`OpenProjectsPanel` in een eigen bestand, `React.memo` met stabiele props (queryresultaat + callbacks via `useCallback`). Hover, dragpositie, celselectie, contextmenu en tijdwijzigingen in het grid laten dit paneel niet opnieuw rekenen. Zoeken krijgt ~200 ms debounce. Max 100 gerenderde resultaten; bij meer: `Meer dan 100 resultaten. Verfijn je zoekopdracht.` Alle projecten blijven vindbaar via zoeken.

### 5. Status/aantallen uit indexen
`planStatusOf`, aantal medewerkers, "Niet/Gedeeltelijk/Volledig ingepland" en `rest` gebruiken `plannedCountByProject` / `plannedEmployeeIdsByProject` en worden alleen voor de maximaal 100 zichtbare resultaten berekend.

### 6. Projectkleuren lazy
De `ensureProjectColors`-effect over de volledige lijst vervalt. Kleur wordt bepaald wanneer een project daadwerkelijk zichtbaar of ingepland is: bestaande `projectColors[id]` blijft leidend, anders deterministisch gegenereerd uit `projectId` (zelfde id = zelfde kleur, ook zonder opslag). Kleuren worden alleen opgeslagen bij handmatige aanpassing in Kleurbeheer; Kleurbeheer toont de projecten van de zichtbare/ingeplande set plus zoekresultaat.

### 7. Projectdetails lazy
Medewerkers, dagen en tijden per project worden pas berekend bij openen van het project of wanneer de kaart zichtbaar is.

### 8. IndexedDB-schrijfpad
Losse projectwijzigingen worden individuele `put`s (geen volledige lijst herschrijven). Excel-import blijft één bulktransactie met uitsluitend gewijzigde/nieuwe records. Voor Openstaande werken komt een cursor-gebaseerde query beschikbaar zodat later niet de volledige tabel in geheugen hoeft.

### 9. Meten
Achter een dev-only flag `performance.mark/measure` op: `build project indexes`, `build availability indexes`, `planning grid calculation`, `open projects query/filter`, `PersonnelPlanning render`. Verificatie met gegenereerde datasets van 1.000 / 7.000 / 25.000 / 50.000 werken: openingstijd van Personeelsplanning mag niet ongeveer evenredig meegroeien, en dag/week/maand/kwartaal wisselen zonder freeze.

## Technische details

- Geen harde limiet op het aantal werken; limieten gelden alleen voor rendering.
- Bestanden: nieuw `src/lib/planning-indexes.ts`, `src/lib/open-projects.ts`, `src/components/open-projects-panel.tsx`; aanpassingen in `src/components/planning-app.tsx` (`PersoneelsplanningView`, `findConflicts`, kleurhelpers) en `src/lib/demo-idb.ts` (per-record put + cursorquery).
- Werken-pagina houdt de bestaande paginering (50 per pagina), zoeken/filteren over de volledige dataset.
- Geen wijziging in planningsregels, conflictafhandeling, reeksen/periodes, vaste vrije dagen of importgedrag.
