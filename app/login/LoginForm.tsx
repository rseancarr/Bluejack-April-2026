"use client";
import { useActionState } from "react";
import { login } from "@/lib/actions/auth";

export function LoginForm({ members, next }: { members: string[]; next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="lbl" htmlFor="name">I am</label>
        <select id="name" name="name" className="select" defaultValue={members[0]}>
          {members.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="lbl" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" autoFocus required />
      </div>
      {state?.error && <p className="text-neg">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending}>Sign in</button>
    </form>
  );
}
