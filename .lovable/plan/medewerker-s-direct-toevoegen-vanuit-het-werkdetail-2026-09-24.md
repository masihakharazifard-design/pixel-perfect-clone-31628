# Medewerker(s) direct toevoegen vanuit het werkdetail

## Wat je krijgt
- Bovenaan het tabblad **Medewerkers** in het werkdetail staat een knop **Medewerker toevoegen**.
- Die knop opent een klein paneel met:
  - een zoekbare medewerkerkiezer. Medewerkers van de afdeling van dit werk staan bovenaan, daarna de rest op naam;
  - een startdatum en een einddatum. Standaard zijn dat de start- en einddatum van het werk. Heeft het werk geen datums, dan is het vandaag. De periode moet binnen de datums van het werk vallen, als die er zijn;
  - een begin- en eindtijd, standaard 08:00–17:00 (dezelfde standaard als bij inplannen).
- Bij opslaan komt er voor elke dag in de periode een eigen planningregel (status "Ingepland", gekoppeld aan dit werk). Samen vormen die regels één doorlopende balk, net als bij meerdaags slepen.
- Na het opslaan blijft het paneel open met de kiezer leeggemaakt. Zo kun je direct de volgende medewerker toevoegen.
- De lijst en de teller "X van Y benodigde medewerkers ingepland" werken direct bij.

## Controles (hetzelfde als bij slepen)
- De afdelingsrechten gelden ook hier. Medewerkers of werken buiten je actieve afdelingsfilter kun je niet kiezen of opslaan, en dan krijg je dezelfde melding als bij slepen.
- De conflictcontrole werkt hetzelfde. Bij vakantie, ziekte, bezet of vrij kun je niet opslaan en zie je de betreffende datums. Voor een dubbele planning of te laat werken krijg je dezelfde vraag om te bevestigen als bij slepen.

## Technische details
- `planning-app.tsx`: in `ProjectDetail` komt een nieuw component `AddEmployeePanel` in de tab "medewerkers". Het krijgt een callback `onAddEmployees(rows)` die vanuit `PlanningApp` wordt doorgegeven.
- In `PlanningApp` maakt `addEmployeesToProject(empId, projectId, from, to, start, end)` per dag een `AvailEntry` met een gedeelde `reeksId`. Die functie gebruikt dezelfde logica als meerdaags inplannen in `PlanEmployeeModal`/`dropOnCell`.
- Opslaan gebeurt via de bestaande `tryCommit(entries, [], true)`, met eerst `canAct`/`visEmpIds`/`rowsAllowed`. Er komt geen nieuwe opslagroute.
- De kiezerlijst wordt gefilterd op `visEmpIds`.
- Na afloop: typecheck met `bunx tsgo --noEmit`, daarna een browsertest met het account van Masiha (twee medewerkers toevoegen voor meerdere dagen en controleren dat de lijst en de teller bijwerken). De testregels ruim ik daarna weer op.
