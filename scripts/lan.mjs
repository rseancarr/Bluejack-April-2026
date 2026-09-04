// Starts the dev server on all interfaces and prints the address to open from a phone on the same Wi-Fi.
import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";

const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
console.log("\nOpen on this computer:  http://localhost:3000");
for (const ip of ips) console.log(`Open on your phone:     http://${ip}:3000   (same Wi-Fi network)`);
console.log("");
const child = spawn("npx", ["next", "dev", "-H", "0.0.0.0", "-p", "3000"], { stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
