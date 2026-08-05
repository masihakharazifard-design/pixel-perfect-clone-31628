# Als eerste uitvoeren (eerste project van de dag)

Een planningblok kan per medewerker per dag gemarkeerd worden als het project dat als eerste uitgevoerd moet worden. De markering wordt zichtbaar met een ster, zet het blok bovenaan en hernummert de rest.

## Contextmenu

Bij rechtsklikken op een ingepland project verschijnt bovenaan "⭐ Als eerste uitvoeren". Is het blok al gemarkeerd, dan staat er "⭐ Markering verwijderen". De actie verschijnt uitsluitend bij projectplanningen, niet bij Bezet, Vakantie of Ziek.

## Gedrag bij markeren

- Het gekozen blok krijgt `isFirstOfDay: true` en volgordenummer 1.
- De overige projectblokken van dezelfde medewerker op dezelfde dag houden hun onderlinge volgorde en worden hernummerd naar 2, 3, 4, …
- Een eerder gemarkeerd blok van die medewerker op die dag verliest de markering automatisch.
- Alles wordt in één opslagactie bewaard, zodat de volgorde na een refresh klopt.

## Handmatige volgorde

Pijltjes omhoog/omlaag en drag & drop blijven ongewijzigd werken.

- Wordt een gemarkeerd blok handmatig naar beneden verplaatst, dan vervalt de markering automatisch.
- Wordt een blok handmatig naar positie 1 verplaatst, dan vraagt de app "Dit project als eerste uitvoeren?" met Ja / Nee. Bij Ja wordt de markering gezet, bij Nee alleen de volgorde bijgewerkt.
- Wordt het gemarkeerde blok verwijderd, dan krijgt het eerstvolgende project van die medewerker op die dag automatisch de markering.
- Bij verplaatsen naar een andere dag of medewerker, en bij het verlengen van een reeks, blijft de markering alleen staan als het blok daar nog steeds het eerste project van die medewerker op die dag is; anders vervalt hij en worden beide dagen hernummerd.

## Weergave

- Personeelsplanning dagweergave: ster vóór de projectnaam.
- Personeelsplanning week-, maand- en kwartaalweergave: klein ster-icoon op het projectblok, met tooltip "Als eerste uitvoeren".
- Projectdetails: ster achter de betreffende planningregel.
- Agenda: klein sterretje op het projectblok.
- Openstaande projecten: badge "Eerste" wanneer het project ergens als eerste van de dag is ingepland.

De ster is onderdeel van de normale opmaak, zodat hij bij afdrukken en exporteren zichtbaar blijft.

## Technische details

- Veld `isFirstOfDay?: boolean` toevoegen aan de bestaande `AvailEntry` in `src/components/planning-app.tsx`. Opslag via de bestaande JSONB `availability.data` — geen nieuwe kolom of tabel, geen migratie.
- Nieuwe functie `markFirstOfDay(row, on)` in `PersoneelsplanningView`: haalt via `rowsFor(empId, date)` alle projectregels van die medewerker op die dag op, wist bestaande markeringen, zet het gekozen blok op positie 1, hernummert de rest en slaat alles in één `commitPlanning()` op.
- Hulpfunctie `renumberDay(rows)` die `volgorde: idx` en `isFirstOfDay: idx === 0 && wasMarked` toekent; hergebruikt door `reorderDayPlans`, verwijderen, verplaatsen en resize, zodat er nooit meer dan één markering per medewerker per dag bestaat.
- `reorderDayPlans()` roept `renumberDay` aan en toont de bevestigingsvraag wanneer een ongemarkeerd blok op positie 1 belandt.
- Bij verwijderen van een planningregel (contextmenu en `onDeletePlanning`-pad in Personeelsplanning) wordt de dag hernummerd en promoveert het volgende blok.
- Sortering: `byVolgorde` krijgt `isFirstOfDay` als eerste sleutel bij gelijke volgorde.
- Iconen via lucide-react `Star` (gevuld), in het bestaande kleurenpalet.
