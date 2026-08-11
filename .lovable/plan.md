# Vaste vrije dagen, uitzonderingen, bredere weekweergave en feestdagen

Alles gebeurt in `src/components/planning-app.tsx`. Geen nieuwe pagina, geen tweede agenda, geen migratie: `availability` en `app_settings` blijven de enige bron.

## 1. Vaste wekelijkse vrije dagen

- Nieuwe knop **Vaste vrije dagen** per medewerker in Personeelsplanning (in de medewerkerkolom en in het rechtsklik-snelmenu van een cel).
- Venster met: weekdagen (ma t/m zo, meerdere tegelijk), Vanaf datum, Tot en met datum.
- Opslaan maakt voor iedere gekozen weekdag binnen de periode een hele dag met status `Vrij`, zonder project, met één gedeeld `periodeId` voor de hele reeks. Opslaan gaat in één keer via de bestaande `savePlanningMany`.
- Deze dagen blokkeren projectplanning via de bestaande conflictcontrole en blijven na refresh staan. In Agenda blijven persoonlijke Vrij-dagen verborgen (ongewijzigd).

### Bestaande reeksen beheren

- In hetzelfde venster een lijst met de vaste reeksen van die medewerker, bijv. "Vrijdag — 01-09-2026 t/m 31-12-2026", elk met **Wijzigen** en **Verwijderen**.
- De lijst komt uit centraal opgeslagen reeksdefinities in de bestaande `app_settings`-JSON (`fixedFreeSeries`: `periodeId`, `employeeId`, `serieWeekdays`, `serieStartDate`, `serieEndDate`), niet uit de gegenereerde Vrij-regels. Zo blijft een reeks altijd herkenbaar, ook als alle dagen inmiddels uitzonderingen zijn of op alle datums al projecten staan. De daadwerkelijke dagen en uitzonderingen blijven in `availability`.
- Wijzigen van een reeks (bijv. vrijdag → donderdag) verwijdert eerst de oude automatisch gegenereerde regels van diezelfde reeks: alleen regels met `periodeId` van de reeks, `serieType === "vastevrij"`, `status === "Vrij"`, zonder `projectId` en `isSeriesException !== true`. Individuele uitzonderingen en alle projectplanning blijven behouden. Daarna wordt de nieuwe reeks met hetzelfde `periodeId` opgebouwd en de definitie in `fixedFreeSeries` bijgewerkt.
- Bij het wijzigen worden ook alle bestaande uitzonderingen en projectmarkeringen van dat `periodeId` opnieuw beoordeeld:
  - valt de datum nog binnen de nieuwe periode én op een gekozen weekdag, dan blijft de koppeling met de reeks bestaan (en wordt die datum niet automatisch Vrij gemaakt);
  - valt de datum daarbuiten, dan blijft de regel bestaan met exact dezelfde status (Ziek, Vakantie, Bezet, Beschikbaar) maar verliest de koppeling: alleen `periodeId`, `isSeriesException` en de `serie*`-velden van deze vaste-vrij-reeks worden verwijderd;
  - bij projectplanning die buiten de nieuwe reeks valt wordt uitsluitend dit `periodeId` uit `vasteVrijExceptionIds` gehaald; het project zelf wordt nooit gewijzigd of verwijderd.
  - Voorbeeld: reeks "iedere vrijdag Vrij" met vrijdag 18 september als uitzondering op Beschikbaar wordt gewijzigd naar "iedere donderdag Vrij". Donderdag wordt de vaste vrije dag, 18 september blijft Beschikbaar, maar verliest de koppeling met dat `periodeId`.
- Verwijderen van een reeks wist de automatisch gegenereerde `Vrij`-regels en de reeksdefinitie uit `fixedFreeSeries`. Verder geldt: een puur voor de reeks aangemaakte `Beschikbaar`-uitzondering mag weg; `Ziek`, `Vakantie` en `Bezet` blijven altijd staan als echte personeelsstatus; projectplanning blijft altijd staan. Bij die behouden regels wordt uitsluitend de koppeling met de reeks verwijderd (`periodeId`, `isSeriesException`, `serie*`-velden en/of het `periodeId` uit `vasteVrijExceptionIds`). De vaste-vrij-functie verwijdert dus nooit echte personeelsplanning.

### Datums waarop al een project staat

- Staat er op een gegenereerde datum al projectplanning voor die medewerker, dan wordt eerst een waarschuwing getoond met die datums.
- Na bevestiging blijft de projectplanning volledig behouden en wordt op die datum géén `Vrij`-blok en géén tweede losse regel aangemaakt. In plaats daarvan wordt op de bestaande projectplanningregel het `periodeId` toegevoegd aan `vasteVrijExceptionIds`. Het blijft dus een gewone projectplanning, maar de vaste-vrij-logica weet dat die datum niet automatisch Vrij mag worden.
- Bij het (opnieuw) opbouwen van een reeks wordt een datum overgeslagen wanneer er een exception-regel bestaat met hetzelfde `periodeId` en `isSeriesException === true`, óf wanneer een projectplanning op die datum dat `periodeId` in `vasteVrijExceptionIds` heeft.
- Alle overige datums van de reeks worden wel normaal als `Vrij` aangemaakt. Zo ontstaan nooit dubbele of conflicterende Vrij- en projectblokken.


## 2. Eén vaste vrije dag afzonderlijk wijzigen

