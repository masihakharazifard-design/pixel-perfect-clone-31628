# Facturatie schaalbaar en snel maken

## Wat er nu misgaat (gemeten in de code)

`FacturatieView` krijgt de volledige projectenlijst als prop en rendert **elk** gefilterd project als een kaart. Per kaart wordt `FacturatieTermijnen` gemount, en die component doet bij mount een eigen asynchrone `loadProjectMeta(projectId)`.

Met ~7.000 werken betekent één klik op Facturatie dus:
- ~7.000 kaarten + ~28.000 termijnrijen in de DOM;
- ~7.000 losse meta-leesacties richting de opslaglaag;
- een lineaire `projects.filter(...)` bij iedere render (niet gememoiseerd).

Dat is de oorzaak van het vastlopen — niet de facturatielogica zelf.

## Wat er verandert

Alleen datatoegang, indexering en rendering. Termijnen, statussen, bedragen en projectdata blijven exact zoals ze zijn.

1. **Querygebaseerde lijst in plaats van volledige array.** Facturatie gebruikt een provider `getFacturationProjects({ search, filters, sortField, sortDirection, offset, limit })` die `{ items, total, hasMore, summary }` teruggeeft. De view krijgt niet langer de volledige `projects`-array als prop.
2. **Sortering globaal, vóór paginering.** De provider past filters en sortering toe over de volledige relevante dataset en snijdt daarna pas `offset/limit` af. Nooit "eerste 50 ophalen en die 50 sorteren".
3. **Geen harde scan-cap die resultaten stil laat wegvallen.** Elk opgeslagen werk blijft vindbaar, filterbaar, sorteerbaar en factureerbaar — ook boven 10.000 records. Waar mogelijk lopen paginering, statusfilters en sorteervelden via IndexedDB-indexen/cursors; een vrije-tekstzoekopdracht mag intern een grotere set doorlopen, maar zonder afkapgrens. Alleen het resultaat richting React is begrensd op 50 rijen.
4. **Centrale projectindex.** Lookups en zoeken lopen via de bestaande `projectIndex` (`getProjectById`, `getProjectByProjectNr`, `getProjectsByWerknummer`, `getProjectSearchText`). Geen `projects.find(...)` per rij, geen strings die tijdens het typen opnieuw worden samengesteld.
5. **Paginering vóór rendering.** Volgorde: query → filters → sortering → huidige pagina → maximaal 50 rijen renderen. Navigatie met `Vorige` / `Pagina X van Y` / `Volgende`. Filter- of zoekwijziging zet terug naar pagina 1.
6. **Lichte, gememoiseerde rij.** Nieuwe `FacturatieRow` met `React.memo`, die alleen zijn eigen velden krijgt (werknummer, projectnaam, opdrachtgever, calculator, afdeling, status) plus de al geladen termijnmeta. Geen projects-, availability-, employees-array of settings-object als prop.
7. **Eén gebundelde meta-read per pagina.** Voor de maximaal 50 zichtbare projectIds wordt `loadProjectMetaBatch(projectIds)` aangeroepen, wat een `Map<projectId, ProjectMeta>` oplevert. `FacturatieTermijnen` krijgt een optionele `meta`-prop: is die aanwezig, dan doet de component géén eigen `loadProjectMeta` bij mount. Alleen in ProjectDetail (geen vooraf geladen meta) blijft de bestaande individuele load werken. Resultaat: 1 batch-read per pagina, niet 1 batch-read + 50 losse reads.
8. **Geen availability-scan per rij.** Als planninginformatie nodig is, komt die uit de bestaande indexen (`plannedCountByProject`); nooit een `availability.filter(...)` binnen een rij.
9. **Totalen uit de querylaag.** Koptotalen komen als aggregate/summary uit dezelfde provider (één lineaire pass per echte datawijziging), zodat `FacturatieView` daarvoor niet alsnog de volledige projectenlijst nodig heeft. Niet herberekend bij hover, dropdown, selectie, paginawissel of modal.
10. **Eigen lokale state.** `FacturatieView` houdt zoektekst (200 ms debounce), filters, sortering en pagina lokaal, zodat state-wijzigingen elders in de app geen herverwerking van duizenden projecten veroorzaken.
11. **Openen = alleen lezen.** Controle dat het openen van Facturatie geen writes, statusnormalisatie of opslagacties triggert.
12. **Geen harde projectlimiet.** Alleen rendering en query worden begrensd, de dataset niet.

## Meten

Tijdelijke development-metingen (`Facturatie mount`, `filtering`, `totals`, `sorting`, `render`) om voor/na te vergelijken op de huidige dataset van ~7.000 werken, plus een synthetische test met 25.000 en 50.000 records.

## Technische details

- `src/lib/facturatie-query.ts` (nieuw): provider bovenop `projectIndex` / IndexedDB met expliciete `sortField` + `sortDirection`, globale filtering en sortering vóór `offset/limit`, en een `summary`-aggregate. Geen resultaat-afkappende scan-cap.
- `src/components/facturatie-view.tsx` (nieuw): `FacturatieView` + gememoiseerde `FacturatieRow`, verplaatst uit `planning-app.tsx`.
- `src/components/planning-app.tsx`: `FacturatieView` krijgt de provider in plaats van `viewProjects`; `FacturatieTermijnen` krijgt een optionele `meta`-prop en slaat zijn eigen load over wanneer die is meegegeven — ProjectDetail blijft ongewijzigd werken.
- Opslaglaag: `loadProjectMetaBatch(projectIds)` toegevoegd als één echte gebundelde leesactie — nadrukkelijk geen `Promise.all(ids.map(loadProjectMeta))`. Demo/IndexedDB: één readonly transactie die alle gevraagde meta binnen die transactie ophaalt en een `Map<projectId, ProjectMeta>` teruggeeft. Productie/Supabase: één query met `IN`-filter op de zichtbare projectIds, daarna client-side één `Map` opbouwen. Beide paden delen dezelfde interface.
- Race-bescherming: elke asynchrone pagina-/zoekquery en batch-read krijgt een request-id (of AbortController); resultaten van een verouderde query worden genegeerd, zodat snel typen of paginawisselen nooit een nieuwer resultaat overschrijft.
