# Maasmond planning — uitbreiding

Bestaand ontwerp en alle pagina's blijven ongewijzigd; alleen onderstaande punten worden aangepast.

## 1. Excel-import projecten

De importer leest al op kolompositie. Wordt vastgelegd/afgerond:

- Projectnr. → Projectnummer (unieke sleutel, alleen nieuwe projecten toevoegen, geen duplicaten)
- 1e "Omschrijving" → Projectnaam, 2e "Omschrijving" → Werkzaamheden (nu gaat de 2e kolom alleen naar afdelingsherkenning; het wordt óók opgeslagen als Werkzaamheden)
- Naam opdrachtgever → Opdrachtgever, Contactpersoon → Contactpersoon
- Calculator → Projectleider
- Datum opdracht, Startdatum, Werknr. → gelijknamige velden
- Turnkey → project krijgt Stoffering + Schilderwerk + Zonwering
- Lege optionele velden leiden nooit tot overslaan; alleen een ontbrekend Projectnr. maakt een rij ongeldig (Projectnaam wordt niet langer verplicht)

## 2. Excel-import beschikbaarheid

Nieuwe knop "Excel importeren" op de pagina Beschikbaarheid, met dezelfde preview-stijl als de projectimport.

- Kolommen: medewerker, startdatum, einddatum, starttijd, eindtijd, status, notitie
- Statussen: Beschikbaar, Ingepland, Niet beschikbaar, Vakantie, Ziek, Vrij
- Medewerker wordt gematcht op naam; onbekende naam → rij als ongeldig getoond met reden
- Meerdaagse regels worden omgezet naar losse dagen, zodat ze direct doorwerken in Personeelsplanning, Medewerkers vandaag, Medewerkerdetails en de controle bij het inplannen

## 3. Database als enige bron van waarheid

De bestaande tabellen (projecten, medewerkers, beschikbaarheid, instellingen) blijven; er komen tabellen bij voor projecttoewijzingen/agenda-aanpassingen, documenten en facturatie.

- Schrijven gebeurt eerst naar de database, daarna wordt de interface bijgewerkt (in plaats van de huidige vertraagde achtergrondsync)
- Bij een mislukte opslag verschijnt een melding en wordt de wijziging teruggedraaid
- Geen demo-/mockdata meer als startpunt; alle schermen lezen dezelfde databron
- Na refresh blijft alles bestaan

## 4. Inloggen met Microsoft-werkaccount (SAML SSO / Entra ID)

- Inlogscherm met knop "Inloggen met Microsoft"; de app is pas bruikbaar na inloggen
- Sessie blijft na refresh, uitloggen via het gebruikersmenu
- Rollen: Beheerder, Planner, Projectleider, Financieel, Medewerker. Iedere nieuwe gebruiker start als Medewerker; rollen staan in een aparte rollentabel en zijn later aan te passen
- Toegangsregels op de data worden omgezet van "open voor iedereen" naar "alleen ingelogde gebruikers"

Actie voor jou: bij het instellen vraagt Lovable om de Entra ID metadata-URL en jullie e-maildomein(en); die zijn te vinden in het Microsoft Entra-beheercentrum bij de enterprise-applicatie die je voor deze app aanmaakt.

## 5. Vestigingsknoppen

De paarse regio-/vestigingsknoppen boven de agenda worden verwijderd, inclusief het bijbehorende filter. Het veld "Regio / Vestiging" in het projectformulier blijft bestaan en er wordt geen projectdata verwijderd.

## 6. Logo

Zodra je het Maasmond-logo uploadt, wordt het geplaatst in de sidebar, op het inlogscherm en in de header, op correcte verhoudingen, met witruimte en responsive. Zonder bestand blijft het huidige logo staan tot je het aanlevert.

## 7. Interactiviteit

Alle genoemde knoppen worden nagelopen en waar nodig werkend gemaakt: Excel importeren (projecten en beschikbaarheid), project aanmaken/bewerken/verwijderen, medewerker toevoegen/bewerken/verwijderen, beschikbaarheid aanpassen, agenda slepen, instellingen opslaan, in- en uitloggen. Geen lege of alleen-visuele knoppen.

## 8. Test

Na implementatie wordt in een echte browser getest: Excelproject importeren met controle op Calculator → Projectleider en 2e Omschrijving → Werkzaamheden, refresh en controle op behoud, beschikbaarheid importeren + refresh, inlogflow, logo en het verdwijnen van de vestigingsknoppen.

## Technische details

- `src/components/planning-app.tsx`: importparser uitbreiden (`werkzaamheden` uit `col_omschr2`), nieuwe `AvailabilityImportModal`, verwijderen van `regionFilter`/`schoolRegions`-knoppenrij.
- `src/lib/planning-store.ts`: van debounced mirror-sync naar write-through helpers per entiteit (upsert/delete direct bij mutatie).
- Migratie: tabellen voor toewijzingen/agenda, documenten en facturatie, plus `user_roles` met enum en `has_role`-functie; RLS-policies naar `authenticated`, met de vereiste GRANTs.
- Auth: SAML SSO via de Lovable-configuratietool, protected routes onder `_authenticated`, publieke `/auth`-route met de Microsoft-knop.
