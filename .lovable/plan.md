# Uitbreiding Personeelsplanning: meerdere projecten, snelle status, teams en notities

Alles bouwt voort op de bestaande planningregels (tabel `availability`). Er komen geen nieuwe planningstabellen; alleen één nieuwe tabel voor persoonlijke notities.

## 1. Meerdere projecten op één dag

- Een medewerker kan per dag onbeperkt tijdblokken hebben; ze worden onder elkaar in dezelfde dagcel getoond, gesorteerd op starttijd, zonder elkaar te overschrijven.
- In de dagweergave staat elk blok als aparte regel met tijd, kleur en projectnaam.
- De bestaande conflictcontrole blijft: alleen echt overlappende tijden geven een waarschuwing; aansluitende blokken (10:00–10:30) niet.

## 2. Snelmenu op een dagcel

Klikken op een dagcel opent een klein menu met:

- Project inplannen (opent het bestaande inplanvenster)
- Bezet / Vakantie / Ziek / Vrij (direct toevoegen of wijzigen, met tijdvak)
- Beschikbaar (verwijdert de Bezet/Vrij/Ziek/Vakantie-blokken van dat tijdvak)
- Verwijderen (alleen het aangeklikte blok)

Bestaat er al een blok, dan opent hetzelfde menu met wijzig- en verwijderopties voor dat blok. Bestaat er nog niets, dan kan de status direct worden toegevoegd. Shift-klik voor een meerdaagse periode blijft werken.

## 3. Koppels als één planning

- Medewerkers die op dezelfde dag, hetzelfde project en hetzelfde tijdvak staan, vormen een team met een gedeeld team-ID en teamkleur.
- Bij het slepen van een teamblok verschijnt een keuzemenu:
  - Hele team verplaatsen (standaard, voorgeselecteerd)
  - Alleen deze medewerker verplaatsen
  - Alleen deze medewerker loskoppelen
- "Hele team verplaatsen" verplaatst alle gekoppelde medewerkers naar de nieuwe dag/tijd met gelijke begin- en eindtijd, hetzelfde project, hetzelfde team-ID en dezelfde teamkleur.
- Conflictcontrole draait voor alle betrokken medewerkers tegelijk; bij een conflict gaat de hele verplaatsing niet door en blijft de oude situatie staan.

## 4. Persoonlijke notities

- Nieuw menu-item "Notities" in de zijbalk.
- Per notitie: datum, titel, notitietekst, kleur en een markering "belangrijk".
- Overzicht per dag, met toevoegen, bewerken en verwijderen; opgeslagen in de database en dus behouden na verversen.
- In de Agenda verschijnt op een dag met een notitie een klein notitie-icoon; klikken opent die notitie.
- Notities zijn gekoppeld aan het e-mailadres waarmee je bent ingelogd en worden alleen aan die gebruiker getoond. Let op: omdat de app nu een demo-login zonder echte accounts gebruikt, is dit een afscherming op gebruikersniveau in de app, geen harde beveiliging in de database. Zodra er echte accounts komen, kan dit worden aangescherpt.
- Notities hebben geen enkele invloed op projecten of planning.

## 5. Opslag

Elke wijziging wordt eerst opgeslagen, daarna verversen alle schermen vanuit dezelfde bron. Mislukt het opslaan, dan wordt de wijziging teruggedraaid met een foutmelding. Bij wijzigen van een bestaand blok of notitie wordt het bestaande record bijgewerkt, zodat er geen dubbele records ontstaan.

## Test

- Eén medewerker met drie projecten op één dag (08:00–10:00, 10:30–13:00, 14:00–17:00).
- Status naar Bezet en daarna terug naar Beschikbaar.
- Status verwijderen.
- Team van twee medewerkers verplaatsen naar een andere dag.
- Eén medewerker uit het team losmaken.
- Notitie toevoegen, terugvinden na verversen, notitie-icoon in de agenda.
- Controleren dat een ander e-mailadres de notitie niet ziet.

## Technische details

- Databasemigratie: nieuwe tabel `personal_notes` met `id`, `owner_key` (e-mailadres in kleine letters), `data` (jsonb met datum, titel, tekst, kleur, belangrijk) en tijdstempels, plus GRANTs en RLS-policies in lijn met de bestaande publieke tabellen. Alle queries filteren op `owner_key`.
- `src/lib/planning-store.ts`: laad-, opslag- en verwijderfuncties voor notities (per `owner_key`), naast de bestaande sync-functies.
- `src/components/planning-app.tsx`:
  - `teamId` toevoegen aan planningregels in het bestaande jsonb `data`-veld; afgeleid team-ID blijft de fallback voor bestaande regels.
  - Nieuw `CellMenu` (snelmenu) en `TeamDropChoice` (keuze bij slepen).
  - `savePlanning` uitbreiden met een variant die meerdere regels in één keer opslaat (teamverplaatsing) inclusief gezamenlijke conflictcontrole en rollback.
  - `setAvailableFor` verwijdert afwezigheidsblokken binnen het gekozen tijdvak.
  - Nieuwe `NotitiesView` plus nav-item `notities`; notitie-icoon in `MonthView`/`WeekView`/`DayView` via de agenda.
- `src/components/auth-gate.tsx` levert het e-mailadres van de huidige gebruiker als `owner_key`.
