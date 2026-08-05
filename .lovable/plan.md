# Openstaande projecten, teamverplaatsing en kleurbeheer

Alle wijzigingen blijven binnen `src/components/planning-app.tsx` (Personeelsplanning + Kleuren beheren). Geen nieuwe pagina's, geen tweede agenda, geen databasemigratie: kleuren blijven in de bestaande instellingen (`app_settings`).

## 1. Openstaande projecten blijft een planningslijst

Nu verdwijnt een project zodra alle benodigde medewerkers zijn ingepland (filter `rest > 0`, met een checkbox "Volledig ingeplande projecten tonen").

Nieuw gedrag:
- De lijst toont elk project in de periode waarvan de status niet **Afgerond** (en niet **Gefactureerd**) is. De checkbox vervalt.
- De planningsstatus bepaalt alleen nog de badge: **Niet ingepland** (grijs), **Gedeeltelijk ingepland** (amber), **Volledig ingepland** (groen), naast de bestaande teller `n/nodig`.
- Zodra de status van een project in Projecten of via de statuscel op **Afgerond** wordt gezet, verdwijnt het direct uit de lijst en worden de aantallen herberekend.
- De badge **Eerste** (⭐) verdwijnt uit deze lijst. De markering "Als eerste uitvoeren" blijft in Personeelsplanning, Agenda en Projectdetails ongewijzigd.
- Sorteervolgorde blijft: nog in te plannen eerst, daarna op startdatum.
- De lijst en de badge worden realtime herberekend uit de actuele planningregels, dus direct na: een statuswijziging, een medewerker inplannen, een planning verwijderen, of een wijziging van het aantal benodigde medewerkers.

Opmerking: de app kent op dit moment de statussen Offerte, Bevestigd, In uitvoering, Afgerond en Gefactureerd — er is geen status "Geannuleerd". Ik filter daarom op Afgerond en Gefactureerd; als er echt een status Geannuleerd moet komen, kan dat later apart.

## 2. Meerdere medewerkers per project

Dit werkt al: planningregels worden per medewerker opgeslagen met hetzelfde `projectId`, zonder limiet. Doordat het project niet meer uit de lijst verdwijnt, blijft het inplannen van extra medewerkers (andere dagen/tijden) gewoon mogelijk vanuit dezelfde lijst.

## 3. Team standaard samen verplaatsen

Bij slepen van een blok dat op die dag bij een team hoort (zelfde project, zelfde dag, zelfde `teamId`/teamkleur) opent nu een keuzevenster met "Alleen deze planning" als eerste knop.

Nieuw:
- **Hele team verplaatsen** wordt de primaire, vooraf gekozen actie (Enter/hoofdknop).
- **Alleen deze medewerker verplaatsen** blijft beschikbaar als secundaire keuze.
- Bij het gezamenlijk verplaatsen blijven `teamId`, teamkleur en `reeksId` behouden; datum, planning van alle teamleden, Agenda, Beschikbaarheid, Projectdetails en de afgeleide projectperiode worden zoals nu automatisch bijgewerkt.

## 4. Ziek wordt grijs

De standaardkleur van de status **Ziek** gaat van amber naar grijs. Omdat alle schermen deze kleur al via één centrale functie lezen, verandert dit tegelijk: Personeelsplanning (dag/week/maand/kwartaal), Agenda, afwezigheidsblokken, dagranden bij een hele dag ziek, legenda en de standaardwaarde in Kleuren beheren.

## 5. Kleuren beheren uitbreiden

Het venster krijgt alle kleurgroepen op één plek, elk met kleurkiezer en live voorbeeld:
- Statussen: Beschikbaar, Ingepland, Bezet, Vakantie, Ziek, Vrij (en toekomstige statussen automatisch).
- Afdelingen, Filters, Teams, Projecten (bestaand, blijft).
- Nieuw: Dagranden (rand hele dag afwezig) en Badges (planningsstatussen Niet/Gedeeltelijk/Volledig ingepland).

Per kleur: kleurkiezer, live voorbeeld en **Standaard herstellen**. Onderin **Opslaan** (alles) en **Alles standaard herstellen**. Opslaan schrijft naar de bestaande instellingen in de database, zodat de kleuren na een refresh behouden blijven en direct doorwerken in Personeelsplanning, Agenda, Projectdetails, Openstaande projecten, legenda en dashboard. Nergens komen hardcoded of pagina-eigen kleuren terug.

## Technische details

- `openProjects` in `PersoneelsplanningView` filtert voortaan op `p.status !== "Afgerond" && p.status !== "Gefactureerd"`; `showPlanned` en de bijbehorende checkbox vervallen. `planStatusOf` levert de badgetekst.
- De ⭐-badge wordt uit het lijstitem verwijderd; `isFirstOfDay` blijft ongewijzigd in de planningsdata en de andere views.
- `teamChoice`-modal: knopvolgorde/variant omgedraaid zodat "Hele team verplaatsen" primair is; `moveBlocks(t.teamRows, ...)` blijft de bestaande implementatie.
- `AS.Ziek` krijgt grijstinten (`bg #F1F3F6`, `text #374151`, `dot #6B7280`); alle schermen lezen dit via `statusColorOf`.
- `AppSettings` krijgt optioneel `borderColors` en `badgeColors` (JSON in `app_settings`, geen migratie nodig); nieuwe helpers `borderColorOf`/`badgeColorOf` met dezelfde overridelogica als `statusColorOf`.
