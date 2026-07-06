import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import {
  OnlineRoomRegistry,
  OnlineRoomService,
  registerOnlineMatchmakingHandlers,
} from "./src/server/online-matchmaking";

const dev = process.argv.includes("--dev");
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

await app.prepare();

const httpServer = createServer(handler);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN ?? `http://localhost:${port}`,
  },
});

const roomService = new OnlineRoomService(new OnlineRoomRegistry());
registerOnlineMatchmakingHandlers(io, roomService);

httpServer.listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port}`);
});
