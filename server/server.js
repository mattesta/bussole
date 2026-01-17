import { WebSocketServer } from "ws";
import fs from "fs";
import { parse } from "csv-parse/sync";

// ====== LOAD CSV ======
const csv = fs.readFileSync("./cities.csv");
const cities = parse(csv, {
  columns: true,
  skip_empty_lines: true
});

// ====== SERVER ======
const wss = new WebSocketServer({ port: 8080 });
console.log("🟢 Server running on ws://localhost:8080");

// ====== GAME STATE ======
let room = {
  players: [],
  target: null,
  locked: new Map()
};

// ====== UTIL ======
function randomCity() {
  return cities[Math.floor(Math.random() * cities.length)];
}

// ====== CONNECTION ======
wss.on("connection", ws => {
  room.players.push(ws);

  console.log("👤 Player joined:", room.players.length);

  // START ROUND IF FIRST PLAYER
  if (!room.target) {
    room.target = randomCity();
    room.locked.clear();

    broadcast({
      type: "round-start",
      cityName: room.target.City,
      country: room.target.Country
    });

    console.log("🎯 Target:", room.target.City);
  }

  ws.on("message", msg => {
    const data = JSON.parse(msg);

    if (data.type === "lock-line") {
      room.locked.set(ws, data.bearing);

      console.log("🔒 Locked:", room.locked.size);

      if (room.locked.size === room.players.length) {
        endRound();
      }
    }
  });

  ws.on("close", () => {
    room.players = room.players.filter(p => p !== ws);
    room.locked.delete(ws);
  });
});

// ====== ROUND END ======
function endRound() {
  broadcast({
    type: "round-end",
    target: {
      city: room.target.City,
      lat: Number(room.target.Latitude),
      lon: Number(room.target.Longitude)
    }
  });

  room.target = null;
}

// ====== BROADCAST ======
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  room.players.forEach(p => p.send(msg));
}
