import { cookies } from "next/headers";
import { teamMembers } from "./constants";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export { SESSION_COOKIE, makeSessionToken, verifySessionToken, checkPassword } from "./session";

/** Current user's display name from the session cookie (server components / actions). */
export async function currentUser(): Promise<string> {
  const store = await cookies();
  const name = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  return name ?? teamMembers()[0];
}
