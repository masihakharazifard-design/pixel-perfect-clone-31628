# Aanpassing label Personeelsplanning

Wijzig uitsluitend de weergave van ingeplande projectblokken in Personeelsplanning. Geen projectdata, planningdata, afdeling of opslaglogica wijzigen.

## Doel

Bij ieder ingepland project staat de **projectnaam/werknaam** als hoofdtekst in het blok. Pas als die ontbreekt, wordt het werknummer getoond. Geen aparte logica voor Zonwering of andere afdelingen.

## Wijzigingen

### Dag- en Weekweergave

- Toon in het blok: `projectnaam`.
- Fallback als `projectnaam` leeg is: `werknummer`.
- Tekst mag over meerdere regels doorlopen (`whitespace-normal`, `overflow-wrap: anywhere`) en wordt niet met `...` afgekapt.
- Tooltip blijft bestaand: Werknummer, Projectnaam, Werkzaamheden, Calculator, Afdeling.

### Maand- en Kwartaalweergave

- Cellen zijn smal; gebruik bij voorkeur ook hier de `projectnaam`.
- Tooltip toont altijd de volledige projectnaam plus de overige velden.

### Technisch

In `src/components/planning-app.tsx`, binnen `PersoneelsplanningView`:

1. Dagweergave (regel ~3262): vervang `${proj.werknummer} – ${proj.werkzaamheden||proj.projectnaam||""}` door `${proj.projectnaam||proj.werknummer||""}`.
2. Weekweergave (regel ~3327): pas de label-render aan zodat deze `projectnaam` toont; fallback op `werknummer`.
3. Maandweergave (regel ~3327): wijzig het compacte label van `proj.werknummer` naar `proj.projectnaam||proj.werknummer`.
4. Kwartaalweergave (regel ~3376): wijzig het compacte label van `p.werknummer` naar `p.projectnaam||p.werknummer`.
5. Tooltip (`tooltipText`, regel ~218) blijft ongewijzigd qua velden; verzeker dat `projectnaam` er altijd in staat.

## Acceptatie

- Een gepland blok toont `Projectnaam`; bij ontbreken van de naam `Werknummer`.
- Geen `...` of slice-afkapping in Dag-/Weekweergave.
- Geen speciale Zonwering-label.
- Tooltip toont nog steeds Werknummer, Projectnaam, Werkzaamheden, Calculator, Afdeling.
- Agenda, Projectdata, Beschikbaarheid en planninglogica blijven ongewijzigd.
