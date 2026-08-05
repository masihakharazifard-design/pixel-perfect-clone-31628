# Personeelsplanning als hoofdplanning

Bestaand ontwerp, pagina's en de bestaande agenda blijven ongewijzigd. Er komen geen nieuwe tabellen in de database en geen tweede agenda: de bestaande beschikbaarheidsregels worden hét planningrecord.

## Eén planningrecord

Een inplanning = één regel in de bestaande beschikbaarheidsgegevens met: medewerker, datum, begintijd, eindtijd, status "Ingepland" en het gekoppelde project. Dezelfde regel voedt Personeelsplanning, Agenda, Beschikbaarheid, Projectdetails, Dashboard en Medewerkerdetails. De medewerkerslijst op het project wordt automatisch afgeleid uit deze regels, zodat er nooit twee losse waarheden ontstaan.

## 1. Inplannen vanuit Personeelsplanning

- Iedere dag-/tijdcel (dag-, week-, maand- en kwartaalweergave) wordt aanklikbaar.
- Klikken opent "Medewerker inplannen" met medewerker, datum en tijd al ingevuld.
- Zoekveld zoekt live in werknummer, projectnaam en werkzaamheden/omschrijving.
- Na keuze van een project worden werknummer, projectnaam, werkzaamheden, afdeling, calculator en projectstatus getoond (alleen-lezen). Alleen begin- en eindtijd zijn nog in te vullen.
- Opslaan koppelt de medewerker aan het bestaande project; er wordt nooit automatisch een nieuw project aangemaakt bij een gekozen project.

## 2. Synchronisatie

- Toevoegen, wijzigen, verplaatsen en verwijderen slaat eerst op in de database en ververst daarna direct alle schermen.
- Verwijderen haalt alleen de planning weg: de medewerker wordt weer beschikbaar, project en medewerker blijven bestaan.
- Mislukt opslaan, dan wordt de wijziging teruggedraaid met een foutmelding.

## 3. Projecten in deze periode

Onder de medewerkerslijst komt een nieuw blok met projecten die binnen de gekozen periode vallen. Per project: werknummer, projectnaam, werkzaamheden, calculator, afdeling, startdatum, einddatum, starttijd, eindtijd, benodigde medewerkers en reeds ingeplande medewerkers. Statusbadge: Niet ingepland / Gedeeltelijk ingepland / Ingepland, automatisch afgeleid van het aantal koppelingen (dus ook automatisch terug bij verwijderen).

"Benodigde medewerkers" is een nieuw, handmatig in te vullen aantal per project (standaard 1) dat in het projectformulier wordt toegevoegd.

## 4. Inplannen vanuit de projectenlijst

- Klikken op een project geeft de keuze: Projectdetails openen of Medewerker inplannen.
- Een project kan met slepen op een medewerkerrij/dagcel worden gezet; datum en tijden komen uit de cel en het project.
- Na koppelen worden Personeelsplanning, Agenda, Beschikbaarheid, Projectdetails, Dashboard en de statusbadge direct bijgewerkt.

## 5. Conflictcontrole

Voor opslaan wordt gecontroleerd op vakantie, ziekte, vrij, niet beschikbaar, bestaande planning en overlappende tijden. Bij een conflict verschijnt een duidelijke melding met medewerker, het bestaande project en het conflicterende tijdvak; dubbele planning wordt geblokkeerd.

## 6. Filters beheren

De filterbalk van Personeelsplanning krijgt een beheerscherm: naam en kleur wijzigen, filters toevoegen, verwijderen, aan/uit zetten en volgorde wijzigen (omhoog/omlaag). Dit wordt permanent opgeslagen bij de bestaande instellingen en blijft na refresh behouden.

## 7. Teamkleuren

Iedere unieke combinatie medewerkers op hetzelfde project op dezelfde dag krijgt automatisch een vaste eigen kleur (dezelfde combinatie = altijd dezelfde kleur). De kleur is zichtbaar in Personeelsplanning, Agenda, Projectdetails en in een legenda, en is handmatig aan te passen; aanpassingen worden opgeslagen.

## 8. Projectdetails

Uurprijs en Geschatte uren verdwijnen uit beeld (detailscherm en projectformulier). De gegevens blijven gewoon in de database staan.

## 9. Database

Alle schermen lezen dezelfde gegevens; elke wijziging gaat eerst naar de database en daarna naar het scherm. Geen dubbele planning- of projectrecords. Na refresh blijft alles behouden.

## 10. Test

In een echte browser: medewerker koppelen via Personeelsplanning, zoeken op werknummer en werkzaamheden, opslaan, direct zichtbaar in Agenda, Beschikbaarheid en Projectdetails, badge "Ingepland", tweede medewerker koppelen, teamkleur, planning wijzigen en verwijderen, en na refresh controleren of gegevens, badges en kleuren behouden blijven.

## Technische details

- `src/components/planning-app.tsx`: nieuwe `PlanEmployeeModal` met live zoeken op werknummer, projectnaam en werkzaamheden, automatisch ingevulde projectgegevens en instelbare begin- en eindtijd.
- Bestaande dag-/tijdcellen in `PersoneelsplanningView` worden klikbaar en krijgen drag & drop; in hetzelfde scherm komen het blok "Projecten in deze periode", conflictcontrole, filterbeheer en teamkleuren.
- Uurprijs en geschatte uren worden verborgen in `ProjectDetail` en `ProjectForm`; de databasegegevens blijven staan.
- `benodigdeMedewerkers` wordt opgeslagen als `projects.data.benodigdeMedewerkers`, standaard 1. Geen nieuwe tabel of kolom.
- Uitsluitend de bestaande `availability`-rijen zijn de bron voor personeelsplanning: medewerkerId, datum, begintijd, eindtijd, status `"Ingepland"` en projectId.
- De medewerkerslijst wordt niet daarnaast in `projects.data.medewerkers` bewaard, maar dynamisch afgeleid uit de actieve planningregels met hetzelfde projectId.
- Agenda, Beschikbaarheid, Projectdetails, Dashboard en Medewerkerdetails lezen dezelfde planningregels.
- Bij de eerste ingeplande medewerker wordt de projectperiode gelijkgetrokken met die planning; bij meerdere regels loopt de periode van de vroegste begintijd tot de laatste eindtijd. Wijzigen of verwijderen herberekent de periode op basis van de resterende regels. Wordt de laatste planningregel verwijderd, dan blijven de bestaande project Startdatum en Einddatum staan (project en medewerker blijven bestaan, de medewerker wordt weer beschikbaar); automatisch aanpassen of leegmaken van projectdatums gebeurt alleen na een bevestiging.
- Een project wordt niet gedupliceerd per medewerker: de Agenda groepeert planningregels alleen wanneer projectId, datum, begintijd én eindtijd gelijk zijn. Afwijkende werktijden geven aparte blokken per uniek tijdvak, en ieder blok toont alle medewerkers van dat tijdvak, zodat er niemand verdwijnt of onterecht wordt samengevoegd.
- Teamkleuren gebruiken een stabiele sleutel van projectId + datum + gesorteerde medewerker-ID's; handmatige kleurkeuzes en filterdefinities worden opgeslagen in de bestaande `app_settings`.
- Iedere wijziging wordt eerst met `syncTable` of `syncSettings` opgeslagen; pas na succes worden de gegevens herladen en de schermen ververst, bij een fout wordt de wijziging teruggedraaid.
- Geen nieuwe database-tabellen en geen tweede agenda.
