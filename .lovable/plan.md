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

1. **Querygebaseerde lijst in plaats van volledige array.** Facturatie gebruikt dezelfde schaalbare aanpak als "Openstaande werken": een provider `getFacturationProjects({ search, filters, sort, offset, limit })` die `{ items, total, hasMore }` teruggeeft en stopt zodra de pagina gevuld is. De view krijgt niet langer de volledige `projects`-array als prop.
2. **Centrale projectindex.** Lookups en zoeken lopen via de bestaande `projectIndex` (`getProjectById`, `getProjectByProjectNr`, `getProjectsByWerknummer`, `getProjectSearchText`). Geen `projects.find(...)` per rij, geen strings die tijdens het typen opnieuw worden samengesteld.
3. **Paginering vóór rendering.** Volgorde: query → filters → sortering → huidige pagina → maximaal 50 rijen renderen. Navigatie met `Vorige` / `Pagina X van Y` / `Volgende`. Filter- of zoekwijziging zet terug naar pagina 1.
4. **Lichte, gememoiseerde rij.** Nieuwe `FacturatieRow` met `React.memo`, die alleen zijn eigen velden krijgt (werknummer, projectnaam, opdrachtgever, calculator, afdeling, status, termijnstatus). Geen projects-, availability-, employees-array of settings-object als prop.
5. **Termijnen niet meer per project vooraf laden.** De termijnstatus wordt alleen opgehaald voor de ~50 zichtbare rijen (één gebundelde leesactie per pagina), niet met één losse call per project. Uitgebreide projectdetails worden pas berekend wanneer de gebruiker een regel opent.
6. **Geen availability-scan per rij.** Als planninginformatie nodig is, komt die uit de bestaande indexen (`plannedCountByProject`); nooit een `availability.filter(...)` binnen een rij.
7. **Totalen in één pass.** Eventuele koptotalen worden met één `useMemo` en één lineaire doorloop per echte datawijziging berekend — niet opnieuw bij hover, dropdown, paginawissel of modal.
8. **Sortering gememoiseerd**, alleen herberekend bij wijziging van sorteerkeuze, zoekterm, filter of projectdata.
9. **Eigen lokale state.** `FacturatieView` houdt zoektekst (200 ms debounce), filters, sortering en pagina lokaal, zodat state-wijzigingen elders in de app geen herverwerking van duizenden projecten veroorzaken.
10. **Openen = alleen lezen.** Controle dat het openen van Facturatie geen writes, statusnormalisatie of opslagacties triggert.
11. **Geen harde projectlimiet.** Alleen rendering en query worden begrensd, de dataset niet.

## Meten

Tijdelijke development-metingen (`Facturatie mount`, `filtering`, `totals`, `sorting`, `render`) om voor/na te vergelijken op de huidige dataset van ~7.000 werken, plus een synthetische test met 25.000 en 50.000 records.

## Technische details

- `src/lib/facturatie-query.ts` (nieuw): provider bovenop `projectIndex`, zelfde vorm als `createIndexOpenProjectsProvider` met scan-cap en `{ items, total, hasMore }`.
- `src/components/facturatie-view.tsx` (nieuw): `FacturatieView` + gememoiseerde `FacturatieRow`, verplaatst uit `planning-app.tsx`.
- `src/components/planning-app.tsx`: `FacturatieView` krijgt de provider in plaats van `viewProjects`; bestaande `FacturatieTermijnen` blijft ongewijzigd in gebruik voor het projectdetail-tabblad en wordt in de lijst alleen voor zichtbare rijen gerenderd.
- Opslaglaag: batchvariant voor het lezen van projectmeta van maximaal 50 id's (demo/IndexedDB en Supabase-pad delen dezelfde interface).
