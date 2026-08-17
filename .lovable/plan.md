# Personeelsplanning: volledige omschrijving in het blok en tijden uit de invoer

Alleen weergave en invoer van projectblokken in Personeelsplanning wijzigen. Planninglogica, `availability`-opslag, projectkoppeling, indexen en Agenda blijven ongewijzigd.

## 1. Volledige omschrijving in het blok

Nu toont een ingepland blok in de weekweergave alleen `projectnaam.slice(0,4)+".."` (bijv. `I260..`). Dat wordt vervangen door:

- **Dag- en Weekweergave:** `Werknummer – Werkzaamheden`. Als Werkzaamheden ontbreekt: `Werknummer – Projectnaam`. Als beide ontbreken: alleen `Werknummer`.
- **Maand- en Kwartaalweergave:** compact, minimaal het volledige werknummer; omschrijving, projectnaam, calculator en afdeling blijven via tooltip beschikbaar.
- De tekst wordt niet meer met `slice(...)`, `truncate` of `...` afgekapt. Tekst mag over meerdere regels doorlopen (`white-space: normal`, `overflow-wrap: anywhere`).

## 2. Tekst mag doorlopen

- Het projectblok krijgt `white-space: normal`, `overflow-wrap: anywhere` en `leading-tight` in plaats van `truncate`.
- Cellen en rijen krijgen `align-top` en geen vaste hoogte, zodat de rij meegroeit als de tekst over 2–3 regels loopt.
- In de maand-/kwartaalweergave (zeer smalle kolommen) blijft het compacte label staan, maar dan met werknummer in plaats van vier letters van de naam, met tooltip.

## 3. Tooltip

Hover op het blok toont: werknummer, projectnaam, werkzaamheden, calculator, afdeling — plus de bestaande hints (`klik = werkgegevens · rechtsklik = planning bewerken`) en de "Als eerste uitvoeren"-markering.

## 4/5. Begintijd en eindtijd uit "Medewerker inplannen"

- De velden Begintijd en Eindtijd verdwijnen uit het inplanvenster; Startdatum en Einddatum blijven.
- Nieuwe planningregels krijgen de bestaande standaard-werkdagrepresentatie `08:00–17:00`, die al overal in de app als "volledige werkdag" geldt (o.a. bij import en bij het openen van het venster). Er wordt geen nieuw veld of migratie toegevoegd.
- Bestaande planningregels met afwijkende tijden blijven ongewijzigd; bij bewerken via dit venster worden de opgeslagen tijden behouden en niet overschreven.
- Agenda blijft bestaande tijden gewoon verwerken.

## 6. Conflictcontrole

De bestaande conflictcontrole blijft volledig intact en draait per dag met de gebruikte werkdagtijden. Blokkerend blijven Vakantie, Ziek, Bezet en Vrij; de waarschuwing bij dubbele projectplanning blijft gelijk. Alleen de validatie "Eindtijd moet na de begintijd liggen" verdwijnt, omdat er geen tijdinvoer meer is.

## 7. Meerdaagse weergave

Meerdaagse planning blijft één gedeelde `reeksId` gebruiken en verschijnt als doorlopende balk. Het label wordt op het eerste zichtbare segment getoond; vervolgsegmenten blijven leeg, zoals nu.

## 8. Klikgedrag

Ongewijzigd: linksklik opent de centrale `ProjectDetail`, rechtsklik opent het bestaande snelmenu.

## Technische details

- `src/components/planning-app.tsx`:
  - Weekgrid-blok (regel ~3323–3325): `truncate` en `slice(0,4)+".."` vervangen door meerregelig label + uitgebreide `title`.
  - Maand-/kwartaalblok (regel ~3373): label naar werknummer + uitgebreide `title`.
  - Dagweergave-regel (~3260): volledige label-tekst, geen `truncate`.
  - `PlanEmployeeModal`: tijdvelden uit de UI, `st`/`et` intern vast op de doorgegeven waarden (default `08:00`/`17:00`), `canSave` zonder tijdvergelijking, `st>=et`-melding weg.
- Geen wijziging in `availability`-schema, opslaglaag, indexen of Agenda-code.
