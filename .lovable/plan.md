# Maasmond Planning productieklaar maken

Grote verbouwing in stappen. De app blijft na iedere stap werkend; per stap volgt een build- en browsercontrole voordat de volgende start.

## Wat ik in de huidige app heb vastgesteld

- `planning-store.ts` gebruikt `syncTable()`: bij elke wijziging wordt de volledige lokale lijst weggeschreven en worden alle databaserijen verwijderd die lokaal ontbreken. Dat is de belangrijkste oorzaak van dataverlies bij twee gelijktijdige gebruikers.
- `planning-app.tsx` (4340 regels) heeft vier automatische opslag-effecten (werken, medewerkers, planning, instellingen) die 150 ms na elke statewijziging schrijven, bovenop de expliciete opslag in de actiefuncties. Dus dubbele writes.
- Bij een lege database wordt de demo-data (`INIT_PROJ`, `INIT_EMP`, `INIT_AVAIL`, "PlanPro BV") automatisch naar de echte database geschreven; bij een laadfout draait de app door met demo-data in beeld.
- `project.medewerkers` bestaat nog naast `availability` en wordt nog gelezen in dashboard, filters, werkenlijst en het werkformulier.
- Documenten in Werkdetails zijn alleen bestandsnamen in `project_meta`; er is geen storage-bucket.
- Feestdagen en schoolvakanties staan als vaste lijsten in de code (`SCHOOL_HOL`, feestdagenlijst) en stoppen na 2026.
- Er is nu geen testframework geïnstalleerd (geen Vitest/Playwright).
- Inloggen werkt nu deels als demo-login via de browseropslag (`maasmond-demo-user`), naast echte accounts. Voor een auditlog met betrouwbare gebruiker en voor strengere toegangsregels is een echte login nodig.

## Volgorde van uitvoering

**Stap 1 — Login definitief maken (verplicht vóór alle beveiliging)**
Microsoft/Azure-login wordt in productie de enige loginmethode; iedere gebruiker krijgt een echte `auth.uid()` uit Supabase Auth. De demo-login blijft alleen bestaan wanneer `import.meta.env.DEV` waar is of een expliciete testvlag aan staat; in een productiebuild is de demo-code niet bereikbaar en wordt een bestaande `maasmond-demo-user` in de browseropslag genegeerd en opgeruimd. Geen enkel scherm mag nog een gebruiker of e-mailadres zelf meesturen naar de database. Voor Playwright komt er een aparte testconfiguratie met een echte testgebruiker, los van de demo-login.

**Stap 2 — Toegangsregels op alle tabellen**
Toegangsregels op werken, medewerkers, planning, instellingen, documenten en auditlog worden omgezet van "iedereen" naar "alleen ingelogde gebruikers", met de bijbehorende rechten. Zonder geldige sessie is geen enkele lees- of schrijfactie meer mogelijk. Databasefuncties bepalen de gebruiker altijd zelf via `auth.uid()` en accepteren nooit een gebruiker-id uit de browser; dat geldt ook voor de latere planning- en auditfuncties.

**Stap 3 — Vangnet: tests op de kritieke rekenlogica**
Vitest opzetten en tests schrijven op de bestaande helpers: ingeplande medewerkers per werk, conflictcontrole, teamkleuren/unieke werkkleuren, volgorde medewerkers, vaste vrije dagen met uitzonderingen, openstaande werken. Playwright-flows (met de aparte testgebruiker uit stap 1) voor inplannen, slepen, resizen en refresh.

**Stap 4 — Demo-data uit productie**
Demo-data alleen nog achter een expliciete ontwikkelaarsschakelaar. Bij starten: laadscherm, daarna echte gegevens; lege database geeft lege lijsten. Mislukt laden geeft "Gegevens konden niet worden geladen." met knop "Opnieuw proberen" en blokkeert elke opslag tot het laden gelukt is.

**Stap 5 — Automatische opslag weghalen**
De vier automatische opslag-effecten verdwijnen. Elke gebruikersactie krijgt één vaste route: controleren → opslaan in database → bevestiging → state bijwerken → scherm verversen. Bij fout: terugdraaien en melding.

**Stap 6 — Rijgerichte opslaglaag**
Nieuwe laag met `upsertRow` / `deleteRow` / `upsertRows` / `deleteRows` per tabel; `syncTable` verdwijnt voor werken, medewerkers, planning en werkgegevens. Nooit meer "verwijder wat lokaal ontbreekt". Instellingen worden samengevoegd in plaats van als geheel overschreven. De teruggegeven databaserij bepaalt de state.

**Stap 7 — Alle bestaande opslagfuncties omzetten**
Inplannen, wijzigen, verplaatsen, verwijderen, team verplaatsen, resize, vaste vrije reeksen, statuswijziging, Excel-import: allemaal op de nieuwe laag, met per actie alleen de echt gewijzigde regels.

