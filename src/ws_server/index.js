//src\ws_server\index.js
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 3000 });

// Модель данных для игроков и комнат (хранение в памяти)
const players = new Map(); // { name: { password, id, wins } }
const rooms = new Map(); // { roomId: { players: [], gameData: {} } }

// Обработка подключения нового клиента
wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.send(
    JSON.stringify({
      type: "connection",
      data: { message: "Connected to WebSocket server" },
    })
  );

  ws.on("message", (message) => {
    // console.log("Received message:", message.toString());
    try {
      const parsedMessage = JSON.parse(message);
      // console.log("Parsed message:", parsedMessage);
      handleCommand(ws, parsedMessage);
    } catch (error) {
      ws.send(JSON.stringify({ error: "Invalid message format" }));
    }
  });

  // Перемещаем этот блок внутрь обработчика подключения
  ws.onmessage = (event) => {
    const response = JSON.parse(event.data);

    if (response.type === "create_game") {
      const { idGame, idPlayer } = JSON.parse(response.data);
      currentGameId = idGame; // Сохраняем ID игры

      // Пример отправки данных о кораблях
      sendShipsToServer(currentGameId, playerShipsArray, idPlayer);
    }
  };
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
    case "single_play": // Добавление команды для одиночной игры
      createSinglePlayBot(ws, data, id);
      break;
    default:
      ws.send(JSON.stringify({ error: "Unknown command type", id }));
  }
};

const registerPlayer = (ws, data, id) => {
  let parsedData;

  // Попытка парсинга данных, если они передаются в виде строки
  try {
    parsedData = typeof data === "string" ? JSON.parse(data) : data;
  } catch (error) {
    console.error("Error parsing nested data:", error);
    // Отправляем сообщение об ошибке в случае неудачного парсинга
    ws.send(
      JSON.stringify({
        type: "reg",
        data: JSON.stringify({
          name: undefined,
          error: true,
          errorText: "Invalid data format",
        }),
        id,
      })
    );
    return;
  }

  const { name, password } = parsedData; // Деструктурируем данные
  console.log("Registering player with data:", { name, password, id }); // Логирование данных для проверки

  let response;

  if (players.has(name)) {
    // Проверяем, существует ли игрок
    const player = players.get(name);

    if (player.password === password) {
      // Если игрок уже существует и пароль совпадает
      response = {
        type: "reg",
        data: JSON.stringify({ name, index: player.id, error: false }), // Здесь добавлено JSON.stringify для поля data
        id,
      };
    } else {
      // Если пароль неверный
      response = {
        type: "reg",
        data: JSON.stringify({
          name,
          error: true,
          errorText: "Invalid password",
        }), // Здесь добавлено JSON.stringify для поля data
        id,
      };
    }
  } else {
    // Создаем нового игрока
    const playerId = players.size + 1;
    players.set(name, { password, id: playerId, wins: 0 });
    response = {
      type: "reg",
      data: JSON.stringify({ name, index: playerId, error: false }), // Здесь добавлено JSON.stringify для поля data
      id,
    };
  }

  // console.log("Sending response:", response);
  ws.send(JSON.stringify(response)); // Отправляем JSON-ответ клиенту
};

// Функция для создания комнаты
const createRoom = (ws, data, id) => {
  const roomId = rooms.size + 1;
  rooms.set(roomId, { players: [], gameData: {} });
  ws.send(
    JSON.stringify({
      type: "update_room",
      data: JSON.stringify([{ roomId, roomUsers: [] }]), // Сериализуем массив в строку
      id,
    })
  );
};

const addUserToRoom = (ws, data, id) => {
  console.log("Type of received data:", typeof data);
  console.log("Received data in addUserToRoom:", data); // Логируем полученные данные

  // Преобразуем строку в объект, если это необходимо
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (e) {
      ws.send(
        JSON.stringify({ type: "error", error: "Invalid JSON format", id })
      );
      console.log("Failed to parse data as JSON:", data);
      return;
    }
  }

  // Проверяем, является ли data объектом и имеет ли он правильный формат
  if (!data || typeof data !== "object" || typeof data.indexRoom !== "number") {
    ws.send(
      JSON.stringify({ type: "error", error: "Invalid data format", id })
    );
    console.log("Invalid data format received:", data);
    return;
  }

  const room = rooms.get(data.indexRoom); // Используем indexRoom из data
  if (room && room.players.length < 2) {
    room.players.push(ws); // Добавляем игрока в комнату
    console.log(
      `Player added to room: ${data.indexRoom}. Current players: ${room.players.length}`
    );

    if (room.players.length === 2) {
      const gameId = Math.random().toString(36).substring(2);
      const playerIds = room.players.map((_, idx) => idx + 1);
      room.gameData = { gameId, playerIds, ships: [] };

      room.players.forEach((playerWs, idx) => {
        const message = JSON.stringify({
          type: "create_game", // <-- Убедитесь, что type есть
          data: JSON.stringify({ idGame: gameId, idPlayer: playerIds[idx] }),
          id,
        });
        playerWs.send(message);
      });
    }
  } else {
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Room is full or does not exist",
        id,
      })
    );
    console.log(
      `Failed to add player: Room is full or does not exist. Room ID: ${data.indexRoom}`
    );
  }
};

