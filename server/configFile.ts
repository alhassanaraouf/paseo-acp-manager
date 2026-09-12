import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function paseoHome(): string {
  return process.env.PASEO_HOME ?? path.join(os.homedir(), ".paseo");
}

export function configPath(home = paseoHome()): string {
  return path.join(home, "config.json");
}

export function readConfigFile(file = configPath()): Record<string, unknown> {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Refusing to modify ${file}: not valid JSON`);
  }
}

export function writeConfigFile(cfg: unknown, file = configPath()): string {
  const text = JSON.stringify(cfg, null, 2) + "\n";
  JSON.parse(text);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${file}.${stamp}.bak`;
  try {
    fs.copyFileSync(file, backup);
  } catch {
    /* missing file: no backup to take */
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  return backup;
}

export function getProviders(cfg: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const agents = (cfg["agents"] ?? {}) as Record<string, unknown>;
  return (agents["providers"] ?? {}) as Record<string, Record<string, unknown>>;
}

export function setProviders(cfg: Record<string, unknown>, providers: Record<string, unknown>): void {
  const agents = { ...((cfg["agents"] as Record<string, unknown> | undefined) ?? {}) };
  agents["providers"] = providers;
  cfg["agents"] = agents;
}
