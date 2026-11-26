import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, request, type ServerResponse } from "node:http";
import { type AddressInfo, connect, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { isAllowed } from "./allowlist.js";

export interface ProxyEvent {
  host: string;
  port: number;
  allowed: boolean;
}

export type ProxyListen = { port: number } | { path: string };

export interface ProxyOptions {
  /** Allowlist rules, see {@link isAllowed}. */
  allow: readonly string[];
  /** Shared secret the sandboxed program must present as proxy credentials. */
  token: string;
  listen: ProxyListen;
  onEvent?: (event: ProxyEvent) => void;
}

export interface RunningProxy {
  endpoint: ProxyListen;
  /** `http://oh-really:<token>@127.0.0.1:<port>`; undefined for socket-path endpoints. */
  url: string | undefined;
  close(): Promise<void>;
}

const USER = "oh-really";

/**
 * A small forward proxy that is the sandbox's only way out.
 *
 * It never decrypts traffic: HTTPS goes through CONNECT and is checked by
 * host name only. DNS is resolved here, on the host side, so the sandbox
 * needs no DNS of its own.
 */
export function startProxy(options: ProxyOptions): Promise<RunningProxy> {
  const expected = Buffer.from(
    `Basic ${Buffer.from(`${USER}:${options.token}`).toString("base64")}`,
  );
  const authorized = (req: IncomingMessage) => {
    const given = Buffer.from(req.headers["proxy-authorization"] ?? "");
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  const decide = (host: string, port: number) => {
    const allowed = isAllowed(host, port, options.allow);
    options.onEvent?.({ host, port, allowed });
    return allowed;
  };

  const open = new Set<Duplex>();
  const track = (s: Duplex) => {
    open.add(s);
    s.once("close", () => open.delete(s));
  };

  const server = createServer((req, res) => {
    if (!authorized(req)) return deny(res, 407);
    forwardHttp(req, res, decide);
  });
  server.on("connection", track);

  server.on("connect", (req: IncomingMessage, client: Duplex, head: Buffer) => {
    const reply = (status: string) => client.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    if (!authorized(req))
      return reply("407 Proxy Authentication Required\r\nProxy-Authenticate: Basic");
    const target = parseAuthority(req.url ?? "");
    if (!target) return reply("400 Bad Request");
    if (!decide(target.host, target.port)) return reply("403 Forbidden");

    const upstream: Socket = connect(target.port, target.host);
    track(upstream);
    let established = false;
    upstream.once("connect", () => {
      established = true;
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.once("error", () => (established ? client.destroy() : reply("502 Bad Gateway")));
    client.once("error", () => upstream.destroy());
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    const onListening = () => {
      const endpoint: ProxyListen =
        "path" in options.listen
          ? options.listen
          : { port: (server.address() as AddressInfo).port };
      resolve({
        endpoint,
        url:
          "port" in endpoint
            ? `http://${USER}:${options.token}@127.0.0.1:${endpoint.port}`
            : undefined,
        close: () =>
          new Promise<void>((done) => {
            for (const s of open) s.destroy();
            server.close(() => done());
          }),
      });
    };
    if ("path" in options.listen) server.listen(options.listen.path, onListening);
    else server.listen(options.listen.port, "127.0.0.1", onListening);
  });
}

function forwardHttp(
  req: IncomingMessage,
  res: ServerResponse,
  decide: (host: string, port: number) => boolean,
): void {
  let url: URL;
  try {
    url = new URL(req.url ?? "");
  } catch {
    return deny(res, 400);
  }
  if (url.protocol !== "http:") return deny(res, 400);
  const port = Number(url.port || 80);
  if (!decide(url.hostname, port)) return deny(res, 403);

  const headers = { ...req.headers };
  delete headers["proxy-authorization"];
  delete headers["proxy-connection"];
  const upstream = request(
    { host: url.hostname, port, method: req.method, path: url.pathname + url.search, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.once("error", () => deny(res, 502));
  req.pipe(upstream);
}

function deny(res: ServerResponse, status: number): void {
  if (res.headersSent) return void res.destroy();
  const headers: Record<string, string> = { connection: "close" };
  if (status === 407) headers["proxy-authenticate"] = "Basic";
  res.writeHead(status, headers).end();
}

/** "host:port" or "[v6]:port" -> parts, or undefined if malformed. */
function parseAuthority(authority: string): { host: string; port: number } | undefined {
  try {
    const url = new URL(`http://${authority}`);
    const port = Number(url.port);
    if (!url.hostname || !port) return undefined;
    return { host: url.hostname.replace(/^\[|\]$/g, ""), port };
  } catch {
    return undefined;
  }
}
