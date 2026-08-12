// DEMO MODE: startdataset voor de lokale demo-omgeving.
// Wordt uitsluitend door src/lib/demo-planning-store.ts geladen.
// Nooit gebruiken als fallback voor productiegegevens.
export const DEMO_DATA_VERSION = 1;

type Rec = Record<string, unknown> & { id: string };

const mk = (off: number, h = 8, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + off);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const TODAY_STR = new Date().toISOString().split("T")[0];

export const INIT_EMP: Rec[] = [
  {id:"e1",naam:"Jan de Vries",functie:"Projectleider",afdeling:"Stoffering",telefoon:"06-12345678",email:"jan@planpro.nl",competenties:["Projectmanagement","Bekleding","Technisch tekenen"]},
  {id:"e2",naam:"Maria Bakker",functie:"Stoffeerder",afdeling:"Stoffering",telefoon:"06-23456789",email:"maria@planpro.nl",competenties:["Bekleding","Gordijnen","Meubelbekleding"]},
  {id:"e3",naam:"Kees Jansen",functie:"Schilder",afdeling:"Schilderwerk",telefoon:"06-34567890",email:"kees@planpro.nl",competenties:["Schilderwerk","Behangen","Spuitwerk"]},
  {id:"e4",naam:"Petra Smit",functie:"Schilder",afdeling:"Schilderwerk",telefoon:"06-45678901",email:"petra@planpro.nl",competenties:["Schilderwerk","Decoratief schilderwerk"]},
  {id:"e5",naam:"Tom van den Berg",functie:"Monteur zonwering",afdeling:"Zonwering",telefoon:"06-56789012",email:"tom@planpro.nl",competenties:["Zonwering","Screens","Rolluiken"]},
  {id:"e6",naam:"Anja Visser",functie:"Allround",afdeling:"Zonwering",telefoon:"06-67890123",email:"anja@planpro.nl",competenties:["Zonwering","Screens","Bekleding"]},
  {id:"e7",naam:"Peter Meijer",functie:"Projectleider",afdeling:"Schilderwerk",telefoon:"06-78901234",email:"peter@planpro.nl",competenties:["Projectmanagement","Schilderwerk","Kwaliteitscontrole"]},
  {id:"e8",naam:"Lisa Kuiper",functie:"Stoffeerder",afdeling:"Stoffering",telefoon:"06-89012345",email:"lisa@planpro.nl",competenties:["Bekleding","Gordijnen","Vloerbekleding"]},
];

