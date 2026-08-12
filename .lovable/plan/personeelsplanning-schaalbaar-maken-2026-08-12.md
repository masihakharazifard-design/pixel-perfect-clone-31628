# Personeelsplanning schaalbaar maken

Doel: de snelheid van Personeelsplanning hangt af van wat zichtbaar is (medewerkers x dagen + planningregels in die periode), niet van het totale aantal werken. Functionele planningregels blijven exact gelijk.

## Wat er nu gebeurt (geverifieerd in de code)

- `PersoneelsplanningView` filtert bij elke render de volledige projectenlijst (`visProjects`) en bouwt daarna `visProjById`.
- Bij openen loopt `ensureProjectColors(projects, …)` over ALLE projecten, dedupliceert kleuren en schrijft `settings.projectColors` weg — bij duizenden werken is dit de zwaarste stap.
- Dagcellen, afwezigheid, reeksen en teams filteren telkens de volledige `availability`-array (`availability.filter(...)` op ~20 plaatsen).
- Openstaande werken bouwt bij elke toetsaanslag zoekstrings over alle projecten en berekent `assignedEmpIds` / `planStatusOf` per zichtbaar item; de hele lijst hangt aan de render van het grid (hover, drag, celklik).
- `findConflicts` en enkele losse plekken gebruiken nog `projects.find(...)`.

## Aanpak

### 1. Twee strikt gescheiden indexlagen

**Centrale projectindexen (applicatie/store-niveau, buiten Personeelsplanning)**
In `src/lib/project-index.ts`, gekoppeld aan de projectdata zelf, niet aan de render van Personeelsplanning:
- `projectsById`
- `projectsByProjectNr`
- `projectSearchIndex` (één genormaliseerde string per project: werknummer, projectnummer, projectnaam, werkzaamheden, calculator, opdrachtgever)

Incrementeel bijwerken: bij wijziging van één project alleen dat record in de drie maps aanpassen. Alleen na een grote Excel-import één bulk-herindexering. Openen/sluiten van Personeelsplanning bouwt nooit een projectindex op.

De index is tegelijk incrementeel én React-safe: geen los mutable `Map` waarop stil `.set()`/`.delete()` gebeurt. De laag biedt één API met een versie/subscription-mechanisme:

```
getProjectById(id)
getProjectByProjectNr(projectNr)
getProjectSearchText(id)
updateProjectIndex(project)
removeProjectFromIndex(id)
rebuildProjectIndex(projects)
subscribe(listener) / getVersion()
```

Componenten lezen via `useSyncExternalStore` op `subscribe` + `getVersion`. Bij één projectwijziging: alleen de betreffende entries aanpassen, één lichte versiebump, notify — geen nieuwe Maps voor de hele dataset en geen verouderde weergave. Na een Excel-bulkimport: één bulk-herindexering gevolgd door één notificatie/statecommit.

**Availability-indexen (component-niveau)**
Nieuwe hook `useAvailabilityIndexes(availability)` in `src/lib/availability-index.ts` met uitsluitend:
`availabilityByDate`, `availabilityByEmployeeDate` (`employeeId|YYYY-MM-DD`), `availabilityByEmployeeId`, `availabilityByProjectId`, `availabilityByPeriodeId`, `availabilityByReeksId`, `plannedEmployeeIdsByProject`, `plannedCountByProject`.

Een projectwijziging herbouwt geen availability-index; een availabilitywijziging herbouwt geen projectzoekindex.

### 2. Zichtbare periode via `availabilityByDate`
`visibleAvailability` ontstaat uit directe Map-lookups op de zichtbare datums: dag = 1 lookup, week = 7, maand/kwartaal = alleen de datums in die periode. Geen `availability.filter(a => a.date >= start && …)` per render. Dagcellen lezen `availabilityByEmployeeDate.get(empId + "|" + date)`; `findConflicts`, reeksen en teams krijgen de betreffende index in plaats van de volledige array.

### 3. Openstaande werken: zelfstandige querycomponent
`OpenProjectsPanel` (`src/components/open-projects-panel.tsx`) is `React.memo` en beheert zelf search, ~200 ms debounce, afdelingsfilters, offset/limit en queryresultaat. De parent geeft alleen stabiele props door:

