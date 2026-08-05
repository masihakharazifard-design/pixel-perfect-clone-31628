# Afdelingsfilter doortrekken naar Openstaande projecten

De bestaande aan/uit-knoppen per afdeling in Personeelsplanning blijven ongewijzigd. Er komt geen tweede filter en geen nieuw ontwerp.

## Wat er verandert

- De lijst **Openstaande projecten** volgt exact dezelfde afdelingsselectie als de knoppen bovenaan de pagina.
- Kies je alleen Zonwering, dan zie je onderaan uitsluitend openstaande projecten van Zonwering. Hetzelfde voor Stoffering en Schilderwerk.
- Staan alle knoppen aan (of alle uit), dan worden alle openstaande projecten getoond.
- Het aantal achter de kop ("x projecten") telt alleen de zichtbare projecten mee.
- Werkt direct, zonder de pagina te verversen.

## Wat gelijk blijft

- Medewerkerslijst blijft filteren zoals nu.
- Ingeplande blokken van een zichtbare medewerker blijven altijd zichtbaar, ook als het project bij een andere afdeling hoort.
- Zoeken, sorteren, badges (Niet ingepland / Gedeeltelijk ingepland / Volledig ingepland), "Nog in te plannen", de schakelaar voor volledig ingeplande projecten, slepen naar een cel, Openen en Inplannen blijven gewoon werken — alleen binnen de gefilterde lijst.
- Turnkey-projecten worden behandeld zoals nu: die horen bij alle drie de afdelingen en blijven dus zichtbaar bij elke actieve afdeling.

## Technische details

- In `PersoneelsplanningView` (`src/components/planning-app.tsx`) bestaat al `activeAfds`, afgeleid uit `settings.planFilters`. Diezelfde waarde wordt gebruikt voor de datasource van de openstaande-projectenlijst; er komt geen tweede filterstate.
- `periodProjects` past `activeAfds` al toe via `getAllAfds(p)`; de controle wordt vastgelegd/gecontroleerd zodat `openProjects` gegarandeerd dezelfde selectie gebruikt, ook wanneer een project geen `afdelingen` heeft (dan telt `p.afdeling`).
- Geen wijzigingen aan de database, de planningregels of andere pagina's.

## Test

Knoppen op alleen Zonwering zetten en controleren dat onderaan uitsluitend Zonwering-projecten staan; daarna Stoffering en Schilderwerk; alle knoppen aan geeft weer de volledige lijst. Slepen, zoeken en badges controleren binnen een actieve filter.
