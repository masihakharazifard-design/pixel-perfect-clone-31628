# Meerdaagse periode voor Bezet, Vakantie en Ziek

Alleen de bestaande afwezigheidsfunctie in Personeelsplanning wordt aangevuld. Geen nieuwe menu's, geen verwijderde opties, geen wijziging in kleuren of conflictcontrole.

## Wat er al staat
Het bestaande venster "Afwezigheid toevoegen / bewerken" heeft al: medewerker, startdatum, einddatum, starttijd, eindtijd, "hele dagen" en notitie. Meerdere dagen worden al opgeslagen als losse regels met hetzelfde periode-ID, en bewerken/verwijderen werkt al op alle regels met dat periode-ID tegelijk.

## Wat er ontbreekt en wordt toegevoegd

1. **Bezet en Ziek openen nu op één dag.** Waar het venster vanuit een dagcel of het snelmenu wordt geopend, wordt de einddatum voortaan altijd als apart, vrij invulbaar veld getoond voor Bezet, Vakantie én Ziek — niet alleen bij Vakantie. Zo kun je overal een periode kiezen.

2. **Tijden zijn optioneel.** Starttijd en eindtijd mogen leeg blijven; leeg betekent hele dagen (00:00–23:59), net als de bestaande "Hele dag"-optie. Het vinkje "Hele dag" blijft precies zoals het is.

3. **Doorlopende balk in Personeelsplanning.** Regels die hetzelfde periode-ID delen, worden in de week-, maand- en kwartaalweergave getoond als één doorlopende balk over de betrokken dagen in plaats van losse blokjes per dag. Het label (bijv. "Vakantie 12-08 t/m 16-08" met de notitie in de tooltip) staat één keer op de balk. In de dagweergave verandert er niets.

4. **Mobiel.** Het venster gebruikt op mobiel dezelfde datumvelden (start- en einddatum onder elkaar, volle breedte), zodat een periode ook zonder slepen of shift-klik te kiezen is.

Bewerken en verwijderen van een meerdaagse periode blijven werken zoals nu: alle regels met hetzelfde periode-ID tegelijk. Klikken op een willekeurige dag van de balk opent de hele periode.

## Technische details
Alles in `src/components/planning-app.tsx`:
- `AbsenceModal`: startdatum/einddatum altijd tonen; einddatum leeg of eerder dan startdatum valt terug op de startdatum. Tijdvelden mogen leeg zijn en vallen terug op `00:00`/`23:59`. Grid wordt `grid-cols-1 sm:grid-cols-2` (al zo) zodat mobiel netjes stapelt.
- Waar het venster wordt geopend (`openAbsence`, snelmenu-acties) wordt de einddatum als bewerkbaar veld meegegeven in plaats van gelijkgetrokken aan de startdatum.
- Nieuwe helper `absencePeriods(availability, empId, dates)` groepeert afwezigheidsregels per `periodeId` tot aaneengesloten reeksen binnen de zichtbare datums; `PersoneelsplanningView` rendert per rij een absolute overlay-balk over de betrokken kolommen in plaats van `absFor` per cel, met dezelfde `absenceStyle`-kleuren als nu.
- `saveAbsence`/`deleteAbsence` in `App` blijven ongewijzigd — die werken al per `periodeId`.

## Test
Vakantie 12-08-2026 t/m 16-08-2026 toevoegen en controleren dat dit als één balk verschijnt; Ziek over drie dagen; Bezet over twee dagen met tijden 13:00–17:00; de periode bewerken (nieuwe einddatum) en verwijderen vanaf een willekeurige dag; verversen en controleren dat alles behouden blijft.
