import { connect, createServer, type Server } from "node:net";

export interface RelayOptions {
  /** Unix socket (or Windows named pipe) of the proxy outside the sandbox. */
  socketPath: string;
  /** Loopback port to listen on inside the sandbox; 0 picks one. */
  port: number;
}

/**
 * Runs inside the Linux sandbox, whose private network has no route out.
 * Programs connect to 127.0.0.1:<port> as their proxy; the relay passes the
 * bytes to the real proxy through the one socket mounted into the sandbox.
 */
export function startRelay({ socketPath, port }: RelayOptions): Promise<Server> {
  const server = createServer((client) => {
    const upstream = connect(socketPath);
    client.pipe(upstream).pipe(client);
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.once("error", close);
    upstream.once("error", close);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
