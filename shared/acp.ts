import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const PROVIDER_ID_RE = /^[a-z][a-z0-9-]*$/;

export const acpModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const acpEntrySchema = z.object({
  extends: z.literal("acp"),
  label: z.string().min(1, "label must be non-empty"),
  command: z.array(z.string().min(1)).min(1, "command must be a non-empty array"),
  description: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  models: z.array(acpModelSchema).optional(),
  additionalModels: z.array(acpModelSchema).optional(),
  disallowedTools: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  order: z.number().optional(),
});
export type AcpEntry = z.output<typeof acpEntrySchema>;

export const acpProviderSchema = z.object({
  id: z.string(),
  entry: z.record(z.string(), z.unknown()),
});
export type AcpProvider = z.output<typeof acpProviderSchema>;

export const acpList = defineRpc({
  name: "acp.list",
  input: z.object({}),
  output: z.object({
    providers: z.array(acpProviderSchema),
    configPath: z.string(),
  }),
});

export const acpSave = defineRpc({
  name: "acp.save",
  input: z.object({
    id: z.string(),
    entry: acpEntrySchema,
    editing: z.boolean().default(false),
  }),
  output: z.object({
    ok: z.literal(true),
    configPath: z.string(),
    backupPath: z.string(),
    needsReload: z.boolean(),
  }),
});

export const acpRemove = defineRpc({
  name: "acp.remove",
  input: z.object({ id: z.string() }),
  output: z.object({
    ok: z.literal(true),
    configPath: z.string(),
    backupPath: z.string(),
    needsReload: z.boolean(),
  }),
});

export const acpCatalogEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  command: z.array(z.string()).nullable(),
  env: z.record(z.string(), z.string()).optional(),
  website: z.string().optional(),
  repository: z.string().optional(),
});
export type AcpCatalogEntry = z.output<typeof acpCatalogEntrySchema>;

export const acpCatalog = defineRpc({
  name: "acp.catalog",
  input: z.object({}),
  output: z.object({ entries: z.array(acpCatalogEntrySchema) }),
});

export const acpReload = defineRpc({
  name: "acp.reload",
  input: z.object({}),
  output: z.object({ ok: z.literal(true), output: z.string() }),
});

export const acpTest = defineRpc({
  name: "acp.test",
  input: z.object({
    command: z.array(z.string()).min(1),
    env: z.record(z.string(), z.string()).optional(),
  }),
  output: z.object({
    ok: z.boolean(),
    capabilities: z.record(z.string(), z.unknown()).optional(),
    error: z.string().optional(),
  }),
});

export function validateProviderId(id: string): string | null {
  if (!PROVIDER_ID_RE.test(id)) {
    return `Invalid provider id "${id}": must match /^[a-z][a-z0-9-]*$/`;
  }
  return null;
}

export function parseCommandString(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && i + 1 < input.length) cur += input[++i]!;
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (/\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
    } else {
      cur += c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function parseEnvLines(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) throw new Error(`Bad env line (want KEY=value): ${raw}`);
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!k) throw new Error(`Bad env line (empty key): ${raw}`);
    env[k] = v;
  }
  return env;
}

export function envToLines(env?: Record<string, string>): string {
  if (!env) return "";
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}
