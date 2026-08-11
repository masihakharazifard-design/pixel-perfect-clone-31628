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

**Stap 1 — Login definitief maken en beperken tot Maasmond (verplicht vóór alle beveiliging)**
Microsoft/Azure-login wordt in productie de enige loginmethode; iedere gebruiker krijgt een echte `auth.uid()` uit Supabase Auth. De aanmelding wordt vastgezet op de Maasmond-tenant (vaste Tenant ID, geen open multi-tenant login) en bij het aanmaken van een account wordt server-side gecontroleerd of de gebruiker echt uit die tenant komt; iemand uit een andere Microsoft-tenant krijgt geen toegang, ook niet met een gelijkend e-mailadres. Een controle op `@maasmond.nl` in de browser telt nooit als beveiliging. De demo-login blijft alleen bestaan wanneer `import.meta.env.DEV` waar is of een expliciete testvlag aan staat; in een productiebuild is die code niet bereikbaar en wordt een bestaande `maasmond-demo-user` in de browseropslag genegeerd en opgeruimd. Voor Playwright komt er een aparte testconfiguratie met een echte testgebruiker.

**Stap 2 — Toegangsregels per rol op alle tabellen**
De huidige open regels op werken, medewerkers, planning en instellingen worden vervangen. Toegang loopt via de bestaande rollen (`user_roles` + `has_role`), niet via "iedere ingelogde gebruiker mag alles":
- Beheerder: alles beheren — medewerkers, instellingen, archiveren en herstellen, definitief verwijderen, documenten en het auditlog inzien.
- Planner: werken en medewerkers bekijken, planning toevoegen/wijzigen/verwijderen, werkgegevens bekijken, documenten gebruiken; geen beheerfuncties.
- Overige medewerkers: standaard alleen lezen waar dat later nodig is.
Instellingen, auditlog, definitief verwijderen en andere beheeracties worden in de database zelf beperkt, niet alleen door knoppen te verbergen. Databasefuncties bepalen de gebruiker altijd zelf via `auth.uid()`, controleren de vereiste rol en accepteren nooit een gebruiker-id of rol uit de browser. Rechten om functies uit te voeren worden zo krap mogelijk gehouden.

**Stap 3 — Vangnet: tests op de kritieke rekenlogica**
Vitest opzetten en tests schrijven op de bestaande helpers: ingeplande medewerkers per werk, conflictcontrole, teamkleuren/unieke werkkleuren, volgorde medewerkers, vaste vrije dagen met uitzonderingen, openstaande werken. Playwright-flows (met de aparte testgebruiker uit stap 1) voor inplannen, slepen, resizen en refresh.

**Stap 4 — Demo-data uit productie**
Demo-data alleen nog achter een expliciete ontwikkelaarsschakelaar. Bij starten: laadscherm, daarna echte gegevens; lege database geeft lege lijsten. Mislukt laden geeft "Gegevens konden niet worden geladen." met knop "Opnieuw proberen" en blokkeert elke opslag tot het laden gelukt is.

**Stap 5 — Automatische opslag weghalen**
De vier automatische opslag-effecten verdwijnen. Elke gebruikersactie krijgt één vaste route: controleren → opslaan in database → bevestiging → state bijwerken → scherm verversen. Bij fout: terugdraaien en melding.

**Stap 6 — Rijgerichte opslaglaag en atomair patchen van instellingen**
Nieuwe laag met `upsertRow` / `deleteRow` / `upsertRows` / `deleteRows` per tabel; `syncTable` verdwijnt voor werken, medewerkers, planning en werkgegevens. Nooit meer "verwijder wat lokaal ontbreekt". De teruggegeven databaserij bepaalt de state. Instellingen worden niet meer als geheel opgehaald, lokaal samengevoegd en teruggeschreven: de browser stuurt alleen de gewijzigde instellingen (bijvoorbeeld alleen de feestdagkleur, of alleen de monteursvolgorde) naar een databasefunctie die ze server-side samenvoegt met de huidige instellingen. Twee gebruikers die tegelijk een andere instelling wijzigen overschrijven elkaar zo niet. Alle instellingenwijzigingen lopen via die functie.

**Stap 7 — Alle bestaande opslagfuncties omzetten**
Inplannen, wijzigen, verplaatsen, verwijderen, team verplaatsen, resize, vaste vrije reeksen, statuswijziging, Excel-import: allemaal op de nieuwe laag, met per actie alleen de echt gewijzigde regels.

**Stap 8 — Conflictcontrole in de database**
Databasefunctie die vlak voor opslaan opnieuw controleert op vrij, vakantie, ziek, bezet en overlappende planning, en de gebruiker daarbij zelf uit `auth.uid()` haalt. Meerdere regels tegelijk (team, meerdere dagen, series) slagen samen of gaan samen niet door. De melding noemt medewerker, datum, tijd en reden. De snelle controle in het scherm blijft.

**Stap 9 — Gelijktijdig werken afschermen**
Opslaan controleert of het record ondertussen door iemand anders is gewijzigd. Zo ja: niet blind overschrijven, gegevens opnieuw laden en melden dat de planning inmiddels is gewijzigd.

**Stap 10 — Realtime**
Live meekijken op planning, werken en medewerkers, zodat een tweede planner wijzigingen ziet zonder verversen. Realtime werkt alleen bij naar het scherm, nooit terug naar de database. Test met twee sessies.

**Stap 11 — Availability als enige personeelsbron**
Alle plekken die nog `project.medewerkers` lezen gaan over op `getProjectAssignedEmployees(...)`. Uit het werkformulier verdwijnt het direct aanvinken van medewerkers; koppelen gebeurt via een echte planningregel. Bestaande oude gegevens blijven staan maar worden niet meer gebruikt.

