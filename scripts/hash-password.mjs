// Prompts for a password (hidden) and prints the APP_PASSWORD_HASH value.
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

const pw = await ask("Password baru: ");
if (pw.length < 12) { console.error("Minimal 12 karakter ya."); process.exit(1); }
const again = await ask("Ulangi password: ");
if (pw !== again) { console.error("Password gak sama."); process.exit(1); }

const N = 2 ** 15, r = 8, p = 1;
const salt = randomBytes(16);
const key = scryptSync(pw, salt, 64, { N, r, p, maxmem: 128 * N * r * 2 });
console.log("\nAPP_PASSWORD_HASH=" + ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join(":"));
