import { httpServer } from "./src/http_server/index.js";
import { wss } from "./src/ws_server/index.js";

const HTTP_PORT = 8181;

httpServer.listen(HTTP_PORT);

console.log(`Start static http server on the ${HTTP_PORT} port!`);

// Обработка апгрейдов для WebSocket
httpServer.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});
