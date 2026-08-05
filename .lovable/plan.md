# Planningblokken doortrekken (resize) in Personeelsplanning

Alleen de bestaande Personeelsplanning wordt uitgebreid met een resize-handle. Geen tweede agenda, geen nieuwe tabellen, geen dubbele planningregels — alles blijft draaien op de bestaande planningregels.

## Wat er bij komt

Elk planningblok (project, Vakantie, Ziek, Bezet) krijgt een greep om het langer of korter te maken:

- **Dagweergave**: greep aan de onderkant van het blok; slepen past de **eindtijd** aan (in stappen van 15 minuten).
- **Week-, maand- en kwartaalweergave**: greep aan de rechterkant van het blok; slepen past de **einddatum** aan (per dag).
- Begindatum en begintijd blijven altijd gelijk.
- Tijdens het slepen is een tijdelijke preview zichtbaar (nieuwe lengte plus tijd- of datumlabel); het echte record wijzigt pas bij loslaten.
- De greep verschijnt bij hover op desktop en is op mobiel permanent zichtbaar en groter (ruime aanraakzone).

## Projectblokken

Bij loslaten wordt dezelfde planningregel bijgewerkt (nooit een nieuwe regel):

- nieuwe eindtijd (dagweergave) of nieuwe einddatum (overige weergaven; doorlopende dagen worden als losse dagregels van hetzelfde project met dezelfde tijden beheerd, zonder dubbele dagen);
- Personeelsplanning, Agenda en Projectdetails volgen direct;
- de projectperiode wordt herberekend volgens de bestaande regel (alleen regels met status Ingepland van hetzelfde project tellen mee).

Werkt de medewerker die dag met anderen aan hetzelfde project (team), dan verschijnt eerst de keuze:

- Alleen deze planning verlengen
- Hele team verlengen
- Annuleren

## Vakantie, Ziek en Bezet

Doortrekken past de **hele periode** met dezelfde periodeId aan:

- dagregels worden automatisch toegevoegd of verwijderd tot de nieuwe einddatum;
- de periode blijft één doorlopende balk;
- geen dubbele dagregels; inkorten verwijdert de overtollige dagen.

## Conflicten

- Bij een project blokkeren Bezet, Vakantie en Ziek de verlenging: melding met medewerker, status, datum en tijdvak, blok springt terug.
- Overlap met een ander project is alleen een waarschuwing met **Toch opslaan** / **Annuleren**.
- Bij afwezigheidsperiodes gelden dezelfde blokkerende controles als in het bestaande afwezigheidsvenster.

## Opslaan

Na loslaten: eerst valideren, dan opslaan in de database, daarna pas alle schermen verversen. Bij een fout of bij Annuleren springt het blok terug naar de oude lengte. Na een refresh blijft de nieuwe lengte behouden.

## Mobiel

De greep is groter op mobiel. Daarnaast komt in het bestaande blokmenu (rechtsklik / lang indrukken) de optie **"Periode aanpassen"** met Startdatum, Einddatum, Starttijd en Eindtijd — dezelfde opslaglogica als slepen, zodat er altijd een betrouwbaar alternatief is.

## Wat niet verandert

Ontwerp, kleuren, statussen, bestaande menu's, klikgedrag, verslepen naar een andere dag/medewerker en de bestaande conflictcontrole blijven ongewijzigd.

## Technische details

Alles in `src/components/planning-app.tsx`, binnen `PersoneelsplanningView`:

- Nieuwe state `resize:{block:AvailEntry;mode:"time"|"date";originEnd:string;previewEnd:string}|null`, met pointer-events (`pointerdown`/`pointermove`/`pointerup`) op de handle zodat muis en touch hetzelfde pad volgen; `stopPropagation()` zodat de bestaande drag-to-move niet start.
- Dagweergave: pixelverschuiving → kwartieren via de bestaande uurhoogte; nieuwe eindtijd wordt geklemd op minimaal begintijd + 15 min en maximaal 23:59.
- Week-/maand-/kwartaalweergave: horizontale verschuiving wordt omgezet naar een dagindex over de zichtbare kolommen; nieuwe einddatum is minimaal de begindatum.
- Projecten: verlengen over meerdere dagen maakt per extra dag een planningregel met hetzelfde `projectId`, `teamId` en dezelfde tijden aan; inkorten verwijdert die extra dagregels. Verwerking via het bestaande `onSaveManyPlanning` (`savePlanningMany`) in één transactie-achtige save, daarna herladen.
- Team: hergebruik van de bestaande `teamChoice`-modal (labels aangepast naar verlengen) en dezelfde bulk-save voor alle teamregels.
- Afwezigheid: doortrekken roept het bestaande `onSaveAbsence` aan met dezelfde `periodeId` en een nieuwe `endDate`; `saveAbsence` vervangt al alle regels van die periodeId, dus dagregels blijven automatisch kloppen zonder duplicaten.
- Conflicten: hergebruik van de bestaande `findConflicts` / `findConflictsMulti` met uitsluiting van de eigen record-id's; blokkerend voor Bezet/Vakantie/Ziek, waarschuwingsmodal (Toch opslaan / Annuleren) bij `planning_overlap`.
- Rollback: preview-state wordt op `null` gezet en de oude waarden blijven staan wanneer opslaan faalt of de gebruiker annuleert; foutmelding via de bestaande toastmethode.
- Blokmenu (`cellMenu`) krijgt het item "Periode aanpassen…", dat het bestaande plan- of afwezigheidsvenster opent met start/eind-velden.

## Test

In een echte browser: project 08:00–12:00 doortrekken naar 15:00; project van één dag naar meerdere dagen; vakantie van drie naar vijf dagen en weer inkorten; team gezamenlijk verlengen; verlenging over een Bezet-blok wordt geblokkeerd; overlap met ander project geeft waarschuwing met Toch opslaan; na refresh blijft alles behouden.
