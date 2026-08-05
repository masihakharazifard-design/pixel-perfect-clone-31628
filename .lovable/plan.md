# Afdelingsfilter overal doortrekken in Personeelsplanning

De bestaande aan/uit-knoppen per afdeling blijven ongewijzigd. Er komt geen tweede filter en geen nieuw ontwerp; overal wordt dezelfde bestaande `activeAfds` gebruikt.

## Wat er verandert

Kies je bijvoorbeeld alleen Zonwering, dan geldt op de hele pagina Personeelsplanning:

- **Medewerkers**: alleen Zonwering-medewerkers (werkt al zo).
- **Ingeplande projecten**: alleen blokken van Zonwering-projecten bij de zichtbare medewerkers; blokken van projecten buiten de selectie worden niet getoond.
- **Openstaande projecten**: alleen Zonwering-projecten; de teller "x projecten" en "Nog in te plannen" worden op die gefilterde lijst berekend.
- **Project zoeken / selecteren bij inplannen**: de zoeklijst toont alleen Zonwering-projecten.
- **Drag & drop**: alleen een zichtbaar (Zonwering-)project kan uit Openstaande projecten naar een cel worden gesleept.
- **Projectdetails** die vanuit Openstaande projecten worden geopend, komen altijd uit dezelfde gefilterde lijst.

Zijn meerdere afdelingen actief, dan worden alle projecten van die afdelingen getoond. Is geen filter actief of zijn alle afdelingen actief, dan is alles zichtbaar. Alles werkt direct, zonder verversen.

## Wat gelijk blijft

- Zoeken, sorteren, badges (Niet ingepland / Gedeeltelijk ingepland / Volledig ingepland), de schakelaar voor volledig ingeplande projecten, Openen en Inplannen werken gewoon, maar binnen de gefilterde lijst.
- Turnkey-projecten worden behandeld zoals nu: ze horen bij alle drie de afdelingen en blijven dus zichtbaar bij elke actieve afdeling.
- Geen wijzigingen aan de agenda, de projectenpagina of de database.

## Technische details

In `src/components/planning-app.tsx`, uitsluitend binnen `PersoneelsplanningView`:

- Eén gedeelde helper `inAfd(p)` op basis van de bestaande `activeAfds` (leeg = alles), met `getAllAfds(p)` als bron zodat een project zonder `afdelingen` op `p.afdeling` terugvalt.
- `visProjects = projects.filter(inAfd)` als enige projectbron voor: `periodProjects`/`openProjects`, de dag-/week-/maand-/kwartaalblokken (`getDayBlocks`, `getEmpProjsDate`, `getEmpProjsWeek`, `rowsFor`-mapping: blokken waarvan het project niet in `visProjects` zit worden niet gerenderd), de projectlijst in `PlanEmployeeModal` (nieuwe prop, geen eigen filterstate), `dragProject`/`dropOnCell` en `setProjMenu`/`onOpenProject` vanuit de openstaande-lijst.
- Afwezigheidsblokken (Vakantie, Ziek, Bezet) horen niet bij een project en blijven altijd zichtbaar bij de zichtbare medewerkers.
- Tellers en badges worden afgeleid van de gefilterde lijst; planningregels zelf worden niet gewijzigd of verwijderd door het filter.

## Test

Alleen Zonwering activeren en controleren: medewerkers, ingeplande blokken, openstaande projecten, zoeklijst bij inplannen, slepen en projectdetails tonen uitsluitend Zonwering. Daarna twee afdelingen tegelijk, en tot slot alles aan voor de volledige lijst.
