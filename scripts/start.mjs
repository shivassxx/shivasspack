import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const output = resolve(".next/standalone");
const server = resolve(output, "server.js");

if (!existsSync(server)) {
  throw new Error("Production çıktısı bulunamadı. Önce npm run build çalıştırın.");
}

// Next standalone output intentionally excludes public and static assets.
// Docker copies them in the image; local npm start performs the same assembly.
mkdirSync(resolve(output, ".next"), { recursive: true });
cpSync(resolve(".next/static"), resolve(output, ".next/static"), { recursive: true });
if (existsSync("public")) {
  cpSync(resolve("public"), resolve(output, "public"), { recursive: true });
}

process.env.NODE_ENV = "production";
process.env.HOSTNAME ||= "0.0.0.0";
// Standalone changes cwd to its output directory. Resolve local mail before import.
process.env.MAIL_OUTBOX_DIR = resolve(process.env.MAIL_OUTBOX_DIR || ".mail");
await import(pathToFileURL(server).href);