export const INIT_PROJ: Rec[] = [
  {id:"p1",werknummer:"2025-001",projectnaam:"Renovatie Hotel Amsterdam",opdrachtgever:"Hotel Amstel BV",adres:"Professor Tulpplein 1",plaats:"Amsterdam",afdeling:"Stoffering",afdelingen:["Stoffering"],projectleider:"e1",werkzaamheden:"Volledige herbekleding van 45 hotelkamers inclusief gordijnen en meubels",startdatum:mk(-5,8),afloopdatum:mk(12,17),medewerkers:["e2","e8"],status:"In uitvoering",notities:"Klant wil updates elke vrijdag",uurprijs:65,uren:120,region:"West"},
  {id:"p2",werknummer:"2025-002",projectnaam:"Schilderwerk Kantoorpand",opdrachtgever:"ABN AMRO Vastgoed",adres:"Weena 90",plaats:"Rotterdam",afdeling:"Schilderwerk",afdelingen:["Schilderwerk"],projectleider:"e7",werkzaamheden:"Volledig schilderwerk binnen en buiten, inclusief 3 verdiepingen kantoorpand",startdatum:mk(2,7,30),afloopdatum:mk(9,17),medewerkers:["e3","e4"],status:"Bevestigd",notities:"",uurprijs:55,uren:80,region:"Zuid"},
  {id:"p3",werknummer:"2025-003",projectnaam:"Zonwering Woonhuis",opdrachtgever:"Familie Hendriks",adres:"Maliebaan 45",plaats:"Utrecht",afdeling:"Zonwering",afdelingen:["Zonwering"],projectleider:"e5",werkzaamheden:"Plaatsing screens en rolluiken, 12 ramen woonkamer en slaapkamers",startdatum:mk(1,9),afloopdatum:mk(3,16),medewerkers:["e5","e6"],status:"Bevestigd",notities:"Klant aanwezig op maandag",uurprijs:60,uren:24,region:"West"},
  {id:"p4",werknummer:"2025-004",projectnaam:"Gordijnen Appartementencomplex",opdrachtgever:"Woongroep Nederland",adres:"Laan van Meerdervoort 55",plaats:"Den Haag",afdeling:"Stoffering",afdelingen:["Stoffering","Zonwering"],projectleider:"e1",werkzaamheden:"Meten, leveren en plaatsen van vouwgordijnen en screens in 28 appartementen",startdatum:mk(14,8),afloopdatum:mk(21,17),medewerkers:["e2"],status:"Offerte",notities:"",uurprijs:65,uren:112,region:"West"},
  {id:"p5",werknummer:"2025-005",projectnaam:"Buitenschilderwerk Villa",opdrachtgever:"Dhr. Van Leeuwen",adres:"Kepplerstraat 12",plaats:"Wassenaar",afdeling:"Schilderwerk",afdelingen:["Schilderwerk"],projectleider:"e7",werkzaamheden:"Volledig buitenschilderwerk, kozijnen en hekwerk",startdatum:mk(-30,8),afloopdatum:mk(-20,17),medewerkers:["e3"],status:"Afgerond",notities:"",uurprijs:55,uren:48,region:"Noord"},
  {id:"p6",werknummer:"2025-006",projectnaam:"Markiezen Restaurant",opdrachtgever:"Brasserie De Zon",adres:"Grote Markt 7",plaats:"Haarlem",afdeling:"Zonwering",afdelingen:["Zonwering"],projectleider:"e5",werkzaamheden:"Levering en montage 4 grote markiezen terras",startdatum:mk(5,8),afloopdatum:mk(6,16),medewerkers:["e5","e6"],status:"Bevestigd",notities:"Terras open om 11:00",uurprijs:60,uren:16,region:"West"},
];

export const INIT_AVAIL: Rec[] = [
  {id:"av1",employeeId:"e1",date:TODAY_STR,startTime:"08:00",endTime:"17:00",status:"Ingepland",note:"Renovatie Hotel Amsterdam",projectId:"p1"},
  {id:"av2",employeeId:"e2",date:TODAY_STR,startTime:"08:00",endTime:"17:00",status:"Ingepland",note:"Renovatie Hotel Amsterdam",projectId:"p1"},
  {id:"av3",employeeId:"e3",date:TODAY_STR,startTime:"08:00",endTime:"17:00",status:"Beschikbaar"},
  {id:"av4",employeeId:"e4",date:TODAY_STR,startTime:"08:00",endTime:"17:00",status:"Vakantie"},
  {id:"av5",employeeId:"e5",date:TODAY_STR,startTime:"09:00",endTime:"16:00",status:"Ingepland",note:"Zonwering Woonhuis",projectId:"p3"},
  {id:"av6",employeeId:"e6",date:TODAY_STR,startTime:"09:00",endTime:"16:00",status:"Ingepland",note:"Zonwering Woonhuis",projectId:"p3"},
  {id:"av7",employeeId:"e7",date:TODAY_STR,startTime:"07:30",endTime:"17:00",status:"Beschikbaar"},
  {id:"av7b",employeeId:"e7",date:TODAY_STR,startTime:"14:00",endTime:"16:00",status:"Niet beschikbaar",note:"Vergadering"},
  {id:"av8",employeeId:"e8",date:TODAY_STR,startTime:"08:00",endTime:"17:00",status:"Ziek"},
];

export const INIT_DEMO_SETTINGS: Record<string, unknown> | null = null;

export function makeDemoSeed() {
  return {
    version: DEMO_DATA_VERSION,
    projects: INIT_PROJ.map((p) => ({ ...p })),
    employees: INIT_EMP.map((e) => ({ ...e })),
    availability: INIT_AVAIL.map((a) => ({ ...a })),
    settings: INIT_DEMO_SETTINGS,
    settingsUpdatedAt: new Date().toISOString(),
    projectMeta: {} as Record<string, unknown>,
    notes: [] as unknown[],
    audit: [] as unknown[],
  };
}

export type DemoData = ReturnType<typeof makeDemoSeed>;
