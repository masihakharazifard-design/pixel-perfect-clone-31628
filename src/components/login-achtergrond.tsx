import loftFoto from "@/assets/login-loft.webp";

// Achtergrond van het inlogscherm: een echte foto van een ruimte in verbouwing.
// De foto zoomt heel langzaam in en uit; bij "minder beweging" staat hij stil.
export function LoginAchtergrond() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden mm-scene-login">
      <img src={loftFoto} alt="" className="mm-login-foto absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,238,0.10),rgba(255,248,238,0.22))]" />
    </div>
  );
}
