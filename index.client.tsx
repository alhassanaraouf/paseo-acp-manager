import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AcpManager } from "./client/AcpManager";

export default function contribute(client: PluginClientContext) {
  client.addSurface("main", AcpManager);
  client.addSidebarItem({
    id: "main",
    title: "ACP Manager",
    icon: "Plug",
    surface: "main",
  });
  return () => {};
}
