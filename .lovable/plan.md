# Spoedfix: Excel-import voor 7.000+ regels

De bestaande kolommapping en importregels blijven ongewijzigd: Projectnr. is de sleutel, kolom J is Werkzaamheden, kolom K is Calculator als letterlijke tekst, bestaande werken worden bijgewerkt en nieuwe werken toegevoegd.

## Uitvoering

1. **Projectimport naar een Web Worker**
   - Nieuwe worker leest de `ArrayBuffer`, voert één keer `XLSX.read` en `sheet_to_json` uit en behoudt exact de huidige headerdetectie, vaste kolommen J/K, datum-/tijdconversie, afdelingsherkenning, validatie en “laatste Projectnr. wint”-deduplicatie.
   - De worker ontvangt alleen de genormaliseerde bestaande Projectnummers die nodig zijn voor nieuw/bestaand en stuurt kleine progressberichten zonder rijenarrays.
   - Bij meer dan 20.000 relevante regels geeft de worker een waarschuwing terug, maar verwerkt het bestand door.

2. **Volledige importdata buiten React-state**
   - `ExcelImportModal` bewaart de volledige dedupliceerde importlijst uitsluitend in een `useRef`.
   - React-state bevat alleen tellingen, voortgang, fout/waarschuwing, importstatus en maximaal 20 voorbeeldregels per categorie.
   - Importeren gebruikt direct de al voorbereide ref-data; het bestand wordt niet opnieuw gelezen of gevalideerd. Worker en ref worden bij teruggaan/sluiten opgeruimd.

3. **Beschikbaarheidsimport volgens hetzelfde principe**
   - Dezelfde worker verwerkt het Excelwerkblad en de bestaande beschikbaarheidskolommen/datum-/statusregels.
   - Medewerkermatching, conflicten en definitieve tijdblokken blijven functioneel gelijk, maar volledige resultaten staan buiten render-state en elke previewcategorie bevat maximaal 20 regels.
   - Importeren gebruikt de voorbereide tijdblokken en doet één definitieve opslagactie.

4. **Snelle, atomaire projectimport**
   - `handleImport` gebruikt één `Map<Projectnr., index>` en verwerkt iedere rij met O(1)-lookup; geen `find`/`findIndex` per Excelrij.
   - Volgorde blijft: tijdelijke lijst opbouwen → één bulk-opslag → één `setProjects(next)` → succesmelding. Bij fouten blijven state, sessie en bestaande opslag ongewijzigd en blijft het venster bruikbaar.
   - Developmentmetingen tonen tijden voor ArrayBuffer, parse, transform, merge, persist en eerste state-commit; productiebundels loggen dit niet.

5. **Demo-opslag geschikt maken voor grote datasets**
   - Projecten staan in DEMO MODE altijd in IndexedDB, ongeacht de omvang; geen dynamische keuze tussen opslagvormen.
   - localStorage houdt uitsluitend de demo-sessie, instellingen, medewerkers, availability, projectmeta/notities en de versie/verwijzing van de demo-opslag. `loadAll()` weet daardoor altijd waar projecten staan.
   - Bestaat er nog een oude `projects`-array in `maasmond-demo-data`, dan wordt die één keer atomair naar IndexedDB gemigreerd; pas na een geslaagde IndexedDB-transactie verdwijnt de oude array uit localStorage. Bij een migratiefout blijft de oude data volledig onaangeroerd.
   - Dunne helperlaag met `openDemoDb()`, `loadDemoProjects()`, `replaceDemoProjects(projects)` en `resetDemoProjects(seed)`. De verbinding wordt één keer geopend en hergebruikt, nooit per project of per rij.
   - Excel-import in demo: worker → voorbereide projectregels → tijdelijke nieuwe projectenlijst → één IndexedDB-transactie → pas bij succes de in-memory store vervangen, één `setProjects(next)` en de succesmelding. Bij een fout aborteert de transactie, blijft de vorige projectdataset en React-state ongewijzigd, blijft de gebruiker ingelogd en verschijnt alleen een duidelijke foutmelding.
   - `Demo resetten` vervangt de projects-store in één transactie door de actuele seed en werkt pas daarna de React-state bij.

6. **Renderbegrenzing na import**
   - Werken past paginering toe ná filteren/zoeken maar vóór het renderen van de zware rijcomponenten: alle projecten → filter/zoekresultaat → `slice((page-1)*50, page*50)` → alleen die 50 renderen, mobiel en desktop. Filters zetten terug naar pagina 1; navigatie toont Vorige, “Pagina X van Y” en Volgende.
   - Openstaande werken krijgt een zoekveld, blijft alle passende data doorzoeken en rendert maximaal de eerste 100 resultaten met de melding “Verfijn je zoekopdracht om meer resultaten te zien.”
   - Personeelsplanning en Agenda gebruiken gememoiseerde `Map`-indexen op projectId en projectnummer, zodat een wijziging van `projects` geen duizenden identieke `find()`-lookups veroorzaakt; bedrijfslogica blijft gelijk.


## Verificatie

- Genereer een realistisch testbestand met exact 6.966 nieuwe projectregels en unieke Projectnummers, met waarden in kolom J en K; daarnaast een groot beschikbaarheidsbestand.
- Controleer tijdens parsing dat de UI reageert, progress doorloopt, de worker wordt gebruikt en elke previewcategorie maximaal 20 DOM-regels bevat.
- Controleer dat Importeren niet opnieuw parseert, één opslagactie uitvoert, één centrale project-statecommit doet en de onderste projectregel na zoeken aanwezig is.
- Controleer Werken op maximaal 50 datarijen per pagina en Openstaande werken op maximaal 100 kaarten; Agenda en Personeelsplanning blijven bedienbaar.
- Refresh en verifieer behoud van alle 6.966 projecten in demo-opslag; test ook geforceerde opslagfout zodat oude data en login behouden blijven.
- Leg de gemeten tijden voor lezen, parse, transform, merge, opslag en eerste render vast en controleer console/runtimefouten.

## Technische details

- Nieuwe gedeelde workerberichten en importtypes komen in een kleine client-veilige module; de worker wordt gestart met `new Worker(new URL(..., import.meta.url), { type: "module" })`.
- De worker stuurt de volledige dedupliceerde lijst (±7.000 regels) exact één keer terug in het eindbericht; die lijst gaat rechtstreeks naar een `useRef` en nooit naar preview-state. Progressberichten bevatten uitsluitend kleine metadata.
- IndexedDB wordt met de browser-API geïmplementeerd zonder extra zware dependency; writes gebruiken één transactie en de bestaande demo-facade blijft de enige aanroepinterface voor de app.
