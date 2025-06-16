const socket = io();

const joinSection = document.getElementById('join-section');
const gameSection = document.getElementById('game-section');
const roomInfo = document.getElementById('room-info');
const board = document.getElementById('board');
const messages = document.getElementById('messages');

let currentRoom = null,
    currentTicket = [],
    marked = [],
    gameStarted = false,
    playerAlive = true,
    numbersCalled = [];

document.getElementById('joinBtn').onclick = () => {
  const name = document.getElementById('name').value.trim();
  const room = document.getElementById('room-select').value;
  const mode = document.getElementById('mode-select').value;

  if (!name) return alert('Nhập tên bạn trước!');

  currentRoom = room;
  socket.emit('joinRoom', { room, name, mode });

  joinSection.style.display = 'none';
  gameSection.style.display = 'block';
  messages.textContent = '';
};

socket.on('roomInfo', ({ count, mode, players }) => {
  roomInfo.textContent = `Phòng ${currentRoom}: ${count} người - Mode: ${mode}`;
  document.getElementById('player-names').innerHTML = players.map(p => `<li>${p}</li>`).join('');
});

socket.on('ticket', ticket => {
  currentTicket = ticket;
  marked = new Array(25).fill(false);
  renderBoard();
  messages.textContent = '';
});

document.getElementById('changeTicketBtn').onclick = () => {
  if (gameStarted) return messages.textContent = 'Game đã bắt đầu, không thể đổi vé.';
  socket.emit('changeTicket', currentRoom);
};

document.getElementById('readyBtn').onclick = () => {
  if (!currentTicket.length) return alert('Bạn chưa có vé!');
  socket.emit('ready', currentRoom);
  messages.textContent = 'Đã sẵn sàng, chờ người khác...';
};

socket.on('startGame', () => {
  gameStarted = true;
  playerAlive = true;
  messages.textContent = 'Game bắt đầu! Mỗi 5 giây có số mới!';
  document.getElementById('readyBtn').disabled = true;
  document.getElementById('changeTicketBtn').disabled = true;
  document.getElementById('bingoBtn').disabled = false;
  numbersCalled = [];
});

socket.on('numberCalled', number => {
  messages.textContent = `Số được gọi: ${number}`;
  numbersCalled.push(number);

  const calledNumbersDiv = document.getElementById('called-numbers');
  const ball = document.createElement('div');
  ball.className = 'number-ball new';
  ball.textContent = number;
  calledNumbersDiv.appendChild(ball);

  setTimeout(() => ball.classList.remove('new'), 500);
  calledNumbersDiv.scrollTop = calledNumbersDiv.scrollHeight;
});

socket.on('gameStatus', status => {
  if (status === 'waiting') {
    gameStarted = false;
    playerAlive = true;
    messages.textContent = 'Chờ người chơi sẵn sàng...';
    ['readyBtn', 'changeTicketBtn'].forEach(id => document.getElementById(id).disabled = false);
    document.getElementById('bingoBtn').disabled = true;
    document.getElementById('continueBtn').style.display = 'none';
    marked.fill(false);
    numbersCalled = [];
    renderBoard();
    countdownDiv.textContent = '';
    clearInterval(countdownInterval);
  }
});

socket.on('winner', msg => {
  messages.textContent = msg;
  document.getElementById('bingoBtn').disabled = true;
  document.getElementById('continueBtn').style.display = 'inline-block';
});

socket.on('invalidBingo', msg => {
  messages.textContent = msg;
  playerAlive = false;
  document.getElementById('bingoBtn').disabled = true;
});

socket.on('gameEnd', msg => {
  messages.textContent = msg;
  document.getElementById('bingoBtn').disabled = true;
  document.getElementById('continueBtn').style.display = 'inline-block';
});

document.getElementById('bingoBtn').onclick = () => {
  if (!playerAlive) return messages.textContent = 'Bạn đã bị loại khỏi ván này.';
  socket.emit('bingo', currentRoom);
};

document.getElementById('continueBtn').onclick = () => {
  socket.emit('continueGame', currentRoom);
  messages.textContent = 'Chờ mọi người sẵn sàng...';
  document.getElementById('continueBtn').style.display = 'none';
};

// ✅ RỜI PHÒNG VÀ LÀM MỚI TRANG
document.getElementById('leaveBtn').onclick = () => {
  if (currentRoom) socket.emit('leaveRoom', currentRoom);

  currentRoom = null;
  currentTicket = [];
  marked = [];
  numbersCalled = [];
  gameStarted = false;
  playerAlive = true;
  messages.textContent = '';
  roomInfo.textContent = '';

  location.reload(); // ✅ Làm mới trang
};

function renderBoard() {
  board.innerHTML = '';
  currentTicket.forEach((num, i) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.textContent = num;
    if (marked[i]) cell.classList.add('marked');
    cell.onclick = () => {
      if (!gameStarted || !playerAlive) return;
      if (!numbersCalled.includes(num)) {
        messages.textContent = `Số ${num} chưa được gọi, không thể đánh dấu.`;
        return;
      }
      marked[i] = !marked[i];
      renderBoard();
      socket.emit('markNumber', { room: currentRoom, number: num });
    };
    board.appendChild(cell);
  });
}

// ======================= ĐỒNG HỒ ĐẾM NGƯỢC =======================
const countdownDiv = document.createElement('div');
countdownDiv.style.color = '#ffcc00';
countdownDiv.style.fontSize = '20px';
countdownDiv.style.marginTop = '10px';
countdownDiv.style.fontWeight = 'bold';
document.getElementById('game-section').prepend(countdownDiv);

let countdown = 60;
let countdownInterval;

function startCountdown() {
  countdown = 60;
  countdownDiv.textContent = `⏳ Bạn còn ${countdown}s để sẵn sàng...`;
  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      countdownDiv.textContent = `❌ Bạn đã bị loại do không sẵn sàng sau 1 phút`;
      socket.emit('leaveRoom', currentRoom);
      setTimeout(() => {
        location.reload(); // ✅ Reload trang sau khi bị loại
      }, 3000);
    } else {
      countdownDiv.textContent = `⏳ Bạn còn ${countdown}s để sẵn sàng...`;
    }
  }, 1000);
}

// Bắt đầu đếm ngược sau khi join
document.getElementById('joinBtn').addEventListener('click', () => {
  setTimeout(() => {
    startCountdown();
  }, 1000);
});

// Dừng đếm khi đã sẵn sàng
document.getElementById('readyBtn').addEventListener('click', () => {
  clearInterval(countdownInterval);
  countdownDiv.textContent = '✅ Bạn đã sẵn sàng!';
});
