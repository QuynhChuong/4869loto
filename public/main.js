const socket = io();

const joinSection = document.getElementById('join-section');
const gameSection = document.getElementById('game-section');
const roomInfo = document.getElementById('room-info');
const board = document.getElementById('board');
const messages = document.getElementById('messages');

let currentRoom = null;
let currentTicket = [];
let marked = [];
let gameStarted = false;
let playerAlive = true;

// Lưu các số đã được gọi hiện tại
let numbersCalled = [];

document.getElementById('joinBtn').onclick = () => {
  const name = document.getElementById('name').value.trim();
  const room = document.getElementById('room-select').value;
  const mode = document.getElementById('mode-select').value;

  if (!name) {
    alert('Nhập tên bạn trước!');
    return;
  }

  currentRoom = room;

  socket.emit('joinRoom', { room, name, mode });

  joinSection.style.display = 'none';
  gameSection.style.display = 'block';
  messages.textContent = '';
};

socket.on('roomInfo', ({ count, mode, players }) => {
  roomInfo.textContent = `Phòng ${currentRoom}: ${count} người - Mode: ${mode} - Người chơi: ${players.join(', ')}`;
});

socket.on('ticket', (ticket) => {
  currentTicket = ticket;
  marked = new Array(25).fill(false);
  renderBoard();
  messages.textContent = '';
});

document.getElementById('changeTicketBtn').onclick = () => {
  if (gameStarted) {
    messages.textContent = 'Game đã bắt đầu, không thể đổi vé.';
    return;
  }
  socket.emit('changeTicket', currentRoom);
};

document.getElementById('readyBtn').onclick = () => {
  if (!currentTicket.length) {
    alert('Bạn chưa có vé!');
    return;
  }
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
  numbersCalled = []; // reset danh sách số gọi
});

socket.on('numberCalled', (number) => {
  messages.textContent = `Số được gọi: ${number}`;
  numbersCalled.push(number);
  // Nếu số được gọi có trên vé và đang chưa đánh dấu, tự động đánh dấu cũng được (tuỳ bạn)
  // Hoặc để người chơi tự click đánh dấu
});

socket.on('gameStatus', (status) => {
  if (status === 'waiting') {
    gameStarted = false;
    playerAlive = true;
    messages.textContent = 'Chờ người chơi sẵn sàng...';
    document.getElementById('readyBtn').disabled = false;
    document.getElementById('changeTicketBtn').disabled = false;
    document.getElementById('bingoBtn').disabled = true;
    document.getElementById('continueBtn').style.display = 'none';
    marked.fill(false);
    numbersCalled = [];
    renderBoard();
  }
});

socket.on('winner', (msg) => {
  messages.textContent = msg;
  document.getElementById('bingoBtn').disabled = true;
  document.getElementById('continueBtn').style.display = 'inline-block';
});

socket.on('invalidBingo', (msg) => {
  messages.textContent = msg;
  playerAlive = false;
  document.getElementById('bingoBtn').disabled = true;
});

socket.on('gameEnd', (msg) => {
  messages.textContent = msg;
  document.getElementById('bingoBtn').disabled = true;
  document.getElementById('continueBtn').style.display = 'inline-block';
});

document.getElementById('bingoBtn').onclick = () => {
  if (!playerAlive) {
    messages.textContent = 'Bạn đã bị loại khỏi ván này.';
    return;
  }
  socket.emit('bingo', currentRoom);
};

document.getElementById('continueBtn').onclick = () => {
  socket.emit('continueGame', currentRoom);
  messages.textContent = 'Chờ mọi người sẵn sàng...';
  document.getElementById('continueBtn').style.display = 'none';
};

document.getElementById('leaveBtn').onclick = () => {
  socket.emit('leaveRoom', currentRoom);
  currentRoom = null;
  currentTicket = [];
  marked = [];
  numbersCalled = [];
  gameStarted = false;
  playerAlive = true;

  gameSection.style.display = 'none';
  joinSection.style.display = 'block';
  messages.textContent = '';
  roomInfo.textContent = '';
};

function renderBoard() {
  board.innerHTML = '';
  for (let i = 0; i < 25; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.textContent = currentTicket[i];
    if (marked[i]) {
      cell.classList.add('marked');
    }
    cell.onclick = () => {
      if (!gameStarted || !playerAlive) return;

      const num = currentTicket[i];
      // Chỉ cho phép đánh dấu nếu số đã được gọi
      if (!numbersCalled.includes(num)) {
        messages.textContent = `Số ${num} chưa được gọi, không thể đánh dấu.`;
        return;
      }

      // Đánh dấu hoặc bỏ đánh dấu số
      marked[i] = !marked[i];
      renderBoard();

      // Gửi lên server đánh dấu số
      socket.emit('markNumber', { room: currentRoom, number: num });
    };
    board.appendChild(cell);
  }
}
