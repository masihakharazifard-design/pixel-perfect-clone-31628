# Spoedfix: Excel-import snel en stabiel

Alleen performance en stabiliteit. De kolommapping en importregels blijven exact zoals ze nu zijn (Projectnr. als sleutel, kolom J = Werkzaamheden, kolom K = Calculator als letterlijke tekst, geen medewerker-matching, bestaande projecten bijwerken, nieuwe toevoegen).

## Wat er nu misgaat (gecontroleerd in de code)

- Het importvenster rendert **alle** gelezen rijen in de DOM: bij 2.000 rijen zijn dat duizenden elementen tegelijk — dit is de belangrijkste oorzaak van het bevriezen/vastlopen.
- Bij het samenvoegen wordt per Excelrij opnieuw de volledige projectenlijst doorzocht (`findIndex`), dus 2.000 rijen × alle projecten.
- Ook de demo-opslag zoekt per rij opnieuw de hele lijst door bij het wegschrijven.
- Er is geen blokkade tegen dubbelklikken: hetzelfde bestand kan twee importprocessen tegelijk starten.
- Het bestand wordt via `FileReader` gelezen zonder voortgang; tijdens het verwerken staat de hoofdthread stil zonder enig signaal.
- Dubbele Projectnr.-regels binnen hetzelfde Excelbestand worden nu niet samengevoegd of geteld.

Wat er **niet** misgaat en dus blijft: er wordt al één keer geparsed, er is al één state-update en één opslagactie per import (geen opslag per rij), en er is geen paginareload na import.

## Wat er verandert

1. **Voorbeeldlijsten begrenzen.** In het importvenster worden maximaal 20 nieuwe, 20 bij te werken en 20 ongeldige regels getoond, met daaronder "Nog N andere regels". De tellers boven blijven de volledige aantallen tonen.
2. **Snelle matching.** Vóór het verwerken wordt één keer een index (Map) van bestaande projecten op genormaliseerd Projectnr. gemaakt; daarna één directe opzoeking per rij in plaats van telkens de hele lijst doorzoeken. Hetzelfde bij het wegschrijven in demo-modus.
3. **Dubbele Excelregels.** Regels met hetzelfde Projectnr. worden vóór verwerking samengevoegd (laatste regel wint, de huidige regel); het aantal dubbele regels komt in het importvenster en in de eindmelding te staan.
4. **Verwerking in blokken met voortgang.** Rijen worden in blokken van 500 verwerkt met een korte adempauze voor de browser ertussen. Voortgang wordt per blok getoond ("Excelbestand verwerken… 65%"), niet per rij, en staat los van de projectenlijst zodat Agenda, Werken en Personeelsplanning niet hertekenen tijdens het verwerken.
5. **Bestand één keer lezen.** `file.arrayBuffer()` in plaats van `FileReader`, één `XLSX.read` op alleen het eerste werkblad. Workbook, worksheet en ruwe rijen blijven lokale variabelen en gaan nooit in React-state of in de opslag.
6. **Dubbele import blokkeren.** Zodra een import loopt: bestandskeuze en importknop uitgeschakeld, `isImporting` aan, na succes of fout weer uit. Eén bestand kan nooit twee processen starten.
7. **Echt atomair: eerst opslaan, dan pas tonen.** Volgorde: Excel lezen → volledige nieuwe projectenlijst in tijdelijke variabelen → tijdelijke nieuwe dataset opbouwen → één opslagpoging → pas bij succes de demo-store vervangen, één centrale state-update doen en de succesmelding tonen. Mislukt het lezen, valideren of opslaan, dan blijven de demo-store, de React-state en alle bestaande werken exact zoals ze waren, verschijnt alleen de foutmelding en blijft de gebruiker ingelogd. Er komt dus nooit een niet-opgeslagen project in beeld; de huidige "eerst tonen, dan opslaan"-volgorde met terugdraaien vervalt voor de import. In productie geldt hetzelfde: de state wordt pas bijgewerkt nadat de bulk-opslag in de database bevestigd is.
8. **Opslagfout vangen.** Loopt de lokale demo-opslag vol, dan verschijnt: "De Excel-import kon niet worden opgeslagen omdat de lokale demo-opslag vol is." De app blijft open — geen uitloggen, geen refresh, geen crash. De demosessie wordt door de import nooit aangeraakt.
9. **Eindmelding.** Compacte samenvatting: nieuwe werken toegevoegd, bestaande bijgewerkt, overgeslagen regels, dubbele projectnummers.

Dezelfde verwerkingslogica geldt in productie; alleen de laatste stap verschilt: één bulk-opslag van uitsluitend toegevoegde/gewijzigde werken (zoals nu), geen volledige tabelsynchronisatie.

## Test

Browsertest met bestanden van ~50, ~500 en ~2.000 rijen: app blijft zichtbaar en bedienbaar, geen uitloggen, geen reload, importresultaat klopt, en na een refresh staan de geïmporteerde werken er nog. Daarbij wordt geteld hoe vaak de opslagactie draait — dat moet in demo-modus één keer per import zijn. Een Web Worker komt er alleen als het parsen dan nog steeds merkbaar blokkeert.

## Technische details

- `src/components/planning-app.tsx` → `ExcelImportModal`: `parseFile` wordt async (`await file.arrayBuffer()`), `XLSX.read(buf,{type:"array"})`, `sheet_to_json` op alleen `wb.Sheets[wb.SheetNames[0]]`. Rijenlus in blokken van 500 met `await new Promise(requestAnimationFrame)`; `progress`-state los van de preview. `existingProjectNumbers` blijft een `Set`; extra `importedByProjectNr: Map<string,ImportRow>` voor deduplicatie, met `duplicates`-teller in `ImportPreview`. Preview-lijsten gerenderd met `.slice(0,20)` plus resttekst.
- Zelfde behandeling voor de beschikbaarheidsimport (`VacImportModal`) zodat beide dezelfde leesroutine gebruiken.
- Parent `handleImport` (regel ~4202): `findIndex` per rij vervangen door één vooraf opgebouwde `Map<string,number>` van projectnr → index. Volgorde omgedraaid: eerst `await upsertRows("projects",changed)`, en pas na succes `setProjects(next)` plus succesmelding; bij een fout geen state-wijziging en dus geen terugdraaiing meer nodig.
- `src/lib/demo-planning-store.ts` → `upsertRows`: index-Map op `id` in plaats van `findIndex` per item; `write()` gooit voortaan een expliciete quota-fout in plaats van stil te falen. `mutate()` wordt zo aangepast dat de nieuwe dataset eerst wordt weggeschreven en het in-memory/localStorage-resultaat alleen bij succes geldt — bij een fout blijft de bestaande `maasmond-demo-data` onaangeroerd en wordt de fout doorgegeven aan de aanroeper. De sleutel `maasmond-demo-session` wordt nooit aangeraakt.
