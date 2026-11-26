import { connect, createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startRelay } from "../../src/net/relay.js";

const socketPath = () =>
  process.platform === "win32"
    ? `\\\\.\\pipe\\oh-really-relay-${process.pid}-${Date.now()}`
    : join(tmpdir(), `ohr-relay-${process.pid}-${Date.now()}.sock`);

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));

describe("startRelay", () => {
  it("forwards a local TCP port to a socket path, both directions", async () => {
    const path = socketPath();
    const target = createServer((s) => s.on("data", (d) => s.write(`echo:${d}`)));
    await new Promise<void>((r) => target.listen(path, r));
    cleanup.push(() => target.close());

    const relay = await startRelay({ socketPath: path, port: 0 });
    cleanup.push(() => relay.close());
    const port = (relay.address() as AddressInfo).port;

    const reply = await new Promise<string>((resolve, reject) => {
      const s = connect(port, "127.0.0.1", () => s.write("hi"));
      s.once("data", (d) => {
        resolve(d.toString());
        s.destroy();
      });
      s.once("error", reject);
    });
    expect(reply).toBe("echo:hi");
  });

  it("only listens on the loopback interface", async () => {
    const relay = await startRelay({ socketPath: socketPath(), port: 0 });
    cleanup.push(() => relay.close());
    expect((relay.address() as AddressInfo).address).toBe("127.0.0.1");
  });
});
