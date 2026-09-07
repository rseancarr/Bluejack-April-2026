// Set the team members (and optionally the password) in .env, creating the file if needed.
//   npm run team -- "Sean,AJ,Teddy"
//   npm run team -- "Sean,AJ,Teddy" --password "newpassword"
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const members = args.find((a) => !a.startsWith("--"));
const pw = args.includes("--password") ? args[args.indexOf("--password") + 1] : null;
if (!members) {
  console.log('usage: npm run team -- "Name1,Name2,Name3" [--password "..."]');
  process.exit(1);
}
let env = existsSync(".env") ? readFileSync(".env", "utf8") : readFileSync(".env.example", "utf8").replace('SESSION_SECRET="change-me-to-a-long-random-string"', `SESSION_SECRET="${randomBytes(32).toString("hex")}"`);
const set = (key, value) => {
  const line = `${key}="${value}"`;
  env = new RegExp(`^${key}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${key}=.*$`, "m"), line) : env.trimEnd() + "\n" + line + "\n";
};
set("TEAM_MEMBERS", members.split(",").map((s) => s.trim()).filter(Boolean).join(","));
if (pw) set("APP_PASSWORD", pw);
writeFileSync(".env", env);
console.log("Saved to .env:");
console.log("  " + env.match(/^TEAM_MEMBERS=.*$/m)[0]);
if (pw) console.log("  APP_PASSWORD updated");
console.log("\nNow restart the app: stop it with Ctrl+C, then run  npm run dev");
