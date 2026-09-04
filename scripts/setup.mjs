// One-time setup: creates .env (with a random session secret), builds the database, seeds demo data.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (!existsSync(".env")) {
  let env = readFileSync(".env.example", "utf8");
  env = env.replace('SESSION_SECRET="change-me-to-a-long-random-string"', `SESSION_SECRET="${randomBytes(32).toString("hex")}"`);
  env = env.replace('APP_PASSWORD="change-me"', 'APP_PASSWORD="freestone"');
  writeFileSync(".env", env);
  console.log("Created .env  (password: freestone — change APP_PASSWORD in .env any time)");
} else {
  console.log(".env already exists, leaving it alone");
}
run("npx prisma generate");
run("npx prisma db push");
const hasData = (() => {
  try {
    return execSync('npx prisma db execute --stdin', { input: "SELECT count(*) FROM Fund;" }).toString();
  } catch {
    return "";
  }
})();
void hasData;
try {
  run("npx tsx prisma/seed.ts");
} catch {
  console.log("Seed skipped (database already has data). Run `npm run db:reset` to start over.");
}
console.log("\nReady. Start the app with:  npm run dev      then open http://localhost:3000");
console.log("Phone on the same Wi-Fi:    npm run dev:lan  and open the address it prints");
