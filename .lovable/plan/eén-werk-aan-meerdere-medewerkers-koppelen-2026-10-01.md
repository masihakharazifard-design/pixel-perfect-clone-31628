# Eén werk aan meerdere medewerkers koppelen

Alleen het planningsbestand van de app wordt aangepast. De database, andere bestanden en de overige logica blijven ongewijzigd. De 12 aangeleverde wijzigingen (ZOEK → VERVANG) worden letterlijk doorgevoerd.

## Wat je krijgt
- **Werkformulier**: medewerkers die je aanvinkt bij "Medewerkers toewijzen" worden bij Opslaan echt ingepland. Dat gebeurt per werkdag in de looptijd van het werk. Weekenddagen worden overgeslagen, tenzij het werk alleen in het weekend valt. Dagen met vakantie, ziekte, vrij of bezet worden overgeslagen en je krijgt een melding welke dagen dat zijn.
- Medewerkers die al zijn ingepland blijven aangevinkt en dragen het label "Ingepland". Nieuw aangevinkte medewerkers krijgen het label "Wordt ingepland".
- **Agenda** (dag, week, maand en kwartaal): per werk, dag en tijdvak zie je één blok met de namen van alle ingeplande medewerkers. Bij verslepen gaan alle medewerkers samen mee.
- **Personeelsplanning**: het venster "Medewerker(s) inplannen" ondersteunt meerdere medewerkers tegelijk. Bij het bewerken van een bestaande regel blijft het één medewerker.
- Alle gekozen medewerkers delen één reeks, zodat ze in de Agenda samen één blok vormen.
- Kies je Bewerken vanuit het werkdetail, dan start het formulier met de actuele planning.

## Controle na afloop
- Typecheck zonder nieuwe fouten.
- Werken → werk met datums → Bewerken → twee medewerkers aanvinken → Opslaan.
- Tab Medewerkers: beide medewerkers staan erbij en de teller klopt.
- Personeelsplanning: het werk staat bij beide medewerkers op de juiste dagen.
- Agenda: één blok met beide namen.
- Testregels worden daarna opgeruimd.

## Technisch
Wijzigingen 1 t/m 12 uit het aangeleverde document: `agendaEmpNames`/`agendaLabel`, `buildProjectPlanRows`, ProjectForm `plannedIds`, Agenda-labels en tooltips, groepering in AgendaView zonder reeksId, verslepen per blok, gedeelde `reeksId` in PlanEmployeeModal, multi-select in Personeelsplanning, opslag van planningregels in `saveProject` via `savePlanningRows` met terugdraaien bij een fout, en `viewProjects` bij onEdit. Als een ZOEK-tekst niet exact overeenkomt met de huidige code, wordt de wijziging inhoudelijk gelijkwaardig toegepast en gemeld.
