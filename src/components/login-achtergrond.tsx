import type { ReactNode } from "react";

// Inlogscherm: rustige donkerblauwe achtergrond (Maasmond-blauw) met het formulier als witte kaart in het midden.
export function LoginAchtergrond({ children }: { children?: ReactNode }) {
  return (
    <>
      <div aria-hidden="true" className="mm-bg" />
      <div className="relative w-full max-w-sm mm-login-los">{children}</div>
    </>
  );
}
