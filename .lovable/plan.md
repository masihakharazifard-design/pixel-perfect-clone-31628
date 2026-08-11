# Personeelsplanning: unieke projectkleur per werk + ingeplande medewerkers uit de planning

Alles blijft binnen `src/components/planning-app.tsx`. Geen nieuwe tabel, geen migratie, geen tweede planning. `availability` blijft de enige bron voor wie waarop is ingepland; kleuren blijven in de bestaande `projectColors` in de instellingen.

## Huidige situatie (gecontroleerd)

- De blokkleur in Personeelsplanning kiest eerst de teamkleur (`teamId`), pas daarna de projectkleur. Daardoor krijgt hetzelfde werk bij verschillende medewerkers soms een andere kleur, en kunnen twee werken dezelfde kleur krijgen.
- Zonder opgeslagen kleur valt de app terug op een klein vast teampalet, dat na een aantal werken kleuren herhaalt.
- Het tabblad Medewerkers in het projectdetailvenster gebruikt de medewerkerslijst uit het projectrecord (`project.medewerkers`), niet de actuele planningregels.
- Het projectdetailvenster is al één gedeelde component voor Dashboard, Agenda, Personeelsplanning en Openstaande projecten.

## 1. Vaste, unieke kleur per werk

- Eén centrale helper bepaalt de kleur van een werk in Personeelsplanning, uitsluitend op basis van het werk-ID. Medewerker, datum, rijpositie, team, status en tijd spelen geen rol meer.
- Kleuren worden beheerd over de volledige werkenlijst, niet over wat op dat moment zichtbaar is. Filters, periode en weergave hebben geen invloed op de kleurverdeling.
- Een bestaande, unieke opgeslagen kleur wordt nooit gewijzigd. Een nieuwe kleur wordt alleen toegekend als een werk nog geen kleur heeft, of als twee werken exact dezelfde kleur hebben. Bij zo'n botsing houdt het werk dat in de stabiele werkvolgorde als eerste komt zijn kleur; alleen het andere werk krijgt een nieuwe.
- Nieuwe kleuren komen uit een breed, fijnverdeeld spectrum met bewust ruime onderlinge afstand, zodat opeenvolgende werken ook visueel duidelijk verschillen en kleuren niet herhalen.
- Nieuwe of gecorrigeerde kleuren worden centraal opgeslagen, zodat ze na verversen identiek blijven.
- Slepen, verlengen, korter maken, teamverplaatsing, inplannen, planning verwijderen, filteren en wisselen tussen Dag, Week, Maand en Kwartaal veranderen de kleur nooit en verdelen kleuren nooit opnieuw.
- Openstaande projecten en planningblokken met hetzelfde werk-ID tonen altijd exact dezelfde kleur.
- Teamkleuren bepalen in Personeelsplanning niet langer de kleur van een projectblok; teams blijven verder gewoon werken (o.a. samen verplaatsen). Kleuren beheren houdt de mogelijkheid om per werk handmatig een kleur te kiezen.
- Agenda blijft volledig uitgesloten: daar bepaalt de afdeling de kleur.

## 2. Ingeplande medewerkers overal uit de planning

- Eén centrale helper leidt de medewerkers van een werk af uit de planningregels met status Ingepland en hetzelfde werk-ID, alleen voor bestaande medewerkers, zonder dubbelen.
- Het tabblad Medewerkers in het projectdetailvenster gaat deze lijst gebruiken in plaats van de lijst in het projectrecord, met per medewerker de gekoppelde dagen en tijden eronder. Eén medewerker met meerdere dagen verschijnt één keer.
- Is er nog niemand ingepland, dan staat er: **Nog geen medewerkers ingepland**.
- Het gekleurde randje per medewerker gebruikt voortaan de vaste kleur van het werk.
- Omdat het detailvenster gedeeld is, tonen Personeelsplanning, Openstaande projecten, Agenda, Dashboard en Werken automatisch dezelfde lijst.
- Na inplannen of verwijderen wordt de planning opgeslagen, de centrale planning opnieuw geladen en het detailvenster opnieuw berekend, zodat de lijst direct meebeweegt.

## Technisch

- Nieuwe helpers naast de bestaande kleurlogica: `projectPlanningColorOf(projectId, projectColors)` (stabiele HSL-generatie met gulden-hoekverdeling + botsingscontrole) en `getProjectAssignedEmployees(projectId, availability, employees)` (op basis van `planRows`/`projectPlans`, ontdubbeld op `employeeId`).
- Een effect in `PersoneelsplanningView` vult ontbrekende en dedupliceert botsende `projectColors` voor de zichtbare werken in één `onSaveSettings`-aanroep.
- `rowColor` in `PersoneelsplanningView` valt terug op `projectPlanningColorOf(a.projectId)`; de teamkleurtak vervalt daar. `teamColor`/`teamKey` blijven elders intact.
- Alle Personeelsplanning-weergaven (Dag, Week, Maand, Kwartaal), inclusief de bolletjes bij Openstaande projecten en de blokken in maand/kwartaal, gebruiken dezelfde helper.
- `ProjectDetail` krijgt de medewerkers via de helper; `project.medewerkers` blijft in de database maar is geen bron van waarheid meer voor deze weergave. `agendaProjStyle` en de afdelingslogica in Agenda blijven ongewijzigd.
- Controle in een echte browser volgens de opgegeven checklist, inclusief refresh en wisselen van weergave.
