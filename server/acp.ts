import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import {
  acpEntrySchema,
  validateProviderId,
  type acpRemove,
  type acpSave,
  type acpTest,
} from "../shared/acp";
import { configPath, getProviders, readConfigFile, setProviders, writeConfigFile } from "./configFile";

function resolveOnPath(binary: string): string | null {
  if (binary.includes("/") || binary.includes(path.sep)) {
    try {
      return fs.existsSync(binary) ? binary : null;
    } catch {
      return null;
    }
  }
  const dirs = (process.env.PATH ?? "").split(path.delimiter);
  for (const d of dirs) {
    const full = path.join(d, binary);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch {
      /* next dir */
    }
  }
  return null;
}

export async function listProviders() {
  const file = configPath();
  const cfg = readConfigFile(file);
  const providers = getProviders(cfg);
  return {
    configPath: file,
    providers: Object.entries(providers).map(([id, entry]) => ({ id, entry: entry ?? {} })),
  };
}

export async function saveProvider({ id, entry, editing }: RpcInput<typeof acpSave>) {
  const badId = validateProviderId(id);
  if (badId) throw new Error(badId);
  const parsed = acpEntrySchema.safeParse(entry);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const binary = parsed.data.command[0]!;
  if (!resolveOnPath(binary)) {
    throw new Error(`Binary "${binary}" not found on PATH of the daemon host`);
  }
  for (const k of Object.keys(parsed.data.env ?? {})) {
    if (!k.trim()) throw new Error("env keys must be non-empty");
  }
  const file = configPath();
  const cfg = readConfigFile(file);
  const providers = { ...getProviders(cfg) };
  const existing = providers[id];
  if (existing && !editing) throw new Error(`Provider id "${id}" already exists`);
  if (!existing && editing) throw new Error(`Provider id "${id}" does not exist`);
  if (existing && existing["extends"] !== undefined && existing["extends"] !== "acp") {
    throw new Error(
      `Refusing to overwrite "${id}": it extends "${String(existing["extends"])}", not "acp"`,
    );
  }
  providers[id] = parsed.data as unknown as Record<string, unknown>;
  setProviders(cfg, providers);
  const backupPath = writeConfigFile(cfg, file);
  return { ok: true as const, configPath: file, backupPath, needsReload: true };
}

export async function removeProvider({ id }: RpcInput<typeof acpRemove>) {
  const file = configPath();
  const cfg = readConfigFile(file);
  const providers = { ...getProviders(cfg) };
  const existing = providers[id];
  if (!existing) throw new Error(`Provider id "${id}" does not exist`);
  if (existing["extends"] === undefined) {
    throw new Error(`Refusing to delete "${id}": it has no "extends" field, so it may be built-in`);
  }
  if (existing["extends"] !== "acp") {
    throw new Error(
      `Refusing to delete "${id}": it extends "${String(existing["extends"])}", not "acp"`,
    );
  }
  delete providers[id];
  setProviders(cfg, providers);
  const backupPath = writeConfigFile(cfg, file);
  return { ok: true as const, configPath: file, backupPath, needsReload: true };
}

const REGISTRY_URL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

interface RegistryPackageDist {
  package: string;
  args?: string[];
  env?: Record<string, string>;
}
interface RegistryAgent {
  id: string;
  name: string;
  description: string;
  website?: string;
  repository?: string;
  distribution?: { npx?: RegistryPackageDist; uvx?: RegistryPackageDist };
}

export async function listCatalog() {
  const res = await fetch(REGISTRY_URL);
  if (!res.ok) throw new Error(`Registry fetch failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { agents: RegistryAgent[] };
  const entries = data.agents.map((a) => {
    const npx = a.distribution?.npx;
    const uvx = a.distribution?.uvx;
    const dist = npx
      ? { runner: "npx" as const, pkg: npx }
      : uvx
        ? { runner: "uvx" as const, pkg: uvx }
        : null;
    return {
      id: a.id,
      label: a.name,
      description: a.description,
      command: dist
        ? [dist.runner, ...(dist.runner === "npx" ? ["-y"] : []), dist.pkg.package, ...(dist.pkg.args ?? [])]
        : null,
      env: dist?.pkg.env,
      website: a.website,
      repository: a.repository,
    };
  });
  return { entries };
}

export async function reloadDaemon() {
  const binary = resolveOnPath("paseo");
  if (!binary) throw new Error('"paseo" CLI not found on PATH of the daemon host');
  return await new Promise<{ ok: true; output: string }>((resolve, reject) => {
    execFile(binary, ["reload", "--json"], { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolve({ ok: true, output: stdout.trim() });
    });
  });
}

export async function testProvider({ command, env }: RpcInput<typeof acpTest>) {
  const binary = command[0]!;
  if (!resolveOnPath(binary)) {
    return { ok: false, error: `Binary "${binary}" not found on PATH of the daemon host` };
  }
  return await new Promise<{
    ok: boolean;
    capabilities?: Record<string, unknown>;
    error?: string;
  }>((resolve) => {
    let proc;
    try {
      proc = spawn(binary, command.slice(1), {
        env: { ...process.env, ...(env ?? {}) },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
      return;
    }
    let out = "";
    let err = "";
    let done = false;
    const finish = (r: { ok: boolean; capabilities?: Record<string, unknown>; error?: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      resolve(r);
    };
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          error: `No valid initialize response within 15s (stdout: ${out.slice(0, 500)} stderr: ${err.slice(0, 500)})`,
        }),
      15000,
    );
    proc.stdout.on("data", (d: Buffer) => {
      out += d.toString();
      for (const line of out.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("{")) continue;
        try {
          const msg = JSON.parse(t) as { id?: unknown; result?: unknown; error?: unknown };
          if (msg.id === 1 && msg.result !== undefined) {
            finish({ ok: true, capabilities: (msg.result ?? {}) as Record<string, unknown> });
            return;
          }
          if (msg.id === 1 && msg.error !== undefined) {
            finish({
              ok: false,
              error: `initialize returned error: ${JSON.stringify(msg.error).slice(0, 500)}`,
            });
            return;
          }
        } catch {
          /* partial line */
        }
      }
    });
    proc.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    proc.on("error", (e) => finish({ ok: false, error: `spawn failed: ${String(e)}` }));
    proc.on("exit", (code) =>
      finish({
        ok: false,
        error: `Process exited (code ${code}) before valid initialize response. stderr: ${err.slice(0, 500)}`,
      }),
    );
    const req =
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: 1, clientCapabilities: {} },
      }) + "\n";
    proc.stdin.write(req, (e) => {
      if (e) finish({ ok: false, error: `stdin write failed: ${String(e)}` });
    });
  });
}
