// Mirrors the server-side allow rule; the database remains authoritative for roles.
export function isAllowedLoginEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith("@maasmond.nl") || normalized === "tyas@msoftware.nl";
}