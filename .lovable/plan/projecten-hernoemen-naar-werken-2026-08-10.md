# "Projecten" hernoemen naar "Werken"

## Doel
Alle zichtbare labels met de tekst "Projecten" in de bestaande app wijzigen naar "Werken", zonder het ontwerp of andere functionaliteit aan te passen.

## Te wijzigen labels in `src/components/planning-app.tsx`

1. **Navigatie-tabblad / menu** (regels ~1533 en ~1600)
   - `"projecten",FolderOpen,"Projecten"` → `"projecten",FolderOpen,"Werken"`
   - `projecten:"Projecten"` → `projecten:"Werken"`

2. **Dashboard stat-card** (regel ~1625)
   - `"Projecten deze week"` → `"Werken deze week"`

3. **Dashboard grafiektitel** (regel ~1688)
   - `"Projecten per afdeling"` → `"Werken per afdeling"`

4. **Paginatitel in de Projecten-weergave** (regel ~1802)
   - `<h1 ...>Projecten</h1>` → `<h1 ...>Werken</h1>`

## Niet wijzigen
- Interne variabele/component-namen (`ProjectenView`, `viewProjects`, `projects`, etc.) blijven ongewijzigd zodat de bestaande logica intact blijft.
- Databasevelden, routes en bestandsnamen blijven ongewijzigd.

## Validatie
- Na de wijziging wordt de preview gecontroleerd op:
  - Tabblad/menu toont "Werken".
  - Dashboard toont "Werken deze week" en "Werken per afdeling".
  - Projecten-pagina toont "Werken" als titel.
