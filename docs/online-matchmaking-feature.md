# Online Matchmaking Feature

## Product Definition

The Online Matchmaking feature enables two independent players to
connect and start a shared online match using the existing
server-authoritative Riftbound game engine.

This feature is responsible exclusively for connecting players before a
game begins. It coordinates room creation, room joining, player-seat
assignment, and the handoff to the existing Match Service.

The feature does **not** implement or duplicate gameplay behavior. All
gameplay rules, legal actions, hidden information, state transitions,
persistence, and viewer projections remain owned by the existing game
engine.

## Scope

-   Online room creation.
-   Online room joining through a shareable room code.
-   Independent player sessions.
-   Deck selection from the existing match API.
-   Automatic game creation when two players are connected.
-   Navigation of both players into the same persisted game.

## Player Flow

``` text
GET /api/matches
    ↓
Select a deck
    ↓
Create Room or Join Room
    ↓
Create:
  - create temporary room
  - assign seat 1
  - display room code
  - wait for opponent

Join:
  - validate room
  - assign seat 2

    ↓
Call existing Match Service
    ↓
Persist game
    ↓
Associate room with gameId
    ↓
Emit gameCreated
    ↓
Navigate both clients
```

## Deck Selection

Online Matchmaking consumes the existing endpoint:

``` http
GET /api/matches
```

It renders every deck returned by the endpoint. The feature never
hardcodes supported decks. Mirror matches are supported.

## Responsibilities

### Owns

-   Deck selection UI
-   Create room
-   Join room
-   Room codes
-   Temporary rooms
-   Seat assignment
-   Temporary online session identity
-   Socket presence
-   Calling the existing Match Service
-   Routing players into the created game

### Does Not Own

-   Game rules
-   Match state
-   Turn logic
-   Focus/Priority
-   Hidden information
-   Legal actions
-   Viewer projections
-   Persistence
-   Replay
-   Reconnect

## Architecture

``` text
src/
  features/
    online-matchmaking/

  server/
    online-matchmaking/

  server/
    game/
```

`features/online-matchmaking` owns UI and socket client behavior.

`server/online-matchmaking` owns room registry, room service, socket
handlers and presence.

`server/game` remains responsible for gameplay and persistence.

## Technical Stack

-   Socket.IO
-   TypeScript
-   Zod
-   Existing Match Service
-   Existing Game Engine
-   Existing REST endpoints

Socket.IO is responsible for realtime coordination only.

HTTP continues to own game creation, projections and gameplay intents.

## Temporary Room

Rooms are temporary matchmaking objects.

-   Stored in memory only.
-   Not persisted.
-   Survive after game creation.
-   Maintain the association between connected players and the created
    game.

## Room Model

``` ts
type OnlineRoom = {
  code: string;
  status: "waiting-for-opponent" | "game-created" | "closed";
  seat1: OnlineRoomSeat;
  seat2?: OnlineRoomSeat;
  gameId?: string;
};

type OnlineRoomSeat = {
  seat: "player1" | "player2";
  deckId: string;
  onlineSessionId: string;
  socketId: string;
};
```

## Temporary Player Identity

Each player receives a randomly generated `onlineSessionId`.

It belongs exclusively to Online Matchmaking and establishes temporary
seat ownership.

It is not part of the game engine and will be replaced by an
authenticated player identifier when authentication is introduced.

## Socket Events

``` text
client:room:create
server:room:created

client:room:join
server:room:joined

server:room:stateChanged
server:room:gameCreated

client:room:leave
server:room:closed

server:player:disconnected
server:room:error
```

## Match Creation

When seat 2 is assigned:

1.  Call the existing Match Service.
2.  Persist the game.
3.  Store the returned gameId in the room.
4.  Emit `gameCreated`.
5.  Navigate both clients.

## Disconnect Behavior

Before game creation:

-   Player 1 disconnects: close the room.
-   Player 2 disconnects: release seat 2 and keep the room code valid.

After game creation:

Reconnect is outside the MVP.

## Error Handling

-   Invalid room code
-   Room not found
-   Room already full
-   Room already started
-   Connection lost
-   Deck not selected
-   Match creation failure

## Success Criteria

-   Decks are loaded from `/api/matches`.
-   Players select any supported deck.
-   Players create and join rooms.
-   Room codes are shareable.
-   Mirror matches are supported.
-   One persisted game is created through the existing Match Service.
-   Both players enter the same game.
-   Gameplay responsibilities remain inside the existing game engine.
