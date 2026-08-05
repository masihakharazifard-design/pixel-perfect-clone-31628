# Personeelsplanning: Bezet, Vakantie en Ziek rechtstreeks plannen

Alles blijft in de bestaande Personeelsplanning, op de bestaande availability-gegevens. Geen tweede agenda, geen nieuw ontwerp.

## Wat er al werkt (blijft staan)
- Afwezigheidsvenster met medewerker, start-/einddatum, tijden, "hele dagen", notitie en periode-ID voor meerdaagse periodes.
- Rechtsklik-snelmenu op een dagcel, gekleurde celrand bij een volledig geblokkeerde dag, en conflictcontrole die Bezet/Vakantie/Ziek blokkeert terwijl dubbele projectplanning alleen waarschuwt.
- Shift-klik om twee cellen te selecteren en daarna een periode afwezigheid te kiezen.

## 1. "Vrij" verdwijnt voor nieuwe regels
- "Vrij" wordt verwijderd uit het dagcelmenu, de statuskeuzelijst in het afwezigheidsvenster, de filters, de legenda en het kleurenbeheer.
- Bestaande regels met "Vrij" blijven bestaan, blijven zichtbaar en blijven blokkerend voor conflictcontrole; bij bewerken wordt de status omgezet naar een van de overgebleven statussen.
- De Excel-import maakt geen nieuwe "Vrij"-regels meer aan (die rijen worden Bezet).

## 2. Dagcelmenu
Links- én rechtsklik op een cel opent hetzelfde menu:
- Project inplannen…
- Bezet
- Vakantie
- Ziek
- Beschikbaar (verwijdert alle afwezigheid op die dag/dat tijdvak)
- Verwijderen (verwijdert alles in die cel: afwezigheid en projectblokken)

Bezet, Vakantie en Ziek openen direct het afwezigheidsvenster met die status voorgeselecteerd, in plaats van meteen een hele dag weg te schrijven.

## 3. Het venster per status
Eén venster, velden afhankelijk van de status:
- Bezet: medewerker, datum, starttijd, eindtijd, hele dag, notitie.
- Ziek: medewerker, startdatum, einddatum, tijden of hele dag, notitie — meerdere dagen krijgen één gedeeld periode-ID.
- Vakantie: zelfde als Ziek, tijden optioneel; zonder tijden gelden volledige dagen.

## 4. Periode selecteren
- Shift-klik blijft werken.
- Nieuw: knop "Periode selecteren" boven het rooster (ook bruikbaar op mobiel). Aan = cellen aantikken selecteert dagen; daarna kies je Vakantie, Ziek of Bezet voor de hele selectie.

## 5. Bestaand blok aanklikken
Klikken op een Bezet-/Vakantie-/Ziek-blok opent een klein keuzemenu: Bewerken, Verwijderen, Beschikbaar maken. Bij een meerdaagse periode gelden Bewerken en Verwijderen voor de hele periode (alle regels met hetzelfde periode-ID). "Beschikbaar maken" verwijdert het blok of de periode; er wordt geen aparte "Beschikbaar"-regel aangemaakt.

## 6. Weergave
- Vakantie- en ziekteperiodes worden per week getoond als één doorlopende balk over de betrokken dagen in plaats van losse blokjes.
- Hele dag geblokkeerd: rode rand bij Bezet, oranje bij Vakantie, blauw bij Ziek. Gedeeltelijk tijdvak kleurt alleen het blok.
- De legenda onder het rooster toont Ingepland, Bezet, Vakantie en Ziek.

## 7. Conflicten en opslag
- Inplannen tijdens Bezet, Vakantie of Ziek blijft geblokkeerd met een melding die medewerker, status, datum en tijd noemt.
- Elke wijziging wordt eerst opgeslagen in de database, daarna wordt de planning opnieuw geladen; mislukt het opslaan, dan blijft het scherm ongewijzigd met een foutmelding.
- Agenda, medewerkerdetails en dashboard lezen dezelfde availability-gegevens en lopen dus automatisch mee.

## Technische details
Alles in `src/components/planning-app.tsx`:
- `ABSENCE_STATS` wordt `["Vakantie","Ziek","Bezet"]`; `AvailStatus` behoudt `"Vrij"` zodat oude regels blijven werken. `LEGACY_BLOCKING` houdt "Vrij" en "Niet beschikbaar" blokkerend in `findConflicts`.
- `cellClick` opent het bestaande `cellMenu` in plaats van direct `openPlan`; menu-items roepen `openAbsence(empId,date,date,status)` aan (signature uitgebreid met status), plus `clearCell` voor Beschikbaar/Verwijderen via `onSaveManyPlanning`/bestaande delete-flow.
- `AbsenceModal`: statuskeuze zonder Vrij, bij Bezet één datumveld (einddatum = startdatum), status-afhankelijke labels.
- Nieuw `blockMenu`-state: klik op een afwezigheidsblok toont Bewerken / Verwijderen / Beschikbaar maken in plaats van meteen `openEditAbsence`.
- Nieuw `rangeMode`-state + knop "Periode selecteren" in de toolbar; verzamelt geselecteerde datums per medewerker en opent het venster met min/max datum.
- `absFor` wordt in de week-/maandweergave gegroepeerd per `periodeId` tot één doorlopende balk (colspan-achtige overlay binnen de rij).
- `dayBlockState` blijft de randkleur leveren; standaardkleuren in `statusColorOf` worden rood/oranje/blauw voor Bezet/Vakantie/Ziek.
- Import-mapping (regel ~821) mapt "vrij"/"free"/"rtvz" voortaan naar "Bezet".

## Test
Bezet één dag, Bezet 13:00–17:00, Ziek over drie dagen, Vakantie over meerdere dagen via het venster én via "Periode selecteren", periode bewerken, periode verwijderen, beschikbaar maken, project inplannen tijdens Bezet (geblokkeerd), en verversen om te controleren dat alles behouden blijft.
