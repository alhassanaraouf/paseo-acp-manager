import type { PluginServerContext } from "@getpaseo/plugin/server";
import { acpCatalog, acpList, acpReload, acpRemove, acpSave, acpTest } from "./shared/acp";
import {
  listCatalog,
  listProviders,
  reloadDaemon,
  removeProvider,
  saveProvider,
  testProvider,
} from "./server/acp";

export default function contribute(server: PluginServerContext) {
  server.handle(acpList, () => listProviders());
  server.handle(acpSave, (input) => saveProvider(input));
  server.handle(acpRemove, (input) => removeProvider(input));
  server.handle(acpTest, (input) => testProvider(input));
  server.handle(acpCatalog, () => listCatalog());
  server.handle(acpReload, () => reloadDaemon());
  return () => {};
}
