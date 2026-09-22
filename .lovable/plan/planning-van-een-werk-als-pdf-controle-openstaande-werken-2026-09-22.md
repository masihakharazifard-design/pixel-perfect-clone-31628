# Planning van een werk als PDF + controle openstaande werken

## 1. Knop "Exporteer planning als PDF" in het werkdetail

In het tabblad **Planning** van een werk komt bovenaan een knop **Exporteer planning als PDF**.

Wat er gebeurt bij klikken:
- De taken van dit werk worden opgehaald.
- Geen taken? Dan verschijnt de melding "Voeg eerst taken toe bij dit werk voordat je een planning kunt exporteren" en wordt er geen bestand gemaakt.
- Wel taken? Dan wordt direct een echt PDF-bestand gedownload met de naam `Planning - {werknummer}.pdf`.
- Tijdens het maken staat er "PDF wordt gegenereerd..." op de knop; bij een fout verschijnt "De planning kon niet als PDF worden gegenereerd. Probeer het opnieuw." zonder dat er iets aan de gegevens verandert.

Inhoud van de PDF (dag-voor-dag agenda):
- Kop met werknummer, naam van het werk, opdrachtgever en adres/plaats.
- Daaronder per kalenderdag, van de vroegste taakstart tot de laatste taakeinddatum, een dagblok met de datum (Nederlands, inclusief dagnaam) en daaronder elke taak die die dag loopt, met een gekleurd blokje volgens het bestaande taaktype-kleursysteem.
- Dagen zonder actieve taken worden overgeslagen.
- Zaterdag en zondag krijgen een lichtere achtergrond.
- Onderaan elke pagina een paginanummer; bij veel dagen loopt de agenda automatisch door naar een volgende pagina zonder dat een dagblok halverwege afbreekt.

## 2. Fix: werken met status "O" verschijnen altijd bij Personeelsplanning

Eén simpele regel, zonder uitzonderingen:
- Status (spaties getrimd, hoofdletterongevoelig) gelijk aan "O" en nog geen planningregel → het werk staat in "Openstaande werken".
- Een lege of onherkende afdeling verbergt een werk nooit; alleen een filter die de gebruiker zelf instelt kan iets weglaten.
- Staat er ergens een standaardfilter (bijvoorbeeld op afdeling) automatisch aan bij het openen van Personeelsplanning, dan haal ik die weg, zodat het paneel bij binnenkomst alles toont.

Wat ik nakijk en herstel:
- de statusvergelijking en het meenemen van werken zonder afdeling in de lijstopbouw;
- of de afdelingskeuze bij het openen van Personeelsplanning leeg begint;
- of een pas geïmporteerd werk meteen in het paneel terechtkomt zonder herladen.

**Harde acceptatie-eis:** ik rond dit pas af nadat ik in de draaiende app, met een echt via Excel geïmporteerd werk met status "O" zonder planningregel en zonder enige filter of zoekterm, met eigen ogen heb gezien dat het werk in het "Openstaande werken"-paneel staat. Niet aannemen op basis van de code.

## Technisch

- Nieuwe module `src/lib/taken-pdf.ts` met `generateProjectPlanningPdf({ project, taken })` op basis van jsPDF (al geïnstalleerd), A4 portret; blob-download via `URL.createObjectURL` + `revokeObjectURL`. Geen printvenster.
- Kleuren uit `TAAK_KLEUREN`/`taakKleur()` in `src/lib/taken.ts`; dagbereik via `parseDay`/`addDays`/`taakEind`, zodat UI en PDF dezelfde logica delen.
- `src/components/planning-app.tsx`: knop + laadstatus in de Planning-tab van `ProjectDetail`; taken opgehaald via `listTaken(project.id)` uit `@/lib/store`; alleen data verzamelen, renderlogica blijft in de nieuwe module.
- `src/lib/open-projects.ts` / de provider-opzet in `planning-app.tsx`: verificatie van status- en afdelingsvergelijking, eventueel een gerichte aanpassing van `getAfdelingen`.
- Verificatie: browsertest met een geïmporteerd "O"-werk, PDF daadwerkelijk genereren en de pagina's controleren, plus `bunx tsgo --noEmit`.
