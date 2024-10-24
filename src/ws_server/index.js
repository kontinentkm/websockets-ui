//src\ws_server\index.js
import WebSocket from "ws";

const wss = new WebSocket.Server({ noServer: true });

// Модель данных для игроков и комнат (хранение в памяти)
const players = new Map(); // { name: { password, id, wins } }
const rooms = new Map(); // { roomId: { players: [], gameData: {} } }

// Обработка подключения нового клиента
wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      handleCommand(ws, parsedMessage);
    } catch (error) {
      ws.send(JSON.stringify({ error: "Invalid message format" }));
    }
  });

  ws.send(JSON.stringify({ message: "Connected to WebSocket server" }));
});

const handleCommand = (ws, { type, data, id }) => {
  switch (type) {
    case "reg":
      registerPlayer(ws, data, id);
      break;
    case "create_room":
      createRoom(ws, data, id);
      break;
    case "add_user_to_room":
      addUserToRoom(ws, data, id);
      break;
    case "add_ships":
      addShips(ws, data, id);
      break;
    case "attack":
      handleAttack(ws, data, id);
      break;
    // Дополнительные команды можно добавить здесь
    default:
      ws.send(JSON.stringify({ error: "Unknown command type", id }));
  }
};

const registerPlayer = (ws, { name, password }, id) => {
  if (players.has(name)) {
    const player = players.get(name);
    if (player.password === password) {
      ws.send(
        JSON.stringify({
          type: "reg",
          data: { name, index: player.id, error: false },
          id,
        })
      );
    } else {
      ws.send(
        JSON.stringify({
          type: "reg",
          data: { name, error: true, errorText: "Invalid password" },
          id,
        })
      );
    }
  } else {
    const playerId = players.size + 1;
    players.set(name, { password, id: playerId, wins: 0 });
    ws.send(
      JSON.stringify({
        type: "reg",
        data: { name, index: playerId, error: false },
        id,
      })
    );
  }
};

const createRoom = (ws, data, id) => {
  const roomId = rooms.size + 1;
  rooms.set(roomId, { players: [], gameData: {} });
  ws.send(
    JSON.stringify({
      type: "update_room",
      data: [{ roomId, roomUsers: [] }],
      id,
    })
  );
};

const addUserToRoom = (ws, { indexRoom }, id) => {
  const room = rooms.get(indexRoom);
  if (room && room.players.length < 2) {
    room.players.push(ws);
    if (room.players.length === 2) {
      const gameId = Math.random().toString(36).substring(2);
      const playerIds = room.players.map((_, idx) => idx + 1);
      room.gameData = { gameId, playerIds, ships: [] };
      room.players.forEach((playerWs, idx) => {
        playerWs.send(
          JSON.stringify({
            type: "create_game",
            data: { idGame: gameId, idPlayer: playerIds[idx] },
            id,
          })
        );
      });
    }
  } else {
    ws.send(JSON.stringify({ error: "Room is full or does not exist", id }));
  }
};

const addShips = (ws, { gameId, ships, indexPlayer }, id) => {
  const room = [...rooms.values()].find(
    (room) => room.gameData.gameId === gameId
  );
  if (room) {
    room.gameData.ships.push({ player: indexPlayer, ships });
    if (room.gameData.ships.length === 2) {
      const currentPlayerIndex = room.gameData.playerIds[0];
      room.players.forEach((playerWs) => {
        playerWs.send(
          JSON.stringify({
            type: "start_game",
            data: { ships, currentPlayerIndex },
            id,
          })
        );
      });
    }
  }
};

const handleAttack = (ws, { gameId, x, y, indexPlayer }, id) => {
  // Логика обработки атаки и обновления игрового состояния
};

export { wss };