**Stap 8 — Conflictcontrole in de database**
Databasefunctie die vlak voor opslaan opnieuw controleert op vrij, vakantie, ziek, bezet en overlappende planning, en de gebruiker daarbij zelf uit `auth.uid()` haalt. Meerdere regels tegelijk (team, meerdere dagen, series) slagen samen of gaan samen niet door. De melding noemt medewerker, datum, tijd en reden. De snelle controle in het scherm blijft.

**Stap 9 — Gelijktijdig werken afschermen**
Opslaan controleert of het record ondertussen door iemand anders is gewijzigd. Zo ja: niet blind overschrijven, gegevens opnieuw laden en melden dat de planning inmiddels is gewijzigd.

**Stap 10 — Realtime**
Live meekijken op planning, werken en medewerkers, zodat een tweede planner wijzigingen ziet zonder verversen. Realtime werkt alleen bij naar het scherm, nooit terug naar de database. Test met twee sessies.

**Stap 9 — Availability als enige personeelsbron**
Alle plekken die nog `project.medewerkers` lezen gaan over op `getProjectAssignedEmployees(...)`. Uit het werkformulier verdwijnt het direct aanvinken van medewerkers; koppelen gebeurt via een echte planningregel. Bestaande oude gegevens blijven staan maar worden niet meer gebruikt.

**Stap 10 — Werkperiode los van planning**
Slepen, resizen, medewerkers toevoegen of planning verwijderen wijzigt de oorspronkelijke start- en afloopdatum van een werk niet meer. Werkdetails toont twee regels: "Werkperiode" (ingevoerd/Excel) en "Geplande uitvoering" (berekend uit de planning), met "Nog niet ingepland" als er niemand staat. Agenda toont geen dubbele blokken.

**Stap 11 — Echte documentopslag**
Opslagmap `project-documents` per werk, plus een documententabel met bestandsnaam, pad, type, grootte, uploader en tijdstip. Uploaden, openen, downloaden en verwijderen werken echt. Mislukt de registratie na een upload, dan wordt het bestand weer opgeruimd.

**Stap 12 — Feestdagen toekomstbestendig**
Eén centrale `getDutchHolidays(jaar)` die ook de van Pasen afgeleide dagen berekent, gebruikt door Agenda en Personeelsplanning. Werkt dus ook na 2026. Bestaande feestdagkleur blijft.

**Stap 13 — Schoolvakanties beheerbaar**
Schoolvakanties per jaar en regio in de instellingen, met een eenvoudig beheerscherm (naam, regio, start, eind). Ontbreken de data van het volgende jaar, dan verschijnt een duidelijke waarschuwing.

**Stap 14 — Archiveren in plaats van verwijderen**
Werken en medewerkers worden gearchiveerd, met een weergave "Gearchiveerd" en herstellen. Gearchiveerde medewerkers verdwijnen uit de actieve planning maar hun historie blijft zichtbaar. Definitief verwijderen blijft mogelijk als bewuste beheeractie met extra waarschuwing.

**Stap 15 — Auditlog**
Nieuwe logtabel met gebruiker, tijdstip, actie, soort record, record-id, oude en nieuwe waarde. Alleen wegschrijven ná een geslaagde wijziging. Beheerscherm "Recente wijzigingen".

**Stap 16 — Tests uitbreiden**
De volledige testlijst uit de opdracht afmaken: planning, openstaande werken, agenda-weergaven en kleuren, opslagfouten en terugdraaien, twee gelijktijdige gebruikers, realtime.

**Stap 17 — Bestand opsplitsen**
Pas als de tests groen zijn: `planning-app.tsx` stap voor stap opdelen in schermcomponenten (personeelsplanning, openstaande werken, vaste vrije dagen, agenda, werken, werkdetails, kleurbeheer) en rekenlogica (`planning-engine`, `planning-conflicts`, `planning-colors`, `project-planning`, `holidays`), met na elk onderdeel build en tests.

## Technische details

- `src/lib/planning-store.ts`: `syncTable` uitfaseren; nieuwe mutatiehelpers met `.select().single()` retourwaarde; `syncSettings` wordt een merge op de bestaande rij.
- `src/components/planning-app.tsx`: vier debounce-`useEffect`-writes (regels ~4050-4069) verwijderen; demo-seed bij lege database (regels ~4025-4031) verwijderen; alle `syncTable`-aanroepen in save-/drag-/resize-functies omzetten.
- Database: RPC voor transactioneel plannen met conflictcontrole, `updated_at`-controle bij opslaan, realtime-publicatie op de drie tabellen, `archived_at` op werken/medewerkers, tabellen `project_documents` en `audit_log`, storage-bucket `project-documents`, plus de vereiste toegangsregels en rechten.
- Nieuwe bestanden: `src/lib/holidays.ts`, later de opsplitsing uit stap 17.
- Vitest + Playwright toevoegen als ontwikkelafhankelijkheden.

## Vraag vooraf

Voor het auditlog en veilige toegangsregels is een echte login per gebruiker nodig; de huidige demo-login geeft geen betrouwbare gebruiker. Ik ga er in dit plan van uit dat de demo-login blijft bestaan voor het testen en dat auditregels dan zonder gebruiker worden vastgelegd, tenzij je liever eerst Microsoft-login definitief afmaakt.
