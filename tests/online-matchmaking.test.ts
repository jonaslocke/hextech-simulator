import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OnlineRoomError,
  OnlineRoomRegistry,
  OnlineRoomService,
} from "../src/server/online-matchmaking";

const PLAYER_1 = {
  deckId: "lux" as const,
  onlineSessionId: "session-1",
  socketId: "socket-1",
};
const PLAYER_2 = {
  deckId: "annie" as const,
  onlineSessionId: "session-2",
  socketId: "socket-2",
};

test("creates a shareable room and assigns independent seats", () => {
  const service = createService();
  const created = service.create(PLAYER_1);
  const joined = service.join({ ...PLAYER_2, code: created.code.toLowerCase() });

  assert.match(created.code, /^[A-Z2-9]{6}$/);
  assert.equal(joined.seat1.seat, "player1");
  assert.equal(joined.seat2?.seat, "player2");
  assert.equal(joined.seat1.deckId, "lux");
  assert.equal(joined.seat2?.deckId, "annie");
});

test("rejects additional players and joining a started room", () => {
  const service = createService();
  const created = service.create(PLAYER_1);
  service.join({ ...PLAYER_2, code: created.code });

  assert.throws(
    () =>
      service.join({
        code: created.code,
        deckId: "lux",
        onlineSessionId: "session-3",
        socketId: "socket-3",
      }),
    (error) => error instanceof OnlineRoomError && error.code === "room_full",
  );

  service.markGameCreated(created.code, "game-1");
  assert.throws(
    () =>
      service.join({
        code: created.code,
        deckId: "lux",
        onlineSessionId: "session-4",
        socketId: "socket-4",
      }),
    (error) =>
      error instanceof OnlineRoomError && error.code === "room_started",
  );
});

test("applies pre-game disconnect behavior without deleting the room", () => {
  const service = createService();
  const created = service.create(PLAYER_1);
  service.join({ ...PLAYER_2, code: created.code });

  const waiting = service.disconnect(PLAYER_2.socketId);
  assert.equal(waiting?.status, "waiting-for-opponent");
  assert.equal(waiting?.seat2, undefined);

  service.join({ ...PLAYER_2, code: created.code });
  const closed = service.disconnect(PLAYER_1.socketId);
  assert.equal(closed?.status, "closed");
});

test("retains a started room when either socket disconnects", () => {
  const service = createService();
  const created = service.create(PLAYER_1);
  service.join({ ...PLAYER_2, code: created.code });
  service.markGameCreated(created.code, "game-1");

  assert.equal(service.disconnect(PLAYER_1.socketId)?.status, "game-created");
  assert.equal(service.disconnect(PLAYER_2.socketId)?.gameId, "game-1");
});

function createService() {
  return new OnlineRoomService(new OnlineRoomRegistry());
}
