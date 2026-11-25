import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ROLE_LABELS, type AppRole } from "@/components/auth-context";
import { adminListUsers, adminSetUserRole, loadRolRechten, slaRolRechtenOp, type AdminUser } from "@/lib/store";
import { RECHTEN, ROLLEN, STANDAARD_RECHTEN, type Recht, type Rechten, type RechtenPerRol } from "@/lib/rechten";

function roleOf(u: AdminUser): AppRole | "" {
  return (ROLLEN.find((r) => u.roles.includes(r)) ?? "") as AppRole | "";
}

export default function GebruikersbeheerView() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [tabel, setTabel] = useState<RechtenPerRol>({});

  const laad = useCallback(async () => {
    setLaden(true);
    try {
      const rows = await adminListUsers();
      rows.sort((a, b) => (a.email || "").localeCompare(b.email || ""));
      setUsers(rows);
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setLaden(false);
    }
    loadRolRechten().then(setTabel).catch(() => setTabel({}));
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  async function wijzig(u: AdminUser, role: AppRole) {
    setBezig(u.user_id);
    const vorig = users;
    setUsers((prev) => prev.map((x) => (x.user_id === u.user_id ? { ...x, roles: [role] } : x)));
    try {
      await adminSetUserRole(u.user_id, role);
      toast.success(`${u.email} is nu ${ROLE_LABELS[role]}`);
    } catch (e) {
      setUsers(vorig);
      toast.error(`Rol wijzigen mislukt: ${e instanceof Error ? e.message : "onbekende fout"}`);
    } finally {
      setBezig(null);
    }
  }

  const rechtenVan = (rol: AppRole): Rechten => ({ ...STANDAARD_RECHTEN[rol], ...(tabel[rol] || {}) });
  async function zetRecht(rol: AppRole, recht: Recht, aan: boolean) {
    const vorig = tabel;
    const nieuw = { ...rechtenVan(rol), [recht]: aan };
    // Zonder kantoorscherm kan iemand ook niet plannen, accorderen of factureren
    if (recht === "kantoor" && !aan) { nieuw.plannen = false; nieuw.urenAccorderen = false; nieuw.facturatie = false; }
    if (recht !== "kantoor" && aan) nieuw.kantoor = true;
    setTabel({ ...tabel, [rol]: nieuw });
    try {
      await slaRolRechtenOp(rol, nieuw);
    } catch (e) {
      setTabel(vorig);
      toast.error(`Rechten opslaan mislukt: ${e instanceof Error ? e.message : "onbekende fout"}`);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-[#23272F]">Gebruikersbeheer</h1>
        <p className="text-sm text-[#5F6673]">Geef iedere gebruiker een rol, en bepaal hieronder wat elke rol mag.</p>
      </div>

      {fout && (
        <div className="bg-[#F5E1DC] text-[#B03A2E] text-sm rounded-md px-4 py-3">{fout}</div>
      )}

      <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F2F4F7] text-left text-[#23272F]">
              <th className="px-4 py-2.5 font-semibold">E-mailadres</th>
              <th className="px-4 py-2.5 font-semibold">Huidige rol</th>
              <th className="px-4 py-2.5 font-semibold">Rol wijzigen</th>
            </tr>
          </thead>
          <tbody>
            {laden && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-[#5F6673]">Laden…</td>
              </tr>
            )}
            {!laden && users.length === 0 && !fout && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-[#5F6673]">Geen gebruikers gevonden.</td>
              </tr>
            )}
            {users.map((u) => {
              const r = roleOf(u);
              return (
                <tr key={u.user_id} className="border-t border-[rgba(15,23,42,0.06)]">
                  <td className="px-4 py-2.5 text-[#23272F]">{u.email || "—"}</td>
                  <td className="px-4 py-2.5">
                    {r ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-[#EEF1F5] text-[#0A7E79]">
                        {ROLE_LABELS[r]}
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-[#F6EAD3] text-[#8A5B00]">
                        Geen toegang
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={r}
                      disabled={bezig === u.user_id}
                      onChange={(e) => void wijzig(u, e.target.value as AppRole)}
                      aria-label={`Rol van ${u.email}`}
                      className="border border-[rgba(15,23,42,0.15)] rounded-[10px] px-2 py-1.5 text-sm bg-white text-[#23272F] disabled:opacity-60"
                    >
                      {!r && <option value="">Geen rol</option>}
                      {ROLLEN.map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-base font-semibold text-[#23272F]">Rechten per rol</h2>
        <p className="text-sm text-[#5F6673]">Vink aan wat een rol mag. Wijzigingen worden direct bewaard en gelden de volgende keer dat iemand de app opent. De beheerder mag altijd alles.</p>
      </div>
      <div className="bg-white rounded-lg border border-[rgba(15,23,42,0.06)] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F2F4F7] text-left text-[#23272F]">
              <th className="px-4 py-2.5 font-semibold">Rol</th>
              {RECHTEN.map((x) => (
                <th key={x.recht} className="px-3 py-2.5 font-semibold text-center" title={x.uitleg}>{x.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLLEN.map((rol) => {
              const rr = rechtenVan(rol);
              const vast = rol === "beheerder";
              return (
                <tr key={rol} className="border-t border-[rgba(15,23,42,0.06)]">
                  <td className="px-4 py-2.5 text-[#23272F]">
                    {ROLE_LABELS[rol]}
                    {!rr.kantoor && <span className="block text-xs text-[#5F6673]">Ziet alleen de eigen planning</span>}
                  </td>
                  {RECHTEN.map((x) => (
                    <td key={x.recht} className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={vast || rr[x.recht]}
                        disabled={vast}
                        onChange={(e) => void zetRecht(rol, x.recht, e.target.checked)}
                        aria-label={`${ROLE_LABELS[rol]}: ${x.label}`}
                        className="w-4 h-4 accent-[#1E3A7B] disabled:opacity-50"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="text-xs text-[#5F6673] space-y-1">
        {RECHTEN.map((x) => <li key={x.recht}><span className="font-semibold text-[#23272F]">{x.label}:</span> {x.uitleg}</li>)}
      </ul>
    </div>
  );
}
