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

## Bewaking, automatiek en synchronisatie

**Altijd maximaal één markering**
Een normalisatiestap draait bij het inlezen van de planning én vóór iedere opslag: bestaan er binnen dezelfde medewerker en dag meerdere gemarkeerde blokken (door import, synchronisatie of oude gegevens), dan blijft alleen het blok met de laagste volgorde gemarkeerd en vervallen de overige markeringen automatisch.

**Automatische markering bij één project**
Heeft een medewerker op een dag precies één projectblok, dan wordt dat blok automatisch als eerste gemarkeerd. Komt er later een tweede project bij, dan blijft de bestaande markering staan tot de gebruiker die zelf wijzigt.

**Kopiëren**
Bij het kopiëren van een planning naar een andere dag gaat de markering niet mee. Op de nieuwe dag bepaalt de normalisatie of het blok daar de eerste is (bijvoorbeeld als het het enige project van die dag is).

**Excel-import**
De import en synchronisatie vanuit Excel laten `isFirstOfDay` ongemoeid; bestaande waarden worden niet overschreven. De markering wordt uitsluitend beheerd vanuit Personeelsplanning.

**Doorwerken in alle schermen**
Personeelsplanning, Agenda, Projectdetails en het dashboard lezen dezelfde planningregels, dus de markering verschijnt overal tegelijk. Elke wijziging wordt eerst naar de database geschreven en daarna teruggelezen, zodat elk scherm exact dezelfde volgorde toont.

**Automatische controle bij tijdswijzigingen**
Zodra een begintijd of eindtijd verandert (bewerken, slepen of doortrekken), controleert de app of het gemarkeerde project nog steeds als eerste begint. Begint een ander project op die dag nu eerder, dan verschijnt de melding: "Er is nu een project dat eerder begint. Wilt u dit project automatisch als eerste uitvoeren markeren?" — Ja verplaatst de markering naar het vroegst startende project, Nee laat de bestaande markering staan. De vraag verschijnt alleen als er daadwerkelijk een eerder startend project is.


### Technisch

- `normalizeFirstOfDay(rows)`: groepeert projectregels op medewerker + datum, houdt de markering met de laagste `volgorde` aan, wist de rest en zet de markering automatisch wanneer de groep één regel bevat. Toegepast in `planning-store` bij het laden en in `commitPlanning`/`tryCommit` vóór het wegschrijven.
- Kopieeracties strippen `isFirstOfDay` op de nieuwe regel; daarna draait `normalizeFirstOfDay` op de doeldag.
- Bij Excel-import wordt bij het samenvoegen van bestaande availability-regels `isFirstOfDay` uit de bestaande regel behouden.
- Na een geslaagde opslag wordt de bestaande herlaad-/sync-flow gebruikt, zodat alle weergaven op dezelfde serverstatus draaien.
- `checkFirstStartConflict(empId, date)`: draait na elke tijdswijziging (`AbsenceModal`-opslag, drag-and-drop en `applyResize`) en vergelijkt de starttijd van het gemarkeerde blok met de vroegste starttijd van die dag. Bij een eerder startend project wordt een bevestigingsmodal (Ja/Nee) getoond; "Ja" roept `markFirstOfDay(vroegsteRij, true)` aan, "Nee" doet niets. Zonder markering op die dag gebeurt er niets extra's, buiten de bestaande `normalizeFirstOfDay`.


