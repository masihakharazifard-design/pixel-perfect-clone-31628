# Fix: toegevoegde medewerker direct zichtbaar bij Medewerkers en Personeelsplanning

## Wat al vaststaat
- Overzicht, het tabblad Medewerkers en Personeelsplanning lezen alle drie dezelfde centrale planningslijst. Geen van de drie houdt een eigen kopie bij.
- Bij opslaan via "Medewerker toevoegen" wordt die centrale lijst meteen bijgewerkt, op dezelfde manier als bij slepen. Daarna wordt pas naar de database geschreven.
- De vermoedelijke oorzaak (een verouderde kopie per scherm) klopt dus niet met de code. De echte oorzaak is nog niet bevestigd.

## Mogelijke oorzaken (nog te controleren)
1. **Live-update haalt oude gegevens op.** Na elke wijziging herlaadt de app alle gegevens. Is een eerdere herlaadronde trager, dan kan die de nieuwe regels weer overschrijven met oudere gegevens.
2. **Verkeerde week of filter.** Personeelsplanning opent op de huidige week. Het ingeplande werk kan in een andere week vallen, of de medewerker valt buiten het actieve afdelingsfilter.
3. **Opslaan faalt stil.** De regels worden eerst getoond en daarna teruggedraaid, bijvoorbeeld door een geweigerde opslag of een conflictvraag die niet zichtbaar is.

## Aanpak
1. **Eerst reproduceren** in de app met het account van Masiha. Ik voeg via de knop een medewerker voor een paar dagen toe. Daarna kijk ik zonder te verversen naar het tabblad Medewerkers, de teller en Personeelsplanning, en lees ik de console en de netwerkverzoeken.
2. **Oorzaak gericht oplossen:**
   - Bij oorzaak 1: alleen het nieuwste herlaadresultaat gebruiken (oudere resultaten negeren). Herladen kort uitstellen en bundelen, en eigen wijzigingen niet laten overschrijven door een herlaadronde die al liep.
   - Bij oorzaak 2: na toevoegen verschijnt een melding met een knop "Bekijk in Personeelsplanning". Die opent de week van de eerste ingeplande dag. De afdelingsfilters blijven ongewijzigd.
   - Bij oorzaak 3: een duidelijke foutmelding tonen en het venster open laten.
3. **Test opnieuw zonder te verversen:** de medewerker staat in de lijst, de teller is bijgewerkt en de balk staat op de juiste dagen in het rooster. Daarna ruim ik de testregels weer op.

## Technische details
- Centrale state `avail` in `PlanningApp`. `persistPlanning` roept eerst `setAvail(nextAvail)` aan en schrijft daarna via `savePlanningRows`. `ProjectDetail` en `PersoneelsplanningView` krijgen allebei `availability={avail}`.
- Het realtime-kanaal `planning-sync` verhoogt bij elke wijziging `reloadKey`, wat een volledige `loadAll()` en `setAvail(res.availability)` start. Bij oorzaak 1 komt er een request-id-bescherming in die load, plus een debounce van ongeveer 500 ms.
- Na afloop: `bunx tsgo --noEmit` en een Playwright-test met screenshots.
