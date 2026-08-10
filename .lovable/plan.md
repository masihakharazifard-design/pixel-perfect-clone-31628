# Vaste vrije dagen, uitzonderingen, bredere weekweergave en feestdagen

Alles gebeurt in `src/components/planning-app.tsx`. Geen nieuwe pagina, geen tweede agenda, geen migratie: `availability` en `app_settings` blijven de enige bron.

## 1. Vaste wekelijkse vrije dagen

- Nieuwe knop **Vaste vrije dagen** per medewerker in Personeelsplanning (in de medewerkerkolom en in het rechtsklik-snelmenu van een cel).
- Venster met: weekdagen (ma t/m zo, meerdere tegelijk), Vanaf datum, Tot en met datum.
- Opslaan maakt voor iedere gekozen weekdag binnen de periode een hele dag met status `Vrij`, zonder project, met één gedeeld `periodeId` voor de hele reeks. Opslaan gaat in één keer via de bestaande `savePlanningMany`.
- Deze dagen blokkeren projectplanning via de bestaande conflictcontrole en blijven na refresh staan. In Agenda blijven persoonlijke Vrij-dagen verborgen (ongewijzigd).

### Bestaande reeksen beheren

- In hetzelfde venster een lijst met de vaste reeksen van die medewerker, bijv. "Vrijdag — 01-09-2026 t/m 31-12-2026", elk met **Wijzigen** en **Verwijderen**.
- Wijzigen: weekdagen, begindatum en einddatum aanpassbaar. De reeks wordt opnieuw opgebouwd binnen hetzelfde `periodeId`; bestaande uitzonderingsdagen blijven ongemoeid.
- Verwijderen wist uitsluitend de `Vrij`-regels van díe reeks. Projectplanning, vakantie, ziek, bezet en overige regels blijven altijd staan.
- Staat er op een dag al een project, dan wordt dat nooit automatisch verwijderd: eerst een waarschuwing met de betreffende datums en pas na bevestiging worden alleen de vrije dagen toegevoegd.

## 2. Eén vaste vrije dag afzonderlijk wijzigen

- Klikken op een `Vrij`-blok dat bij een vaste reeks hoort toont eerst de keuze **Alleen deze dag wijzigen** / **Hele reeks wijzigen**, met duidelijke uitleg dat de tweede optie de volledige reeks raakt.
- **Alleen deze dag**: opent de bestaande mogelijkheden (Beschikbaar, Bezet, Ziek, Vakantie, Vrij, Project inplannen) en wijzigt uitsluitend die datum. De regel houdt hetzelfde `periodeId` en krijgt `isSeriesException: true`.
- Bij het opnieuw opbouwen of wijzigen van een reeks worden datums met een bestaande uitzondering binnen hetzelfde `periodeId` overgeslagen; die worden nooit automatisch terug op `Vrij` gezet.
- **Hele reeks wijzigen** opent het reeksvenster uit punt 1.
- **Project inplannen** vanaf een vaste Vrij-dag toont eerst: "Deze medewerker is normaal op deze dag Vrij. Alleen deze datum beschikbaar maken en een project inplannen?" Na bevestiging wordt alleen die datum een uitzondering, blokkeert Vrij die datum niet meer en opent de bestaande inplanflow.

## 3. Weekweergave breder

- De weekweergave gebruikt de volledige contentbreedte: geen vaste tabelbreedte meer, maar een vaste medewerkerkolom plus `repeat(7, minmax(…, 1fr))`, zodat de zeven dagen alle resterende ruimte gelijk verdelen.
- Op smalle schermen blijft horizontaal scrollen mogelijk via een minimumbreedte per dagkolom. Sidebar, dag-, maand- en kwartaalweergave blijven ongewijzigd.

## 4 & 5. Landelijke feestdagen in Personeelsplanning

- Dezelfde bestaande `DUTCH_HOL`/`getDHol`-gegevens die Agenda gebruikt; geen tweede lijst en geen availability-regels voor feestdagen.
- Zichtbaar in Dag, Week, Maand en Kwartaal: lichte achtergrond + bovenrand in de feestdagkleur, en in Dag/Week de naam onder de datum (bijv. "ma 27 apr — Koningsdag"). In Maand/Kwartaal een subtiele markering met de naam als tooltip.
- Bestaande planning (project, Vrij, Vakantie, Ziek, Bezet) blijft volledig zichtbaar en leesbaar. Een feestdag is puur een kalenderkenmerk en verandert nooit een status of beschikbaarheid.

### Feestdagkleur

- `#14B8A6` ligt te dicht bij de bestaande accentkleur `#0ABFB8` (Stoffering/accent). Standaard wordt daarom een duidelijk onderscheidende, nog ongebruikte kleur: fuchsia **`#D946EF`**.
- Nieuwe instelling `holidayColor` binnen de bestaande `app_settings`-JSON, met een centrale helper die overal wordt gebruikt (geen hardcoded kleur in componenten).
- In **Kleuren beheren** komt een sectie **Landelijke feestdagen** met kleurkiezer, voorbeeld en standaard herstellen. Na opslaan verandert de kleur direct in Personeelsplanning en in de Agenda-feestdagmarkering, en blijft na refresh behouden.

## 6. Synchronisatie

Elke wijziging (reeks toevoegen/wijzigen/verwijderen, uitzondering, kleur) wordt eerst opgeslagen via de bestaande `syncTable`/`syncSettings`, waarna de centrale state wordt bijgewerkt en alle schermen die dezelfde planning of instellingen gebruiken automatisch meeveranderen. Bij een fout wordt teruggedraaid met een melding.

## Technische details

- `AvailEntry` krijgt optioneel `isSeriesException?: boolean` en `serieType?: "vastevrij"` (beide in de bestaande JSONB-data, geen migratie).
- Nieuw `FixedFreeDaysModal` (weekdagselectie, periode, reeksenlijst, wijzigen/verwijderen) plus een kleine keuzedialoog "Alleen deze dag / Hele reeks".
- Reeksopbouw: datums in periode filteren op gekozen weekdagen, bestaande uitzonderingen met hetzelfde `periodeId` overslaan, projectdagen melden, daarna `savePlanningMany` met één gedeeld `periodeId`.
- Verwijderen filtert op `periodeId` én `status==="Vrij"` zonder `projectId`, zodat andere regels nooit meegaan.
- `AppSettings` krijgt `holidayColor?: string`; helper `holidayColorOf(settings)` met fallback `#D946EF`, gebruikt door Personeelsplanning, Agenda en `ColorManagerModal`.
- Weekweergave: tabel/grid met `gridTemplateColumns: 180px repeat(7, minmax(90px, 1fr))` en `w-full` in plaats van de huidige `minWidth`-berekening.
- Verificatie in een echte browser: reeks aanmaken over drie maanden, refresh, één dag als uitzondering naar Beschikbaar, project op die dag inplannen, reeks daarna van vrijdag naar donderdag, weekbreedte op groot en klein scherm, en feestdagen plus kleurwijziging in alle vier de weergaven.
