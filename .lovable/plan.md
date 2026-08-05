# Als eerste uitvoeren (eerste project van de dag)

Een planningblok kan per medewerker per dag gemarkeerd worden als het project dat als eerste uitgevoerd moet worden. De markering wordt zichtbaar met een ster, zet het blok bovenaan en hernummert de rest.

## Wat er komt

**Contextmenu (rechtsklik op een ingepland project)**
Nieuwe actie boven "Bewerken…": "⭐ Als eerste uitvoeren". Staat het blok al als eerste gemarkeerd, dan toont het menu "Markering verwijderen". De actie verschijnt alleen bij projectplanningen — niet bij Bezet, Vakantie of Ziek.

**Gedrag bij markeren**
- Het gekozen blok krijgt `isFirstOfDay: true` en volgordenummer 1.
- De overige projectblokken van diezelfde medewerker op diezelfde dag houden hun onderlinge volgorde en worden hernummerd naar 2, 3, 4, …
- Een eventueel eerder gemarkeerd blok van die medewerker op die dag verliest de markering automatisch.
- Alles wordt in één opslagactie bewaard, zodat de volgorde na een refresh klopt.

**Zichtbaarheid van de markering**
- Personeelsplanning, dagweergave: ster vóór de projectnaam.
- Personeelsplanning, week-/maandweergave: klein sterretje in het gekleurde blokje, met tooltip "Als eerste uitvoeren".
- Projectdetails: ster achter de betreffende datumregel van de medewerker.
- Agenda: klein sterretje/badge op het projectblok van die dag.

**Bewerken blijft werken**
De bestaande pijltjes (omhoog/omlaag) blijven werken. Wordt een gemarkeerd blok handmatig naar beneden verplaatst, dan vervalt de markering, omdat het dan niet meer als eerste staat.

## Technische details

- Veld `isFirstOfDay?: boolean` toevoegen aan de bestaande `AvailEntry` in `src/components/planning-app.tsx`. Opslag gaat via de bestaande JSONB `availability.data` — geen nieuwe kolom of tabel, geen migratie.
- Nieuwe functie `markFirstOfDay(row, on)` in `PersoneelsplanningView`, naast `reorderDayPlans`: leest `rowsFor(empId, date)`, zet het gekozen blok vooraan (of laat de bestaande sortering staan bij ontmarkeren), schrijft `volgorde: idx` en `isFirstOfDay: idx === 0 && on` voor alle blokken van die dag en slaat ze in één keer op met de bestaande `commitPlanning`.
- Sortering (`byVolgorde`) hoeft niet te wijzigen; het gemarkeerde blok krijgt gewoon volgorde 0. Voor de zekerheid wordt `isFirstOfDay` als eerste sorteersleutel meegenomen bij gelijke volgorde.
- `reorderDayPlans` past `isFirstOfDay` aan zodat alleen het blok op index 0 de markering kan houden.
- Iconen via de bestaande lucide-react `Star` import-stijl; kleuren uit het bestaande palet.
