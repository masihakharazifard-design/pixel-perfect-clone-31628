import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ROLE_LABELS, type AppRole } from "@/components/auth-context";
import { adminListUsers, adminSetUserRole, type AdminUser } from "@/lib/planning-store";

const ROLES: AppRole[] = ["beheerder", "planner", "projectleider", "financieel", "medewerker"];

function roleOf(u: AdminUser): AppRole | "" {
  return (ROLES.find((r) => u.roles.includes(r)) ?? "") as AppRole | "";
}

export default function GebruikersbeheerView() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);

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

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-[#1A2744]">Gebruikersbeheer</h1>
        <p className="text-sm text-[#6B7A99]">Beheer welke rol iedere gebruiker heeft.</p>
      </div>

      {fout && (
        <div className="bg-[#FFE8E5] text-[#B03A2E] text-sm rounded-xl px-4 py-3">{fout}</div>
      )}

      <div className="bg-white rounded-2xl border border-[rgba(26,39,68,0.06)] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F0F3F8] text-left text-[#1A2744]">
              <th className="px-4 py-2.5 font-semibold">E-mailadres</th>
              <th className="px-4 py-2.5 font-semibold">Huidige rol</th>
              <th className="px-4 py-2.5 font-semibold">Rol wijzigen</th>
            </tr>
          </thead>
          <tbody>
            {laden && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-[#6B7A99]">Laden…</td>
              </tr>
            )}
            {!laden && users.length === 0 && !fout && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-[#6B7A99]">Geen gebruikers gevonden.</td>
              </tr>
            )}
            {users.map((u) => {
              const r = roleOf(u);
              return (
                <tr key={u.user_id} className="border-t border-[rgba(26,39,68,0.06)]">
                  <td className="px-4 py-2.5 text-[#1A2744]">{u.email || "—"}</td>
                  <td className="px-4 py-2.5">
                    {r ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-[#E0F7F6] text-[#0A7E79]">
                        {ROLE_LABELS[r]}
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-[#FEF0D3] text-[#8A5B00]">
                        Geen toegang
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={r}
                      disabled={bezig === u.user_id}
                      onChange={(e) => void wijzig(u, e.target.value as AppRole)}
                      className="border border-[rgba(26,39,68,0.15)] rounded-lg px-2 py-1.5 text-sm bg-white text-[#1A2744] disabled:opacity-60"
                    >
                      {!r && <option value="">Geen rol</option>}
                      {ROLES.map((role) => (
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
    </div>
  );
}
