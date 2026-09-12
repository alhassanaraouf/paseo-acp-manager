// Reads one JSON-RPC line on stdin, answers initialize with the same id.
import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.method === "initialize") {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id ?? 1,
          result: { protocolVersion: 1, agentCapabilities: {} },
        }) + "\n",
      );
    }
  } catch {
    /* ignore malformed lines */
  }
});
