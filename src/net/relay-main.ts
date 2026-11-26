/**
 * Entry point used inside the Linux sandbox:
 *   node relay-main.js <proxy-socket> <port> -- <command> [args...]
 * Starts the relay, runs the command, and exits with its exit code.
 */
import { spawnInherit } from "../run/spawn.js";
import { startRelay } from "./relay.js";

const [socketPath, port, separator, command, ...args] = process.argv.slice(2);
if (!socketPath || !port || separator !== "--" || !command) {
  process.stderr.write("usage: relay-main <proxy-socket> <port> -- <command> [args...]\n");
  process.exit(2);
}

const relay = await startRelay({ socketPath, port: Number(port) });
const code = await spawnInherit(command, args, { cwd: process.cwd(), env: process.env });
relay.close();
process.exit(code);
