import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  envToLines,
  parseCommandString,
  parseEnvLines,
  validateProviderId,
} from "../shared/acp";
import { configPath } from "../server/configFile";
import {
  listCatalog,
  listProviders,
  reloadDaemon,
  removeProvider,
  saveProvider,
  testProvider,
} from "../server/acp";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFile: vi.fn() };
});

let dir = "";

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "acp-test-"));
  process.env.PASEO_HOME = dir;
  fs.writeFileSync(configPath(), JSON.stringify({ agents: { providers: {} }, other: 1 }), "utf8");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.PASEO_HOME;
});

describe("validation", () => {
  it("rejects bad ids", () => {
    expect(validateProviderId("Bad_Id")).toMatch(/must match/);
    expect(validateProviderId("1abc")).toMatch(/must match/);
    expect(validateProviderId("my-agent")).toBeNull();
  });
  it("parses command strings", () => {
    expect(parseCommandString("gemini --acp")).toEqual(["gemini", "--acp"]);
    expect(parseCommandString('"my bin" --flag \'a b\'')).toEqual(["my bin", "--flag", "a b"]);
  });
  it("parses env lines", () => {
    expect(parseEnvLines("A=1\n# c\nB=x=y")).toEqual({ A: "1", B: "x=y" });
    expect(() => parseEnvLines("NOEQUALS")).toThrow();
    expect(envToLines({ A: "1" })).toBe("A=1");
  });
});

describe("save/remove against temp config", () => {
  const nodeBin = process.execPath;

  it("saves, lists, removes; dup + missing binary fail clean", async () => {
    const before = fs.readFileSync(configPath(), "utf8");
    await expect(
      saveProvider({ id: "Bad", entry: { extends: "acp", label: "x", command: [nodeBin] }, editing: false }),
    ).rejects.toThrow(/must match/);
    await expect(
      saveProvider({
        id: "gone",
        entry: { extends: "acp", label: "x", command: ["no-such-bin-xyz"] },
        editing: false,
      }),
    ).rejects.toThrow(/not found on PATH/);
    expect(fs.readFileSync(configPath(), "utf8")).toBe(before);

    await saveProvider({
      id: "fake",
      entry: { extends: "acp", label: "Fake", command: [nodeBin, "--version"] },
      editing: false,
    });
    const listed = await listProviders();
    expect(listed.providers.map((p) => p.id)).toContain("fake");
    const cfg = JSON.parse(fs.readFileSync(configPath(), "utf8")) as Record<string, unknown>;
    expect(cfg["other"]).toBe(1);

    await expect(
      saveProvider({
        id: "fake",
        entry: { extends: "acp", label: "Dup", command: [nodeBin] },
        editing: false,
      }),
    ).rejects.toThrow(/already exists/);
    await removeProvider({ id: "fake" });
    expect((await listProviders()).providers.map((p) => p.id)).not.toContain("fake");

    fs.writeFileSync(
      configPath(),
      JSON.stringify({ agents: { providers: { keep: { label: "builtin" } } } }),
      "utf8",
    );
    await expect(removeProvider({ id: "keep" })).rejects.toThrow(/built-in/);
  });
});

describe("reload", () => {
  it("resolves with stdout on success, rejects with stderr on failure", async () => {
    const { execFile } = await import("node:child_process");
    const mocked = vi.mocked(execFile);
    mocked.mockImplementationOnce(((...args: unknown[]) => {
      const cb = args[args.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(null, '{"ok":true}', "");
      return {} as ReturnType<typeof execFile>;
    }) as typeof execFile);
    await expect(reloadDaemon()).resolves.toEqual({ ok: true, output: '{"ok":true}' });

    mocked.mockImplementationOnce(((...args: unknown[]) => {
      const cb = args[args.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(new Error("boom"), "", "daemon unreachable");
      return {} as ReturnType<typeof execFile>;
    }) as typeof execFile);
    await expect(reloadDaemon()).rejects.toThrow("daemon unreachable");
  });
});

describe("catalog", () => {
  it("prefers npx over uvx and flags binary-only agents as manual install", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        agents: [
          {
            id: "npx-agent",
            name: "Npx Agent",
            description: "d",
            distribution: { npx: { package: "foo-acp", args: ["--x"], env: { A: "1" } } },
          },
          {
            id: "binary-agent",
            name: "Binary Agent",
            description: "d",
            distribution: { binary: { "linux-x86_64": { archive: "u", cmd: "c" } } },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { entries } = await listCatalog();
    expect(entries.find((e) => e.id === "npx-agent")?.command).toEqual([
      "npx",
      "-y",
      "foo-acp",
      "--x",
    ]);
    expect(entries.find((e) => e.id === "npx-agent")?.env).toEqual({ A: "1" });
    expect(entries.find((e) => e.id === "binary-agent")?.command).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("initialize handshake", () => {
  it("passes against the fake ACP binary", async () => {
    const fake = path.join(import.meta.dirname, "fake-acp.mjs");
    execFileSync(process.execPath, ["--check", fake]);
    const r = await testProvider({ command: [process.execPath, fake] });
    expect(r.ok).toBe(true);
  }, 20000);
  it("fails on missing binary", async () => {
    const r = await testProvider({ command: ["no-such-bin-xyz"] });
    expect(r.ok).toBe(false);
  });
});
