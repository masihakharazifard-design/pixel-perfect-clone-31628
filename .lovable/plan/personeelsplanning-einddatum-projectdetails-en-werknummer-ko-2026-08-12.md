# Personeelsplanning: einddatum, projectdetails en werknummer-koppeling

Alle bestaande planningregels, indexen, conflictlogica en opslag blijven intact. `availability` blijft de enige planningsbron.

## 1. Einddatum in "Medewerker inplannen"

Het venster krijgt vier velden: Startdatum, Einddatum, Begintijd, Eindtijd.

- Startdatum = de aangeklikte datum; Einddatum staat standaard gelijk aan startdatum.
- Einddatum kan niet vóór startdatum liggen (min-datum + validatie, opslaan geblokkeerd).
- Gelijke datums: exact het huidige gedrag (één regel).
- Verschillende datums: één `availability`-regel per dag in de periode, met dezelfde employeeId, projectId, status `Ingepland`, dezelfde begin-/eindtijd, en de bestaande team-/reeks-/volgordevelden volgens de huidige logica. De regels krijgen één gedeelde `reeksId`, zodat ze in het grid als doorlopende balk verschijnen (zoals meerdaagse afwezigheid nu ook werkt).
- De bestaande conflictcontrole draait per dag. Blokkerende conflicten (Vakantie, Ziek, Bezet, Vrij) verhinderen opslaan en de melding noemt de exacte datum(s); waarschuwingen blijven bevestigbaar zoals nu.
- Opslaan gebeurt in één keer via de bestaande meervoudige planningsopslag.
- Start-/einddatum van het projectrecord zelf worden niet overschreven.
- Bij het bewerken van een bestaande regel blijft het venster één datum tonen (einddatum = startdatum), zodat bewerken ongewijzigd werkt.

## 2. Eén centrale ProjectDetail

Dashboard, Werken, Agenda en Openstaande werken gebruiken al dezelfde `ProjectDetail`. Alleen het ingeplande blok in Personeelsplanning wijkt af: dat opent nu het bewerkvenster.

- Linksklik op een ingepland blok opent voortaan exact dezelfde `ProjectDetail`.
- De planningregel bewerken, verplaatsen of verwijderen blijft via het bestaande rechtsklik-snelmenu op het blok.
- Er komt geen tweede detailweergave.

## 3 t/m 7. Werknummer direct invoeren

In het inplanvenster komt boven het bestaande zoekveld een veld "Werknummer".

- Invoer wordt genormaliseerd met `String(value).trim()` en na ~150 ms debounce exact opgezocht.
- De lookup gaat via een nieuwe index `projectsByWerknummer: Map<string, Project[]>` in de centrale projectindex, naast `projectsById` en `projectsByProjectNr`. `projectnr` blijft de unieke sleutel van een werk; werknummer is uitsluitend een snelle zoek-/koppelroute en geen uniek ID. Lookup blijft O(1) — geen `projects.find()` of volledige scan tijdens typen.
- Geen match: `Geen bestaand werk gevonden met dit werknummer.` Opslaan blijft geblokkeerd.
- Precies één match: dat project wordt automatisch geselecteerd met de bestaande `projectId`, en projectnummer, projectnaam, werkzaamheden, calculator (letterlijke tekst, geen medewerker-matching), afdeling, opdrachtgever en status verschijnen read-only.
- Meerdere matches: nooit automatisch kiezen. Melding `Meerdere werken gevonden met dit werknummer. Kies het juiste werk.` plus een compacte keuzelijst met projectnr., werknummer, projectnaam, werkzaamheden, calculator en afdeling; na keuze wordt die bestaande `projectId` gekoppeld.
- Er wordt vanuit dit venster in geen enkel geval een nieuw of leeg werk aangemaakt.
- De bestaande zoekfunctie (werknummer, projectnummer, projectnaam, werkzaamheden) blijft ongewijzigd naast dit veld en levert dezelfde `projectId` op.

## 8. Synchronisatie

De meerdaagse regels zijn gewone `availability`-regels, dus Agenda, beschikbaarheid, projectdetails en refresh lopen automatisch mee. De planningregel bewaart alleen `projectId` en planningsinformatie; geen projectgegevens worden gekopieerd.

## Technische details

- `src/lib/project-index.ts`: `byWerknummer: Map<string, string[]>` (project-ids) toevoegen, incrementeel bijgewerkt in `setEntry`/`removeProjectFromIndex`/`rebuild`, plus `getProjectsByWerknummer`.
- `src/components/planning-app.tsx`:
  - `PlanEmployeeModal`: state voor `endDate` + werknummerveld, per-dag conflictcontrole, `onSave` levert een array van regels; aanroepers (`projMenu`, `planModal`) slaan op via `commitPlanning`/`onSaveManyPlanning`.
  - Blokklik in de dagcel roept `onOpenProject(proj)` aan in plaats van `openEditPlan(row)`.
- Geen wijziging aan Excel-importmapping, opslaglaag of de bestaande schaalbaarheidsoptimalisaties.
