import { createServer as createHttpServer, request, type Server } from "node:http";
import { connect, createServer, type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { type ProxyEvent, type RunningProxy, startProxy } from "../../src/net/proxy.js";

let echoPort: number;
let httpPort: number;
const servers: { close(): void }[] = [];

beforeAll(async () => {
  const echo = createServer((s) => s.pipe(s));
  const web: Server = createHttpServer((_req, res) => res.end("hello from upstream"));
  echoPort = await listen(echo);
  httpPort = await listen(web);
  servers.push(echo, web);
});
afterAll(() => servers.forEach((s) => s.close()));

let proxy: RunningProxy | undefined;
afterEach(async () => {
  await proxy?.close();
  proxy = undefined;
});

const TOKEN = "test-token";
const auth = `Basic ${Buffer.from(`oh-really:${TOKEN}`).toString("base64")}`;

function listen(server: {
  listen(port: number, host: string, cb: () => void): unknown;
  address(): unknown;
}) {
  return new Promise<number>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)),
  );
}

/** Send a raw CONNECT and return the status line plus the socket for further use. */
function rawConnect(
  target: string,
  headers: string,
  endpoint: { port: number } | { path: string },
) {
  return new Promise<{ status: string; socket: Socket }>((resolve, reject) => {
    const socket =
      "path" in endpoint ? connect(endpoint.path) : connect(endpoint.port, "127.0.0.1");
    socket.once("error", reject);
    socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${headers}\r\n`);
    socket.once("data", (chunk) =>
      resolve({ status: chunk.toString().split("\r\n")[0] ?? "", socket }),
    );
  });
}

async function start(allow: string[], events?: ProxyEvent[], listenOn?: { path: string }) {
  proxy = await startProxy({
    allow,
    token: TOKEN,
    listen: listenOn ?? { port: 0 },
    onEvent: (e) => events?.push(e),
  });
  return proxy;
}

describe("startProxy", () => {
  it("tunnels CONNECT to an allowed host", async () => {
    const p = await start([`127.0.0.1:${echoPort}`]);
    const { status, socket } = await rawConnect(
      `127.0.0.1:${echoPort}`,
      `Proxy-Authorization: ${auth}\r\n`,
      p.endpoint,
    );
    expect(status).toBe("HTTP/1.1 200 Connection Established");
    const echoed = new Promise<string>((r) => socket.once("data", (d) => r(d.toString())));
    socket.write("ping");
    expect(await echoed).toBe("ping");
    socket.destroy();
  });

  it("refuses CONNECT to a host that is not allowed, and reports it", async () => {
    const events: ProxyEvent[] = [];
    const p = await start(["api.anthropic.com"], events);
    const { status, socket } = await rawConnect(
      "telemetry.example.com:443",
      `Proxy-Authorization: ${auth}\r\n`,
      p.endpoint,
    );
    socket.destroy();
    expect(status).toBe("HTTP/1.1 403 Forbidden");
    expect(events).toEqual([{ host: "telemetry.example.com", port: 443, allowed: false }]);
  });

  it("requires the per-run token", async () => {
    const p = await start([`127.0.0.1:${echoPort}`]);
    const { status, socket } = await rawConnect(`127.0.0.1:${echoPort}`, "", p.endpoint);
    socket.destroy();
    expect(status).toBe("HTTP/1.1 407 Proxy Authentication Required");
  });

  it("answers 502 when the allowed host cannot be reached", async () => {
    const closed = createServer();
    const deadPort = await listen(closed);
    closed.close();
    const p = await start([`127.0.0.1:${deadPort}`]);
    const { status, socket } = await rawConnect(
      `127.0.0.1:${deadPort}`,
      `Proxy-Authorization: ${auth}\r\n`,
      p.endpoint,
    );
    socket.destroy();
    expect(status).toBe("HTTP/1.1 502 Bad Gateway");
  });

  it("forwards plain HTTP requests to allowed hosts and refuses others", async () => {
    const p = await start([`127.0.0.1:${httpPort}`]);
    const get = (url: string) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request(
          {
            host: "127.0.0.1",
            port: (p.endpoint as { port: number }).port,
            path: url,
            headers: { "proxy-authorization": auth },
          },
          (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
          },
        );
        req.on("error", reject);
        req.end();
      });
    expect(await get(`http://127.0.0.1:${httpPort}/`)).toEqual({
      status: 200,
      body: "hello from upstream",
    });
    expect((await get("http://blocked.example.com/")).status).toBe(403);
  });

  it("can listen on a local socket path instead of a port", async () => {
    const path =
      process.platform === "win32"
        ? `\\\\.\\pipe\\oh-really-test-${process.pid}-${Date.now()}`
        : join(tmpdir(), `ohr-${process.pid}-${Date.now()}.sock`);
    const p = await start([`127.0.0.1:${echoPort}`], undefined, { path });
    expect(p.endpoint).toEqual({ path });
    const { status, socket } = await rawConnect(
      `127.0.0.1:${echoPort}`,
      `Proxy-Authorization: ${auth}\r\n`,
      p.endpoint,
    );
    socket.destroy();
    expect(status).toBe("HTTP/1.1 200 Connection Established");
  });

  it("builds a proxy URL that carries the token", async () => {
    const p = await start([]);
    expect(p.url).toBe(
      `http://oh-really:${TOKEN}@127.0.0.1:${(p.endpoint as { port: number }).port}`,
    );
  });
});
