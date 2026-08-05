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

- `src/components/planning-app.tsx`: nieuwe `PlanEmployeeModal` (zoek + autofill + tijden), klikbare cellen en drag & drop in `PersoneelsplanningView`, nieuw blok "Projecten in deze periode", conflictcontrole-helper, filterbeheer-modal, teamkleur-helper (stabiele hash op gesorteerde medewerker-id's + project + datum, met handmatige overrides), verwijderen van uurprijs/uren uit `ProjectDetail` en `ProjectForm`, nieuw veld `benodigdeMedewerkers`.
- Planning schrijft naar de bestaande `availability`-rijen (`status:"Ingepland"`, `projectId`) plus afgeleide `projects.data.medewerkers`; write-through via `syncTable` uit `src/lib/planning-store.ts`, met rollback bij fouten.
- Filterdefinities en teamkleur-overrides worden opgeslagen in `app_settings` (bestaande jsonb-tabel) via `syncSettings`. Geen migratie nodig.