**Stap 12 — Werkperiode los van planning**
Slepen, resizen, medewerkers toevoegen of planning verwijderen wijzigt de oorspronkelijke start- en afloopdatum van een werk niet meer. Werkdetails toont twee regels: "Werkperiode" (ingevoerd/Excel) en "Geplande uitvoering" (berekend uit de planning), met "Nog niet ingepland" als er niemand staat. Agenda toont geen dubbele blokken.

**Stap 13 — Echte documentopslag**
Opslagmap `project-documents` per werk, plus een documententabel met bestandsnaam, pad, type, grootte, uploader en tijdstip. De uploader wordt server-side uit `auth.uid()` bepaald. Uploaden, openen, downloaden en verwijderen werken echt, alleen voor ingelogde gebruikers. Mislukt de registratie na een upload, dan wordt het bestand weer opgeruimd.

**Stap 14 — Feestdagen toekomstbestendig**
Eén centrale `getDutchHolidays(jaar)` die ook de van Pasen afgeleide dagen berekent, gebruikt door Agenda en Personeelsplanning. Werkt dus ook na 2026. Bestaande feestdagkleur blijft.

**Stap 15 — Schoolvakanties beheerbaar**
Schoolvakanties per jaar en regio in de instellingen, met een eenvoudig beheerscherm (naam, regio, start, eind). Ontbreken de data van het volgende jaar, dan verschijnt een duidelijke waarschuwing.

**Stap 16 — Archiveren in plaats van verwijderen**
Werken en medewerkers worden gearchiveerd, met een weergave "Gearchiveerd" en herstellen. Gearchiveerde medewerkers verdwijnen uit de actieve planning maar hun historie blijft zichtbaar. Definitief verwijderen blijft mogelijk als bewuste beheeractie met extra waarschuwing.

**Stap 17 — Auditlog in dezelfde transactie**
Nieuwe logtabel met gebruiker, tijdstip, actie, soort record, record-id, oude en nieuwe waarde. Het auditlog wordt niet als losse tweede actie vanuit de browser geschreven: bij belangrijke wijzigingen doet één databasefunctie in één transactie de controle op gebruiker en rol, de conflict- en gelijktijdigheidscontrole, de wijziging zelf en de auditregel. Mislukt de wijziging, dan komt er geen auditregel; kan de auditregel niet worden geschreven, dan gaat de hele wijziging niet door. Dit geldt voor planning verplaatsen en verwijderen, team verplaatsen, projectstatus wijzigen, archiveren en herstellen, medewerker wijzigen en vaste vrije reeksen wijzigen. De gebruiker komt altijd uit `auth.uid()`. Een regel zonder gebruiker mag alleen ontstaan bij echte automatische serverprocessen en krijgt dan `actor_type: "system"` — nooit als noodoplossing wanneer de gebruiker onbekend is. Beheerscherm "Recente wijzigingen", alleen voor Beheerder.

**Stap 18 — Tests uitbreiden**
De volledige testlijst uit de opdracht afmaken: login en geweigerde demo-login in productie, planning, openstaande werken, agenda-weergaven en kleuren, opslagfouten en terugdraaien, twee gelijktijdige gebruikers, realtime.

**Stap 19 — Bestand opsplitsen**
Pas als de tests groen zijn: `planning-app.tsx` stap voor stap opdelen in schermcomponenten (personeelsplanning, openstaande werken, vaste vrije dagen, agenda, werken, werkdetails, kleurbeheer) en rekenlogica (`planning-engine`, `planning-conflicts`, `planning-colors`, `project-planning`, `holidays`), met na elk onderdeel build en tests.

## Technische details

- `src/components/auth-gate.tsx`: demo-login (`maasmond-demo-user`) achter `import.meta.env.DEV` of een expliciete testvlag; in productiebuilds wordt de sleutel genegeerd en verwijderd, en blijft alleen de Azure/Microsoft-aanmelding over. Sessiecontrole via `supabase.auth.getUser()`.
- Auth: Azure-provider definitief inschakelen en de redirect-URL's vastleggen; rollen blijven in de bestaande `user_roles`-tabel met `has_role`.
- `src/lib/planning-store.ts`: `syncTable` uitfaseren; nieuwe mutatiehelpers met `.select().single()` retourwaarde; `syncSettings` wordt een merge op de bestaande rij.
- `src/components/planning-app.tsx`: vier debounce-`useEffect`-writes (regels ~4050-4069) verwijderen; demo-seed bij lege database (regels ~4025-4031) verwijderen; alle `syncTable`-aanroepen in save-/drag-/resize-functies omzetten.
- Database: bestaande `*_public`-policies (anon) op projects, employees, availability en app_settings vervangen door `TO authenticated`-policies; policies en grants voor `project_documents` en `audit_log`; RPC voor transactioneel plannen met conflictcontrole en `auth.uid()`-controle; `updated_at`-controle bij opslaan; realtime-publicatie; `archived_at` op werken/medewerkers; storage-bucket `project-documents` met eigen toegangsregels.
- `audit_log`: kolommen `actor_id uuid` (uit `auth.uid()`), `actor_type text` (`user` of `system`), tijdstip, actie, tabel, record-id, oude en nieuwe waarde; alleen te vullen via server-side functies.
- Nieuwe bestanden: `src/lib/holidays.ts`, later de opsplitsing uit stap 19.
- Vitest + Playwright toevoegen als ontwikkelafhankelijkheden, met een aparte testconfiguratie en echte testgebruiker (geen demo-login).

