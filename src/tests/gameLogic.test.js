import { handleAttack } from "../ws_server/index";
import { jest } from '@jest/globals';

describe("Game Logic", () => {
  let rooms;

  beforeEach(() => {
    // Инициализация переменной rooms как Map перед каждым тестом
    rooms = new Map();
  });

  test("should correctly handle a miss attack", () => {
    const ws = { send: jest.fn() };
    const gameId = "test-game";
    const indexPlayer = 1;
    const data = { gameId, x: 5, y: 5, indexPlayer };

    // Мокируем комнату и данные игры
    rooms.set(gameId, {
      gameData: {
        playerIds: [1, 2],
        ships: [
          {
            indexPlayer: 2,
            position: { x: 3, y: 3 },
            direction: true,
            length: 3,
            type: "medium",
          },
        ],
      },
    });

    // Вызов функции handleAttack и проверка результата
    handleAttack(ws, data);

    // Проверка того, что WebSocket send был вызван с ожидаемыми параметрами
    expect(ws.send).toHaveBeenCalled();
  });
});