// Пример обработки сообщения от клиента
const onMessage = (ws, message) => {
  let parsedMessage;

  try {
    parsedMessage = JSON.parse(message);
  } catch (e) {
    console.error("Failed to parse message:", message);
    return;
  }

  const { type, data, id } = parsedMessage;
  console.log("Parsed message:", parsedMessage); // Логируем разобранное сообщение

  if (data && typeof data === "object" && typeof data.indexRoom === "number") {
    switch (type) {
      case "add_user_to_room":
        addUserToRoom(ws, data, id); // Вызываем функцию добавления пользователя в комнату
        break;
      // Другие действия
    }
  } else {
    ws.send(JSON.stringify({ error: "Invalid data format", id }));
    console.log("Invalid data format received:", data);
  }
};

// Создание игры с ботом
const createSinglePlayBot = (ws, data, id) => {
  const roomId = Math.random().toString(36).substring(2); // Создаем уникальный ID для комнаты
  const botWs = {}; // Объект, имитирующий подключение бота

  // Добавляем игрока и бота в новую комнату
  const room = {
    players: [ws, botWs],
    gameData: {
      gameId: roomId, // Присваиваем roomId как gameId
      playerIds: [1, 2],
      ships: [], // Здесь мы добавим генерацию кораблей для игрока и бота
      currentPlayerIndex: 1, // Игрок начинает игру первым
    },
    bot: true, // Флаг, показывающий, что в комнате есть бот
  };

  rooms.set(roomId, room); // Сохраняем комнату с ботом

  // Генерация кораблей для бота (например, можно добавить случайные координаты)
  const botShips = generateBotShips();

  // Добавляем корабли для бота
  room.gameData.ships.push({ player: 2, ships: botShips });

  // Отправляем сообщение игроку о начале игры
  ws.send(
    JSON.stringify({
      type: "create_game",
      data: JSON.stringify({
        idGame: roomId, // Отправляем созданный roomId в качестве idGame
        idPlayer: 1, // Индекс игрока
      }),
      id,
    })
  );
};

// Генерация случайных кораблей для бота
const generateBotShips = () => {
  // Пример генерации 5 кораблей, добавьте свою логику
  return [
    { position: { x: 0, y: 0 }, length: 3, direction: true },
    { position: { x: 2, y: 2 }, length: 2, direction: false },
    { position: { x: 4, y: 4 }, length: 1, direction: true },
    { position: { x: 6, y: 6 }, length: 4, direction: false },
    { position: { x: 8, y: 8 }, length: 1, direction: true },
  ];
};

// Функция отправки кораблей
const sendShipsToServer = (gameId, ships, playerIndex) => {
  ws.send(
    JSON.stringify({
      type: "add_ships",
      data: {
        gameId: gameId, // Передаем сохраненный `currentGameId`
        ships: ships, // Массив с данными о кораблях
        indexPlayer: playerIndex, // Индекс игрока (например, 1 для игрока)
      },
      id: 0, // Здесь может быть уникальный идентификатор сообщения, если требуется
    })
  );
};

const addShips = (ws, { gameId, ships, indexPlayer }, id) => {
  const room = [...rooms.values()].find(
    (room) => room.gameData.gameId === gameId
  );

  if (room) {
    console.log(`Adding ships for player ${indexPlayer} in game ${gameId}`);
    room.gameData.ships.push({ player: indexPlayer, ships });

    // Логирование состояния после добавления кораблей
    console.log("Current ships in gameData:", room.gameData.ships);

    // Проверка, что оба игрока добавили свои корабли и их количество корректно
    if (
      room.gameData.ships.length === 2 &&
      room.gameData.ships.every((s) => s.ships.length === 5)
    ) {
      console.log("Both players have added their ships. Starting game...");
      const currentPlayerIndex = room.gameData.playerIds[0]; // Первый игрок начинает игру
      room.gameData.currentPlayerIndex = currentPlayerIndex; // Сохраняем текущего игрока

      room.players.forEach((playerWs) => {
        const message = JSON.stringify({
          type: "start_game",
          data: {
            ships: room.gameData.ships, // Отправляем информацию обо всех кораблях
            currentPlayerIndex,
          },
          id,
        });
        console.log("Sending start_game message:", message);
        playerWs.send(message);
      });
    } else {
      console.log("Not all players have added their ships correctly.");
    }
  } else {
    console.log(`Room not found for gameId ${gameId}`);
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
export { handleAttack };
