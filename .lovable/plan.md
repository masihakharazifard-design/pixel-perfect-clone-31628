# Excel-import kolommen J/K + agendafiltering

Alleen de projectimport en de agendafiltering wijzigen. Geen nieuwe velden, pagina's of kalenders.

## 1. Vaste kolomposities bij projectimport

- Kolom J (index 9) → Werkzaamheden
- Kolom K (index 10) → Projectleider

Deze twee waarden worden niet meer op kolomnaam gezocht (de huidige "Calculator"-detectie en het gebruik van de tweede "Omschrijving" voor werkzaamheden vervallen). Alle overige kolommen (Projectnr., eerste Omschrijving, opdrachtgever, contactpersoon, datums en tijden, Werknr.) blijven werken zoals nu.

De afdelingsherkenning (Stoffering / Schilderwerk / Zonwering / Turnkey) blijft de tekst uit kolom J gebruiken, dus die logica verandert niet van bron.

Projectleider uit kolom K:
1. eerst matchen op een bestaande medewerker;
2. geen match → de exacte tekst uit kolom K opslaan en tonen;
3. de waarde wordt nooit weggegooid.

Deze mapping geldt uitsluitend voor de projectimport; de beschikbaarheidsimport blijft ongewijzigd.

## 2. Lege startdatum bij import

Rijen zonder Startdatum krijgen geen "vandaag"-datum meer, maar een lege start- en einddatum. Ze blijven zichtbaar in Projecten en vallen uit de agenda. Overal waar met datums wordt gerekend (Projecten-lijst, filters, dashboard, medewerkerplanning) wordt een leeg datumveld veilig afgehandeld, zodat er geen "Invalid Date" verschijnt.

## 3. Agendafiltering

Een project verschijnt alleen in de agenda als:
1. het een geldige Startdatum heeft; én
2. de status niet "Offerte" is.

Dit geldt voor dag-, week-, maand- en kwartaalweergave (één centrale filter in de agenda, die alle weergaven voedt). Er wordt geen enkele vervangende datum gebruikt: start = Startdatum + Starttijd (leeg → 08:00), eind = Einddatum (leeg → dezelfde dag als Startdatum) + Eindtijd (leeg → 17:00).

Let op, zoals afgesproken: geïmporteerde projecten behouden status "Offerte" en staan dus pas in de agenda nadat je hun status wijzigt naar bijvoorbeeld Bevestigd.

## 4. Opslag

Na bevestigen van de import worden de projecten direct in de database opgeslagen en daarna opnieuw uit de database geladen, zodat Projecten, Agenda en Dashboard dezelfde opgeslagen gegevens tonen. Na refresh blijven kolom J (Werkzaamheden) en kolom K (Projectleider) staan.

## 5. Test

Import van een testbestand met bekende rijen, en controle van: kolom J onder Werkzaamheden, kolom K onder Projectleider, behoud na refresh, Offerte-project niet in agenda, project zonder startdatum niet in agenda, en een project met startdatum + status Bevestigd op de juiste datum en tijd.

## Technische details

- `src/components/planning-app.tsx`, `ExcelImportModal`: `col_omschr2`/`col_calculator` vervangen door vaste indexen 9 en 10; `ImportRow` krijgt `werkzaamheden` naast `rawDept` (die dezelfde J-tekst voor afdelingsherkenning houdt).
- `handleImport`: `werkzaamheden` uit kolom J, `projectleider` uit kolom K (employee-id bij match, anders ruwe tekst), geen `fallbackDate` meer — lege datums blijven `""`.
- `AgendaView.filteredProjects`: extra voorwaarde `p.status !== "Offerte" && p.startdatum is geldig`, doorgegeven aan Day/Week/Month/Kwartaal.
- Databasevelden: `projects.data.werkzaamheden` (kolom J) en `projects.data.projectleider` (kolom K).
