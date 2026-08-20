/**
 * Устанавливает меню команд бота (setMyCommands).
 *
 *   tsx scripts/set-commands.ts
 *
 * Token: TELEGRAM_BOT_TOKEN из .env.local / .env / окружения.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

for (const file of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN not set");
}

const commands = [
  { command: "start", description: "Приветствие и кнопка открытия" },
  { command: "open", description: "Открыть SwipeMark" },
  { command: "help", description: "Как пользоваться" },
  { command: "unlink", description: "Отвязать Telegram от аккаунта" },
];

const res = await fetch(
  `https://api.telegram.org/bot${token}/setMyCommands`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  }
);
const data = await res.json();
console.log(data.ok ? "OK: меню команд установлено" : `FAIL: ${JSON.stringify(data)}`);
if (!data.ok) process.exitCode = 1;