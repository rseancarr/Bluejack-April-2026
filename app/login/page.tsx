import { teamMembers } from "@/lib/constants";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="max-w-sm mx-auto mt-24">
      <h1 className="mb-1">Sign in</h1>
      <p className="muted mb-6">Shared team password. Pick your name so action items can be assigned to you.</p>
      <LoginForm members={teamMembers()} next={next ?? "/"} />
    </div>
  );
}