```
<OpenProjectsPanel openProjectsProvider={provider} onPlan={stableCallback} />
```

Hover, drag, celselectie, contextmenu of tijdwijziging in het grid veroorzaakt dus geen nieuwe open-projects-query. `PersoneelsplanningView` roept `getOpenProjects` nooit zelf aan tijdens render.

### 4. Querylaag met paginering
`src/lib/open-projects.ts`:

```
getOpenProjects({ search, afdelingen, offset, limit }) -> { items: Project[], total?: number, hasMore: boolean }
```

Levert maximaal `limit` (100) records. DEMO MODE: implementatie via de centrale projectindex/IndexedDB-cursor, zodat er geen volledige React-array van alle projecten nodig is. Productie: dezelfde interface kan later Supabase pagination/filtering gebruiken.

### 5. Zoeken op de bestaande index
Zoeken raadpleegt uitsluitend `projectSearchIndex`; er worden tijdens typen geen zoekstrings opnieuw samengesteld of gelowercased over de volledige dataset. Debounce ~200 ms. Alle projecten blijven vindbaar; bij meer dan 100 treffers: `Meer dan 100 resultaten. Verfijn je zoekopdracht.`

### 6. Zware gegevens pas na resultaatbegrenzing
Flow: goedkope query/filter → maximaal 100 basisrecords → pas daarna per resultaat planStatus, ingeplande medewerkers, rest, kleur, draggegevens en kaartinformatie (uit `plannedCountByProject` / `plannedEmployeeIdsByProject`). Nooit eerst alles berekenen en dan `slice(0,100)`.

### 7. Projectkleuren O(1)
`ensureProjectColors` verdwijnt volledig uit het automatische pad: geen effect bij openen, import, filterwijziging of statewijziging. Kleur = opgeslagen `projectColors[projectId]`, anders deterministische hash → HSL uit alleen `projectId` (zelfde id altijd dezelfde kleur). Alleen een handmatige kleurwijziging in Kleurbeheer wordt opgeslagen; Kleurbeheer toont de zichtbare/ingeplande set plus zoekresultaat.

### 8. Projectdetails lazy
Medewerkers, dagen en tijden per project worden pas berekend bij openen van het project of wanneer de kaart daadwerkelijk zichtbaar is.

### 9. IndexedDB-schrijfpad
Losse projectwijzigingen zijn individuele `put`s; de Excel-import blijft één bulktransactie met alleen gewijzigde/nieuwe records. Er komt een cursor-/paginerende leesquery zodat Openstaande werken niet de volledige tabel hoeft te laden.

### 10. Meten en acceptatie
Dev-only `performance.mark/measure` op: `PersonnelPlanning mount`, `availability indexes`, `visible period calculation`, `planning grid render`, `OpenProjects query`, `OpenProjects render`. Getest met 1.000 / 7.000 / 25.000 / 50.000 werken: bij gelijke medewerkers, zichtbare dagen en planningregels mag het grid bij 50.000 niet substantieel langzamer openen dan bij 7.000. Tijdens mount vindt geen `projects.map/filter/find` of `ensureProjectColors` over alle projecten plaats voor het grid; alleen een expliciete Openstaande-werken-query of zoekactie mag van de datasetgrootte afhangen.

## Technische details

- Geen harde limiet op het aantal werken; limieten gelden alleen voor rendering.
- Nieuwe bestanden: `src/lib/project-index.ts`, `src/lib/availability-index.ts`, `src/lib/open-projects.ts`, `src/components/open-projects-panel.tsx`.
- Aanpassingen: `src/components/planning-app.tsx` (`PersoneelsplanningView`, `findConflicts`, kleurhelpers, projectstate → centrale index) en `src/lib/demo-idb.ts` (cursor-/paginerende query).
- Werken-pagina houdt de bestaande paginering (50 per pagina), zoeken/filteren over de volledige dataset.
- Geen wijziging in planningsregels, conflictafhandeling, reeksen/periodes, vaste vrije dagen of importgedrag.