- Klikken op een `Vrij`-blok dat bij een vaste reeks hoort toont eerst de keuze **Alleen deze dag wijzigen** / **Hele reeks wijzigen**, met duidelijke uitleg dat de tweede optie de volledige reeks raakt.
- **Alleen deze dag**: opent de bestaande mogelijkheden (Beschikbaar, Bezet, Ziek, Vakantie, Vrij, Project inplannen) en wijzigt uitsluitend die datum. De regel houdt hetzelfde `periodeId` en krijgt `isSeriesException: true`.
- Bij het opnieuw opbouwen of wijzigen van een reeks worden datums met een bestaande uitzondering binnen hetzelfde `periodeId` overgeslagen; die worden nooit automatisch terug op `Vrij` gezet.
- **Hele reeks wijzigen** opent het reeksvenster uit punt 1.
- **Project inplannen** vanaf een vaste Vrij-dag toont eerst: "Deze medewerker is normaal op deze dag Vrij. Alleen deze datum beschikbaar maken en een project inplannen?" Na bevestiging wordt het `periodeId` onthouden en uitsluitend de `Vrij`-regel van die ene datum verwijderd, zodat de conflictcontrole (die alleen naar werkelijk aanwezige availability-regels kijkt) de datum niet meer blokkeert. Alle andere dagen van de reeks blijven ongewijzigd. Daarna opent de bestaande inplanflow.
- Zodra het project is ingepland wordt het onthouden `periodeId` toegevoegd aan `vasteVrijExceptionIds` van die projectplanningregel. Er komt geen extra `Vrij`-regel en geen tweede exception-regel naast het project.
- Annuleert de gebruiker de inplanflow, dan wordt de oorspronkelijke `Vrij`-regel hersteld (of, als de gebruiker uitdrukkelijk voor Beschikbaar koos, blijft de datum als expliciete `Beschikbaar`-uitzondering met `isSeriesException: true` staan). Een dag verdwijnt nooit ongemerkt uit de reeks.
- Eindresultaat: project aanwezig, geen `Vrij` op die datum, `periodeId` in `vasteVrijExceptionIds`, overige vaste vrije dagen intact, datum overgeslagen bij heropbouw, en bij verwijderen van de reeks blijft het project met alleen dat `periodeId` verwijderd.

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

- `AvailEntry` krijgt optioneel `isSeriesException?: boolean`, `serieType?: "vastevrij"`, `serieWeekdays?: number[]`, `serieStartDate?: string`, `serieEndDate?: string` en `vasteVrijExceptionIds?: string[]` (alles binnen de bestaande JSONB-data, geen migratie). De reeksinstellingen worden op elke regel van de reeks meegeschreven, inclusief uitzonderingsregels, zodat het beheervenster de reeks altijd kan reconstrueren.
- Nieuw `FixedFreeDaysModal` (weekdagselectie, periode, reeksenlijst, wijzigen/verwijderen) plus een kleine keuzedialoog "Alleen deze dag / Hele reeks".
- Reeksopbouw: oude gegenereerde regels van dezelfde reeks eerst opruimen (zie hierboven), datums filteren op gekozen weekdagen, datums met exception-regel of met `vasteVrijExceptionIds`-markering overslaan, projectdatums melden en na bevestiging alleen markeren, de rest als hele dag `Vrij`. Alles via één opslagactie (`savePlanningResize`-achtige combinatie van toevoegen en verwijderen) met hetzelfde `periodeId`.
- Verwijderen van een reeks: definitie uit `fixedFreeSeries` weg; `Vrij`- en `Beschikbaar`-exceptionregels met dat `periodeId` en zonder `projectId` weg; `Ziek`/`Vakantie`/`Bezet` en projectregels blijven staan en verliezen alleen de reeksvelden (`periodeId`, `isSeriesException`, `serie*`) respectievelijk het `periodeId` in `vasteVrijExceptionIds`.
- `AppSettings` krijgt `fixedFreeSeries?: {periodeId:string;employeeId:string;serieWeekdays:number[];serieStartDate:string;serieEndDate:string}[]`, opgeslagen via de bestaande `syncSettings`; geen nieuwe tabel of migratie.
- `AppSettings` krijgt `holidayColor?: string`; helper `holidayColorOf(settings)` met fallback `#D946EF`, gebruikt door Personeelsplanning, Agenda en `ColorManagerModal`.
- Weekweergave: tabel/grid met `gridTemplateColumns: 180px repeat(7, minmax(90px, 1fr))` en `w-full` in plaats van de huidige `minWidth`-berekening.
- Verificatie in een echte browser: reeks aanmaken over drie maanden, refresh, één dag als uitzondering naar Beschikbaar, project op die dag inplannen, weekbreedte op groot en klein scherm, en feestdagen plus kleurwijziging in alle vier de weergaven.
- Extra scenario: iedere vrijdag Vrij, één vrijdag als losse uitzondering op Beschikbaar, op een andere vrijdag al een project; daarna de reeks van vrijdag naar donderdag wijzigen en controleren dat de oude normale vrijdagen verdwijnen, de losse uitzondering blijft, het project onaangeroerd blijft en de donderdagen Vrij worden. Daarna de hele reeks verwijderen en controleren dat alle Vrij-regels weg zijn terwijl het project blijft bestaan met alleen de vaste-vrij-markering verwijderd.
