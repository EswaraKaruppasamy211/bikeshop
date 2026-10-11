import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { stdin, stdout } from "node:process";

const scryptAsync = promisify(scrypt);

async function readHiddenPassword(): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command from an interactive terminal.");
  }
  stdout.write("New administrator password (input hidden): ");
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Password hash generation cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    stdin.on("data", onData);
  });
}

try {
  const password = await readHiddenPassword();
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 1024) {
    throw new Error("Use a password between 12 and 1024 UTF-8 bytes.");
  }
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64) as Buffer;
  stdout.write(`ADMIN_PASSWORD_HASH=scrypt$${salt.toString("hex")}$${hash.toString("hex")}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not generate a password hash.");
  process.exitCode = 1;
}
