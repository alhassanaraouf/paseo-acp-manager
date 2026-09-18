import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  acpCatalog,
  acpList,
  acpReload,
  acpRemove,
  acpSave,
  acpTest,
  envToLines,
  parseCommandString,
  parseEnvLines,
  type AcpCatalogEntry,
} from "../shared/acp";

const NEW_FORM = { id: "", label: "", description: "", command: "", env: "", enabled: true };

export function AcpManager({ theme, layout }: PluginSurfaceProps) {
  const list = useRpc(acpList);
  const save = useRpc(acpSave);
  const remove = useRpc(acpRemove);
  const test = useRpc(acpTest);
  const catalog = useRpc(acpCatalog);
  const reload = useRpc(acpReload);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["acp.list"], queryFn: () => list({}) });
  const catalogQ = useQuery({
    queryKey: ["acp.catalog"],
    queryFn: () => catalog({}),
    staleTime: 10 * 60 * 1000,
  });
  const [form, setForm] = useState(NEW_FORM);
  const [editing, setEditing] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState("");
  const [advancedErr, setAdvancedErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [testOut, setTestOut] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [draftTest, setDraftTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [draftTesting, setDraftTesting] = useState(false);
  const [autoReload, setAutoReload] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"providers" | "catalog">("providers");
  const pad = layout.compact ? 12 : 20;

  const acpProviders = (q.data?.providers ?? []).filter(
    (p) => (p.entry as Record<string, unknown>)["extends"] === "acp",
  );
  const enabledCount = acpProviders.filter(
    (p) => (p.entry as Record<string, unknown>)["enabled"] !== false,
  ).length;
  const passCount = Object.values(testOut).filter((t) => t.ok).length;
  const failCount = Object.values(testOut).filter((t) => !t.ok).length;
  const allTestedOk =
    acpProviders.length > 0 && acpProviders.every((p) => testOut[p.id]?.ok === true);

  const styles = {
    screen: { flex: 1, padding: pad, gap: 14, backgroundColor: theme.colors.surface0 },
    headerRow: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      flexWrap: "wrap" as const,
      gap: 8,
    },
    title: {
      color: theme.colors.foreground,
      fontSize: layout.compact ? 20 : 26,
      fontWeight: "700" as const,
    },
    sectionTitle: {
      color: theme.colors.foreground,
      fontSize: layout.compact ? 16 : 18,
      fontWeight: "600" as const,
    },
    card: {
      padding: pad,
      gap: 8,
      borderRadius: 10,
      backgroundColor: theme.colors.surface1,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    body: { color: theme.colors.foreground, fontSize: 14 },
    muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
    mono: { color: theme.colors.foregroundMuted, fontSize: 12, fontFamily: "monospace" },
    input: {
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surface2,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, backgroundColor: theme.colors.accent },
    btnText: {
      color: theme.colors.accentForeground,
      textAlign: "center" as const,
      fontWeight: "600" as const,
      fontSize: 13,
    },
    pillBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    pillBtnText: { color: theme.colors.foreground, fontSize: 12, fontWeight: "600" as const },
    danger: { color: theme.colors.statusDanger, fontSize: 13, fontWeight: "600" as const },
    ok: { color: theme.colors.statusSuccess, fontSize: 12 },
    warn: { color: theme.colors.statusWarning, fontSize: 13 },
    statusRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
    statsRow: { flexDirection: "row" as const, gap: 10, flexWrap: "wrap" as const },
    statTile: {
      flexGrow: 1,
      minWidth: 110,
      padding: 12,
      gap: 4,
      borderRadius: 10,
      backgroundColor: theme.colors.surface1,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    statValue: { color: theme.colors.foreground, fontSize: 26, fontWeight: "700" as const },
    statLabel: { color: theme.colors.foregroundMuted, fontSize: 12 },
    banner: {
      padding: pad,
      gap: 8,
      borderRadius: 12,
      backgroundColor: theme.colors.surface1,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    bannerTitle: { color: theme.colors.foreground, fontSize: 20, fontWeight: "700" as const },
    catalogRow: { flexDirection: "row" as const, gap: 10, flexWrap: "wrap" as const },
    catalogCard: {
      width: layout.compact ? ("100%" as const) : 260,
      minHeight: 196,
      padding: 12,
      gap: 6,
      borderRadius: 10,
      backgroundColor: theme.colors.surface1,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    catalogDescription: { color: theme.colors.foregroundMuted, fontSize: 12, flexGrow: 1 },
    tabRow: { flexDirection: "row" as const, gap: 8 },
    tab: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tabActive: { backgroundColor: theme.colors.surface2 },
    tabText: { color: theme.colors.foregroundMuted, fontSize: 13, fontWeight: "600" as const },
    tabTextActive: { color: theme.colors.foreground },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center" as const,
      padding: layout.compact ? 12 : 40,
    },
    modalCard: {
      alignSelf: "center" as const,
      width: layout.compact ? ("100%" as const) : 480,
      maxHeight: "90%" as const,
      padding: pad,
      gap: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.surface1,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
  };

  function dot(color: string) {
    return { width: 8, height: 8, borderRadius: 4, backgroundColor: color };
  }

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["acp.list"] });
  };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e));
  const invalidateTest = (id: string) =>
    setTestOut((m) => {
      if (!(id in m)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });

  function resetForm() {
    setForm(NEW_FORM);
    setEditing(null);
    setAdvanced("");
    setAdvancedErr(null);
    setDraftTest(null);
    setShowForm(false);
  }

  function maybeReload(r: { backupPath: string }) {
    if (!autoReload) return ` Saved. Backup: ${r.backupPath}. Click "Reload Paseo" to apply.`;
    void reload({})
      .then(() => {
        setMsg((m) => `${m ?? ""} Reloaded.`.trim());
        refresh();
      })
      .catch((e: unknown) => fail(e));
    return " Saved. Reloading Paseo…";
  }

  function parseAdvanced(): Record<string, unknown> {
    if (!advanced.trim()) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(advanced);
    } catch {
      throw new Error("Advanced JSON is not valid JSON");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Advanced JSON must be an object");
    }
    const allowed = ["params", "models", "additionalModels", "disallowedTools", "order"];
    const out: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in (parsed as Record<string, unknown>)) out[k] = (parsed as Record<string, unknown>)[k];
    }
    return out;
  }

  function advancedOf(entry: Record<string, unknown>): string {
    const out: Record<string, unknown> = {};
    for (const k of ["params", "models", "additionalModels", "disallowedTools", "order"]) {
      if (entry[k] !== undefined) out[k] = entry[k];
    }
    return Object.keys(out).length ? JSON.stringify(out, null, 2) : "";
  }

  function draftEntry() {
    const command = parseCommandString(form.command);
    const env = form.env.trim() ? parseEnvLines(form.env) : undefined;
    return {
      extends: "acp" as const,
      label: form.label.trim(),
      description: form.description.trim() || undefined,
      command,
      env,
      enabled: form.enabled,
      ...parseAdvanced(),
    };
  }

  async function onReloadPaseo() {
    setErr(null);
    setMsg(null);
    try {
      await reload({});
      setMsg("Paseo reloaded daemon config. New/changed providers are now applied.");
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  async function onSave() {
    setErr(null);
    setMsg(null);
    setAdvancedErr(null);
    let entry;
    try {
      entry = draftEntry();
    } catch (e) {
      setAdvancedErr(e instanceof Error ? e.message : String(e));
      return;
    }
    try {
      const id = form.id.trim();
      const r = await save({ id, entry, editing: editing !== null });
      setMsg(`Saved "${id}". Backup: ${r.backupPath}.${maybeReload(r)}`);
      invalidateTest(id);
      resetForm();
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  async function onTestDraft() {
    setErr(null);
    setDraftTest(null);
    let entry;
    try {
      entry = draftEntry();
    } catch (e) {
      setAdvancedErr(e instanceof Error ? e.message : String(e));
      return;
    }
    if (!entry.command.length) {
      setErr("Command is empty — enter a command to test.");
      return;
    }
    setDraftTesting(true);
    try {
      const r = await test({ command: entry.command, env: entry.env });
      setDraftTest(
        r.ok
          ? { ok: true, text: `OK ${JSON.stringify(r.capabilities ?? {}).slice(0, 200)}` }
          : { ok: false, text: `FAIL: ${r.error}` },
      );
    } catch (e) {
      fail(e);
    } finally {
      setDraftTesting(false);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(NEW_FORM);
    setAdvanced("");
    setAdvancedErr(null);
    setDraftTest(null);
    setShowForm(true);
  }

  function quickAdd(item: AcpCatalogEntry) {
    if (!item.command) return;
    setEditing(null);
    setShowForm(true);
    setErr(null);
    setMsg(null);
    setAdvanced("");
    setAdvancedErr(null);
    setDraftTest(null);
    setForm({
      id: item.id,
      label: item.label,
      description: item.description,
      command: item.command.join(" "),
      env: envToLines(item.env),
      enabled: true,
    });
  }

  function startEdit(id: string, entry: Record<string, unknown>) {
    setEditing(id);
    setShowForm(true);
    setAdvancedErr(null);
    setDraftTest(null);
    setForm({
      id,
      label: String(entry["label"] ?? ""),
      description: String(entry["description"] ?? ""),
      command: Array.isArray(entry["command"]) ? (entry["command"] as string[]).join(" ") : "",
      env: envToLines(entry["env"] as Record<string, string> | undefined),
      enabled: entry["enabled"] !== false,
    });
    setAdvanced(advancedOf(entry));
  }

  async function onTest(id: string, entry: Record<string, unknown>) {
    setErr(null);
    try {
      const r = await test({
        command: entry["command"] as string[],
        env: entry["env"] as Record<string, string> | undefined,
      });
      setTestOut((m) => ({
        ...m,
        [id]: r.ok
          ? { ok: true, text: `OK ${JSON.stringify(r.capabilities ?? {}).slice(0, 200)}` }
          : { ok: false, text: `FAIL: ${r.error}` },
      }));
    } catch (e) {
      fail(e);
    }
  }

  async function onToggleEnabled(id: string, entry: Record<string, unknown>) {
    setErr(null);
    setMsg(null);
    try {
      const enabled = entry["enabled"] !== false;
      const rest: Record<string, unknown> = {};
      for (const k of ["params", "models", "additionalModels", "disallowedTools", "order"]) {
        if (entry[k] !== undefined) rest[k] = entry[k];
      }
      const r = await save({
        id,
        entry: {
          extends: "acp",
          label: String(entry["label"] ?? id),
          description: (entry["description"] as string | undefined) ?? undefined,
          command: entry["command"] as string[],
          env: entry["env"] as Record<string, string> | undefined,
          enabled: !enabled,
          ...rest,
        },
        editing: true,
      });
      setMsg(
        `${enabled ? "Disabled" : "Enabled"} "${id}". Backup: ${r.backupPath}.${maybeReload(r)}`,
      );
      invalidateTest(id);
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  async function onRemove(id: string) {
    setErr(null);
    setMsg(null);
    try {
      const r = await remove({ id });
      setMsg(`Removed "${id}". Backup: ${r.backupPath}.${maybeReload(r)}`);
      invalidateTest(id);
      setConfirmDelete(null);
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  const catalogEntries = (catalogQ.data?.entries ?? []).filter((c) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return `${c.label} ${c.id} ${c.description}`.toLowerCase().includes(needle);
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <View style={styles.screen}>
        <View>
          <View style={styles.headerRow}>
            <Text style={styles.title}>ACP providers</Text>
            <View style={styles.statusRow}>
              <View
                style={dot(
                  acpProviders.length === 0
                    ? theme.colors.foregroundMuted
                    : allTestedOk
                      ? theme.colors.statusSuccess
                      : failCount > 0
                        ? theme.colors.statusDanger
                        : theme.colors.statusWarning,
                )}
              />
              <Text style={styles.muted}>
                {acpProviders.length === 0
                  ? "No providers yet"
                  : allTestedOk
                    ? "All tested OK"
                    : failCount > 0
                      ? `${failCount} failing`
                      : "Not all tested"}
              </Text>
            </View>
          </View>
          <Text style={styles.muted}>{q.data?.configPath ?? "$PASEO_HOME/config.json"}</Text>
        </View>

        {err ? <Text style={styles.danger}>{err}</Text> : null}
        {msg ? <Text style={styles.warn}>{msg}</Text> : null}

        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{acpProviders.length}</Text>
            <Text style={styles.statLabel}>Providers</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{enabledCount}</Text>
            <Text style={styles.statLabel}>Enabled</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{passCount}</Text>
            <Text style={styles.statLabel}>Tested OK</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{failCount}</Text>
            <Text style={styles.statLabel}>Failing</Text>
          </View>
        </View>

        <View style={styles.banner}>
          <View style={styles.statusRow}>
            <View
              style={dot(
                acpProviders.length === 0
                  ? theme.colors.foregroundMuted
                  : allTestedOk
                    ? theme.colors.statusSuccess
                    : theme.colors.statusWarning,
              )}
            />
            <Text style={styles.muted}>
              {acpProviders.length === 0 ? "Getting started" : "ACP · this config"}
            </Text>
          </View>
          <Text style={styles.bannerTitle}>
            {acpProviders.length === 0
              ? "Add your first ACP agent"
              : allTestedOk
                ? "Ready"
                : "Test your providers"}
          </Text>
          <Text style={styles.body}>
            {acpProviders.length === 0
              ? "Pick a known agent below or add a custom command. Each entry becomes an agents.providers entry with extends: \"acp\"."
              : `${acpProviders.length} provider${acpProviders.length === 1 ? "" : "s"} configured, ${enabledCount} enabled. Add another or run Test to confirm it starts.`}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Pressable accessibilityRole="button" onPress={openAdd} style={styles.btn}>
              <Text style={styles.btnText}>Add custom provider</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={refresh} style={styles.pillBtn}>
              <Text style={styles.pillBtnText}>Refresh</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void onReloadPaseo();
              }}
              style={styles.pillBtn}
            >
              <Text style={styles.pillBtnText}>Reload Paseo</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setTab("providers")}
            style={[styles.tab, tab === "providers" ? styles.tabActive : null]}
          >
            <Text style={[styles.tabText, tab === "providers" ? styles.tabTextActive : null]}>
              Providers ({acpProviders.length})
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setTab("catalog")}
            style={[styles.tab, tab === "catalog" ? styles.tabActive : null]}
          >
            <Text style={[styles.tabText, tab === "catalog" ? styles.tabTextActive : null]}>
              Quick add
            </Text>
          </Pressable>
        </View>

        {tab === "providers" ? (
          <>
            {acpProviders.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.muted}>
                  No ACP providers configured yet. Use Quick add or add a custom command below.
                </Text>
              </View>
            ) : null}
            {acpProviders.map((p) => {
              const entry = p.entry as Record<string, unknown>;
              const enabled = entry["enabled"] !== false;
              const result = testOut[p.id];
              const command = Array.isArray(entry["command"])
                ? (entry["command"] as string[])
                : [];
              return (
                <View key={p.id} style={styles.card}>
                  <View style={styles.headerRow}>
                    <View style={styles.statusRow}>
                      <View
                        style={dot(
                          !enabled
                            ? theme.colors.foregroundMuted
                            : result === undefined
                              ? theme.colors.foregroundMuted
                              : result.ok
                                ? theme.colors.statusSuccess
                                : theme.colors.statusDanger,
                        )}
                      />
                      <Text style={styles.body}>{String(entry["label"] ?? p.id)}</Text>
                      <Text style={styles.muted}>({p.id})</Text>
                    </View>
                    <Text style={styles.muted}>{enabled ? "enabled" : "disabled"}</Text>
                  </View>
                  {entry["description"] ? (
                    <Text style={styles.muted}>{String(entry["description"])}</Text>
                  ) : null}
                  {command.length ? <Text style={styles.mono}>{command.join(" ")}</Text> : null}
                  {result ? (
                    <Text style={result.ok ? styles.ok : styles.danger}>{result.text}</Text>
                  ) : null}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        void onTest(p.id, entry);
                      }}
                      style={styles.pillBtn}
                    >
                      <Text style={styles.pillBtnText}>Test</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        startEdit(p.id, entry);
                      }}
                      style={styles.pillBtn}
                    >
                      <Text style={styles.pillBtnText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        void onToggleEnabled(p.id, entry);
                      }}
                      style={styles.pillBtn}
                    >
                      <Text style={styles.pillBtnText}>{enabled ? "Disable" : "Enable"}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        if (confirmDelete === p.id) void onRemove(p.id);
                        else setConfirmDelete(p.id);
                      }}
                      style={[styles.pillBtn, { marginLeft: "auto" as const }]}
                    >
                      <Text style={styles.danger}>
                        {confirmDelete === p.id ? "Confirm delete?" : "Delete"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void catalogQ.refetch();
                }}
                style={styles.pillBtn}
              >
                <Text style={styles.pillBtnText}>
                  {catalogQ.isFetching ? "Refreshing…" : "Refresh"}
                </Text>
              </Pressable>
              <TextInput
                style={[styles.input, { flexGrow: 1, minWidth: 140 }]}
                value={search}
                onChangeText={setSearch}
                placeholderTextColor={theme.colors.foregroundMuted}
                placeholder="Search agents…"
              />
            </View>
            <Text style={styles.muted}>
              From the ACP agent registry
              {catalogQ.data ? ` · ${catalogEntries.length}/${catalogQ.data.entries.length}` : ""}
            </Text>
            {catalogQ.isLoading ? (
              <Text style={styles.muted}>Loading agent registry…</Text>
            ) : catalogQ.error ? (
              <Text style={styles.danger}>
                Failed to load registry: {(catalogQ.error as Error).message}
              </Text>
            ) : (
              <View style={styles.catalogRow}>
                {catalogEntries.map((c) => {
                  const added = acpProviders.some((p) => p.id === c.id);
                  const disabled = added || !c.command;
                  return (
                    <View key={c.id} style={styles.catalogCard}>
                      <Text style={styles.body} numberOfLines={1}>
                        {c.label}
                      </Text>
                      <Text style={styles.catalogDescription} numberOfLines={3}>
                        {c.description}
                      </Text>
                      {c.command ? (
                        <Text style={styles.mono} numberOfLines={1}>
                          {c.command.join(" ")}
                        </Text>
                      ) : (
                        <Text style={styles.muted} numberOfLines={1}>
                          No npx/uvx package — install manually
                        </Text>
                      )}
                      {c.env && Object.keys(c.env).length > 0 ? (
                        <Text style={styles.warn} numberOfLines={2}>
                          Needs {Object.keys(c.env).join(", ")} — set before saving
                        </Text>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        disabled={disabled}
                        onPress={() => {
                          quickAdd(c);
                        }}
                        style={[styles.pillBtn, disabled ? { opacity: 0.5 } : null]}
                      >
                        <Text style={styles.pillBtnText}>{added ? "Added" : "Add"}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

      </View>

      <Modal
        visible={showForm}
        animationType="slide"
        transparent
        onRequestClose={resetForm}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.headerRow}>
              <Text style={styles.sectionTitle}>{editing ? `Edit ${editing}` : "Add provider"}</Text>
              <Pressable accessibilityRole="button" onPress={resetForm}>
                <Text style={styles.muted}>Cancel</Text>
              </Pressable>
            </View>
            <ScrollView>
              {(["id", "label", "description", "command", "env"] as const).map((f) => (
                <View key={f} style={{ gap: 4, marginBottom: 12 }}>
                  <Text style={styles.muted}>
                    {f === "command"
                      ? "command (space-separated, e.g. gemini --acp)"
                      : f === "env"
                        ? "env (KEY=value lines)"
                        : f}
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={form[f]}
                    onChangeText={(t) => {
                      setForm((s) => ({ ...s, [f]: t }));
                    }}
                    placeholderTextColor={theme.colors.foregroundMuted}
                    placeholder={f}
                    multiline={f === "env"}
                    editable={f !== "id" || editing === null}
                  />
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setForm((s) => ({ ...s, enabled: !s.enabled }));
                }}
              >
                <Text style={styles.body}>
                  enabled: {form.enabled ? "yes" : "no"} (tap to toggle)
                </Text>
              </Pressable>
              <View style={{ gap: 4, marginTop: 12 }}>
                <Text style={styles.muted}>
                  advanced JSON (optional: params, models, additionalModels, disallowedTools, order)
                </Text>
                <TextInput
                  style={styles.input}
                  value={advanced}
                  onChangeText={(t) => {
                    setAdvanced(t);
                    setAdvancedErr(null);
                  }}
                  placeholderTextColor={theme.colors.foregroundMuted}
                  placeholder='{"models": [{"id": "model-id", "label": "Model"}]}'
                  multiline
                />
                {advancedErr ? <Text style={styles.danger}>{advancedErr}</Text> : null}
              </View>
              {draftTest ? (
                <Text style={draftTest.ok ? styles.ok : styles.danger}>{draftTest.text}</Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void onTestDraft();
                  }}
                  style={[styles.pillBtn, { flexGrow: 1 }]}
                >
                  <Text style={styles.pillBtnText}>
                    {draftTesting ? "Testing…" : "Test before saving"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setAutoReload((v) => !v);
                  }}
                >
                  <Text style={styles.body}>auto-reload: {autoReload ? "on" : "off"}</Text>
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void onSave();
                }}
                style={[styles.btn, { marginTop: 12 }]}
              >
                <Text style={styles.btnText}>{editing ? "Save edits" : "Add provider"}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
