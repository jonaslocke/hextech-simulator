import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import {
  OnlineRoomRegistry,
  OnlineRoomService,
  registerOnlineMatchmakingHandlers,
} from "./src/server/online-matchmaking";

const dev = process.argv.includes("--dev");
const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

await app.prepare();

const httpServer = createServer(handler);

const socketCorsOrigin =
  process.env.SOCKET_CORS_ORIGIN ??
  (dev ? `http://localhost:${port}` : undefined);

const io = new Server(httpServer, {
  cors: socketCorsOrigin
    ? {
        origin: socketCorsOrigin,
      }
    : undefined,
});

const roomService = new OnlineRoomService(new OnlineRoomRegistry());
registerOnlineMatchmakingHandlers(io, roomService);

httpServer.listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port}`);
});
