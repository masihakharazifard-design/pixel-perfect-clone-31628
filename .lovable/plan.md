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

## 2. Openstaande werken controleren

De regel die bepaalt wat in "Openstaande werken" staat, vergelijkt status al hoofdletterongevoelig en zonder spaties en verbergt alleen werken die al een planningregel hebben. Ik controleer daarnaast:
- of een via Excel geïmporteerd werk met status "O" zonder planningregel echt verschijnt zonder filter/zoekterm;
- of de afdelingsfilter zo'n werk niet onbedoeld wegfiltert wanneer het werk geen (of een afwijkende) afdeling uit de import heeft.

Als uit de test blijkt dat een werk zonder herkende afdeling wegvalt bij een actieve afdelingsfilter, pas ik dat gedrag aan zodat het werk zichtbaar blijft tenzij het aantoonbaar bij een andere afdeling hoort. Zonder filter of zoekterm moet elk openstaand "O"-werk altijd zichtbaar zijn.

## Technisch

- Nieuwe module `src/lib/taken-pdf.ts` met `generateProjectPlanningPdf({ project, taken })` op basis van jsPDF (al geïnstalleerd), A4 portret; blob-download via `URL.createObjectURL` + `revokeObjectURL`. Geen printvenster.
- Kleuren uit `TAAK_KLEUREN`/`taakKleur()` in `src/lib/taken.ts`; dagbereik via `parseDay`/`addDays`/`taakEind`, zodat UI en PDF dezelfde logica delen.
- `src/components/planning-app.tsx`: knop + laadstatus in de Planning-tab van `ProjectDetail`; taken opgehaald via `listTaken(project.id)` uit `@/lib/store`; alleen data verzamelen, renderlogica blijft in de nieuwe module.
- `src/lib/open-projects.ts` / de provider-opzet in `planning-app.tsx`: verificatie van status- en afdelingsvergelijking, eventueel een gerichte aanpassing van `getAfdelingen`.
- Verificatie: browsertest met een geïmporteerd "O"-werk, PDF daadwerkelijk genereren en de pagina's controleren, plus `bunx tsgo --noEmit`.
