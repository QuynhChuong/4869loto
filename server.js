
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // lưu thông tin phòng

// Tạo hàm random 1 vé loto 5x5 (25 số từ 1-75)
function generateTicket() {
  let nums = Array.from({ length: 75 }, (_, i) => i + 1);
  nums.sort(() => Math.random() - 0.5);
  return nums.slice(0, 25);
}

// Kiểm tra vé Bingo - đủ 1 hàng hoặc cột được đánh dấu
function checkBingo(marked) {
  for (let i = 0; i < 5; i++) {
    let row = true;
    for (let j = 0; j < 5; j++) {
      if (!marked[i * 5 + j]) row = false;
    }
    if (row) return true;
  }
  for (let j = 0; j < 5; j++) {
    let col = true;
    for (let i = 0; i < 5; i++) {
      if (!marked[i * 5 + j]) col = false;
    }
    if (col) return true;
  }
  return false;
}

io.on('connection', (socket) => {
  console.log('Người chơi kết nối:', socket.id);

  socket.on('joinRoom', ({ room, name, mode }) => {
    socket.join(room);
    if (!rooms[room]) {
      rooms[room] = {
        players: {},
        gameStarted: false,
        numbersCalled: [],
        callInterval: null,
      };
    }

    rooms[room].players[socket.id] = {
      name,
      mode,
      ready: false,
      ticket: generateTicket(),
      marked: new Array(25).fill(false),
      alive: true,
    };

    // Kick nếu chưa sẵn sàng sau 1 phút
    setTimeout(() => {
      const player = rooms[room]?.players[socket.id];
      if (player && !player.ready) {
        delete rooms[room].players[socket.id];
        socket.leave(room);
        socket.emit('kick', 'Bạn đã bị loại do không sẵn sàng sau 1 phút');

        io.to(room).emit('roomInfo', {
          count: Object.keys(rooms[room].players).length,
          mode,
          players: Object.values(rooms[room].players).map(p =>
            `${p.name} (${p.ready ? 'Đã sẵn sàng' : 'Chưa sẵn sàng'})`
          ),
        });

        if (Object.keys(rooms[room].players).length === 0) {
          clearInterval(rooms[room].callInterval);
          delete rooms[room];
        }
      }
    }, 60000);

    io.to(room).emit('roomInfo', {
      count: Object.keys(rooms[room].players).length,
      mode,
      players: Object.values(rooms[room].players).map(p =>
        `${p.name} (${p.ready ? 'Đã sẵn sàng' : 'Chưa sẵn sàng'})`
      ),
    });

    socket.emit('ticket', rooms[room].players[socket.id].ticket);
    socket.emit('gameStatus', rooms[room].gameStarted ? 'started' : 'waiting');
  });

  socket.on('changeTicket', (room) => {
    const roomData = rooms[room];
    if (!roomData) return;
    if (roomData.gameStarted) return;

    const player = roomData.players[socket.id];
    if (player) {
      player.ticket = generateTicket();
      player.marked = new Array(25).fill(false);
      socket.emit('ticket', player.ticket);
    }
  });

  socket.on('ready', (room) => {
    const roomData = rooms[room];
    if (!roomData) return;

    const player = roomData.players[socket.id];
    if (!player) return;

    player.ready = true;

    let allReady = Object.values(roomData.players).every(p => p.ready);

    io.to(room).emit('roomInfo', {
      count: Object.keys(roomData.players).length,
      mode: player.mode,
      players: Object.values(roomData.players).map(p =>
        `${p.name} (${p.ready ? 'Đã sẵn sàng' : 'Chưa sẵn sàng'})`
      ),
    });

    if (allReady && !roomData.gameStarted) {
      roomData.gameStarted = true;
      roomData.numbersCalled = [];

      io.to(room).emit('startGame');

      roomData.callInterval = setInterval(() => {
        let availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1)
          .filter(n => !roomData.numbersCalled.includes(n));

        if (availableNumbers.length === 0) {
          clearInterval(roomData.callInterval);
          io.to(room).emit('gameEnd', 'Hết số, không có người thắng');
          roomData.gameStarted = false;
          return;
        }

        const nextNumber = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
        roomData.numbersCalled.push(nextNumber);
        io.to(room).emit('numberCalled', nextNumber);
      }, 5000);
    }
  });

  socket.on('markNumber', ({ room, number }) => {
    const roomData = rooms[room];
    if (!roomData) return;

    const player = roomData.players[socket.id];
    if (!player || !player.alive) return;

    const index = player.ticket.indexOf(number);
    if (index !== -1) {
      player.marked[index] = true;
    }
  });

  socket.on('bingo', (room) => {
    const roomData = rooms[room];
    if (!roomData) return;

    const player = roomData.players[socket.id];
    if (!player || !player.alive) return;

    if (checkBingo(player.marked)) {
      io.to(room).emit('winner', `${player.name} đã thắng!`);
      clearInterval(roomData.callInterval);
      roomData.gameStarted = false;
    } else {
      player.alive = false;
      socket.emit('invalidBingo', 'Vé của bạn không hợp lệ, bạn đã bị loại khỏi ván này');
    }
  });

  socket.on('continueGame', (room) => {
    const roomData = rooms[room];
    if (!roomData) return;
    if (roomData.gameStarted) return;

    Object.values(roomData.players).forEach(p => {
      p.ready = false;
      p.marked = new Array(25).fill(false);
      p.alive = true;
    });
    io.to(room).emit('gameStatus', 'waiting');
  });

  socket.on('leaveRoom', (room) => {
    if (!rooms[room]) return;

    delete rooms[room].players[socket.id];
    socket.leave(room);

    io.to(room).emit('roomInfo', {
      count: Object.keys(rooms[room].players).length,
      players: Object.values(rooms[room].players).map(p =>
        `${p.name} (${p.ready ? 'Đã sẵn sàng' : 'Chưa sẵn sàng'})`
      ),
    });

    if (Object.keys(rooms[room].players).length === 0) {
      clearInterval(rooms[room].callInterval);
      delete rooms[room];
    }
  });

  socket.on('disconnect', () => {
    for (const room in rooms) {
      if (rooms[room].players[socket.id]) {
        delete rooms[room].players[socket.id];
        io.to(room).emit('roomInfo', {
          count: Object.keys(rooms[room].players).length,
          players: Object.values(rooms[room].players).map(p =>
            `${p.name} (${p.ready ? 'Đã sẵn sàng' : 'Chưa sẵn sàng'})`
          ),
        });
        if (Object.keys(rooms[room].players).length === 0) {
          clearInterval(rooms[room].callInterval);
          delete rooms[room];
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
