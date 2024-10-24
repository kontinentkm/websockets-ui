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
  const room = [...rooms.values()].find(
    (room) => room.gameData.gameId === gameId
  );
  if (!room) {
    ws.send(JSON.stringify({ error: "Game not found", id }));
    return;
  }

  // Получаем данные игры и противника
  const enemyIndex = room.gameData.playerIds.find((pId) => pId !== indexPlayer);
  const enemyShips = room.gameData.ships.find(
    (s) => s.player === enemyIndex
  ).ships;

  // Проверяем попадание в корабли противника
  let hit = false;
  let killed = false;

  for (const ship of enemyShips) {
    for (let i = 0; i < ship.length; i++) {
      const shipPart = {
        x: ship.direction ? ship.position.x + i : ship.position.x,
        y: ship.direction ? ship.position.y : ship.position.y + i,
      };

      if (shipPart.x === x && shipPart.y === y) {
        hit = true;
        ship.hits = (ship.hits || 0) + 1;

        if (ship.hits === ship.length) {
          killed = true;
        }
        break;
      }
    }

    if (hit) break;
  }

  // Определяем статус атаки
  const status = killed ? "killed" : hit ? "shot" : "miss";

  // Обновляем текущего игрока
  const currentPlayer = hit && !killed ? indexPlayer : enemyIndex;

  // Отправляем результат атаки обоим игрокам
  room.players.forEach((playerWs) => {
    playerWs.send(
      JSON.stringify({
        type: "attack",
        data: {
          position: { x, y },
          currentPlayer,
          status,
        },
        id,
      })
    );
  });

  // Проверка на завершение игры
  if (killed && enemyShips.every((ship) => ship.hits === ship.length)) {
    room.players.forEach((playerWs) => {
      playerWs.send(
        JSON.stringify({
          type: "finish",
          data: { winPlayer: indexPlayer },
          id,
        })
      );
    });

    // Обновляем таблицу лидеров
    const winner = [...players.entries()].find(
      ([_, player]) => player.id === indexPlayer
    )[0];
    players.get(winner).wins += 1;

    // Отправляем обновленную таблицу лидеров всем игрокам
    broadcastWinners();
  } else {
    // Обновляем очередь
    room.players.forEach((playerWs) => {
      playerWs.send(
        JSON.stringify({
          type: "turn",
          data: { currentPlayer },
          id,
        })
      );
    });
  }
};

// Функция для отправки обновленной таблицы лидеров всем игрокам
const broadcastWinners = () => {
  const winners = [...players.values()]
    .sort((a, b) => b.wins - a.wins)
    .map(({ id, wins }) => ({ name: id, wins }));

  rooms.forEach((room) => {
    room.players.forEach((playerWs) => {
      playerWs.send(
        JSON.stringify({
          type: "update_winners",
          data: winners,
          id: 0,
        })
      );
    });
  });
};

export { wss };
