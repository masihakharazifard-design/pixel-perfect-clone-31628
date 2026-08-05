# Planningblokken doortrekken (resize) in Personeelsplanning

Alleen de bestaande Personeelsplanning wordt uitgebreid met een resize-handle. Geen tweede agenda, geen nieuwe tabellen, geen dubbele planningregels — alles blijft draaien op de bestaande planningregels.

## Wat er bij komt

Elk planningblok (project, Vakantie, Ziek, Bezet) krijgt een greep om het langer of korter te maken:

- **Dagweergave**: greep aan de onderkant van het blok; slepen past de **eindtijd** aan (in stappen van 15 minuten). Minimale duur is begintijd + 15 minuten; verlengen loopt standaard tot het einde van de normale werkdag. Doorlopen buiten werktijd kan alleen na een bewuste bevestiging.
- **Weekweergave**: greep aan de rechterkant van het blok; slepen past de **einddatum** aan (per dag).
- **Maand- en kwartaalweergave**: resizen start uitsluitend via de zichtbare greep — het blok zelf begint nooit vanzelf een resize. Zijn de cellen te klein (kwartaalweergave, mobiel), dan opent de greep meteen het venster "Periode aanpassen" in plaats van vrij slepen.
- Begindatum en begintijd blijven altijd gelijk.
- Tijdens het slepen is een tijdelijke preview zichtbaar (nieuwe lengte plus tijd- of datumlabel); het echte record wijzigt pas bij loslaten.
- De greep verschijnt bij hover op desktop en is op mobiel permanent zichtbaar en groter (ruime aanraakzone).

## Projectblokken

- **Binnen dezelfde dag** wordt uitsluitend het bestaande planningrecord bijgewerkt; er komt nooit een extra regel bij.
- **Over meerdere kalenderdagen** krijgt iedere extra dag één gekoppelde planningregel met hetzelfde project, hetzelfde team, dezelfde reeks-sleutel en dezelfde begin- en eindtijden. Dit zijn geen dubbele records: per medewerker, project, datum en tijdvak bestaat maximaal één regel.
- **Inkorten** verwijdert alleen de gekoppelde dagregels die buiten de nieuwe einddatum vallen.
- Personeelsplanning, Agenda en Projectdetails volgen direct.
- De projectperiode wordt herberekend volgens de bestaande regel (alleen regels met status Ingepland van hetzelfde project tellen mee).


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
- Dagweergave: pixelverschuiving → kwartieren via de bestaande uurhoogte; nieuwe eindtijd is minimaal begintijd + 15 minuten en loopt standaard tot het einde van de normale werkdag (17:00). Verder doortrekken kan alleen bewust: bij het bereiken van het einde van de werkdag klikt de gebruiker in een bevestiging "Buiten werktijd doorplannen"; pas daarna is een latere eindtijd mogelijk. 23:59 is geen standaardgrens.
- Weekweergave: horizontale verschuiving wordt omgezet naar een dagindex over de zichtbare kolommen; nieuwe einddatum is minimaal de begindatum.
- Maand- en kwartaalweergave: resizen start uitsluitend op de zichtbare handle (`pointerdown` op de handle, nooit op het blok zelf; het blok houdt zijn bestaande klik- en sleepgedrag). Is de cel te smal voor nauwkeurig slepen (kwartaalweergave, of celbreedte onder de drempel / mobiel), dan opent de handle direct het bestaande venster "Periode aanpassen" in plaats van drag-resize.
- Projecten binnen dezelfde dag: uitsluitend het bestaande planningrecord wordt bijgewerkt (alleen eindtijd), nooit een extra regel.
- Projecten over meerdere dagen: per extra kalenderdag één gekoppelde planningregel met hetzelfde `projectId`, `teamId`, dezelfde `reeksId` (gedeelde koppelsleutel, opgeslagen in het bestaande JSON-veld — geen migratie) en dezelfde begin- en eindtijden. Voor opslaan wordt ontdubbeld op medewerker + project + datum + tijdvak, zodat er maximaal één regel per combinatie bestaat. Inkorten verwijdert uitsluitend de gekoppelde dagregels met dezelfde `reeksId` buiten de nieuwe einddatum; losse handmatige planningen blijven staan. Verwerking via het bestaande `onSaveManyPlanning` (`savePlanningMany`) in één save, daarna herladen.

- Team: hergebruik van de bestaande `teamChoice`-modal (labels aangepast naar verlengen) en dezelfde bulk-save voor alle teamregels.
- Afwezigheid: doortrekken roept het bestaande `onSaveAbsence` aan met dezelfde `periodeId` en een nieuwe `endDate`; `saveAbsence` vervangt al alle regels van die periodeId, dus dagregels blijven automatisch kloppen zonder duplicaten.
- Conflicten: hergebruik van de bestaande `findConflicts` / `findConflictsMulti` met uitsluiting van de eigen record-id's; blokkerend voor Bezet/Vakantie/Ziek, waarschuwingsmodal (Toch opslaan / Annuleren) bij `planning_overlap`.
- Rollback: preview-state wordt op `null` gezet en de oude waarden blijven staan wanneer opslaan faalt of de gebruiker annuleert; foutmelding via de bestaande toastmethode.
- Blokmenu (`cellMenu`) krijgt het item "Periode aanpassen…", dat het bestaande plan- of afwezigheidsvenster opent met start/eind-velden.

## Test

In een echte browser: project 08:00–12:00 doortrekken naar 15:00; project van één dag naar meerdere dagen; vakantie van drie naar vijf dagen en weer inkorten; team gezamenlijk verlengen; verlenging over een Bezet-blok wordt geblokkeerd; overlap met ander project geeft waarschuwing met Toch opslaan; na refresh blijft alles behouden.
