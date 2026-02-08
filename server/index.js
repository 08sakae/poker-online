const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./roomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const roomManager = new RoomManager();

// Serve static files from client build
app.use(express.static(path.join(__dirname, '../client/dist')));

// API endpoint for room list
app.get('/api/rooms', (req, res) => {
  res.json(roomManager.getRoomList());
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create room
  socket.on('create_room', ({ playerName, options }, callback) => {
    const result = roomManager.createRoom(socket.id, playerName, options);
    if (result.error) {
      callback({ error: result.error });
      return;
    }

    socket.join(result.roomId);
    callback({ roomId: result.roomId });

    emitGameState(result.roomId);
    emitSystemMessage(result.roomId, `${playerName} がルームを作成しました`);
  });

  // Join room
  socket.on('join_room', ({ roomId, playerName }, callback) => {
    const result = roomManager.joinRoom(roomId.toUpperCase(), socket.id, playerName);
    if (result.error) {
      callback({ error: result.error });
      return;
    }

    socket.join(roomId.toUpperCase());
    callback({ success: true });

    emitGameState(roomId.toUpperCase());
    emitSystemMessage(roomId.toUpperCase(), `${playerName} が参加しました`);
  });

  // Set ready
  socket.on('set_ready', ({ ready }) => {
    const roomData = roomManager.getRoomByPlayer(socket.id);
    if (!roomData) return;

    roomData.game.setReady(socket.id, ready);
    emitGameState(roomData.roomId);

    const player = roomData.game.players.find(p => p.id === socket.id);
    if (player) {
      emitSystemMessage(roomData.roomId, `${player.name} が${ready ? '準備完了' : '準備解除'}しました`);
    }

    // Auto-start if all ready
    if (roomData.game.canStart()) {
      setTimeout(() => {
        const result = roomData.game.startRound();
        if (result.success) {
          emitGameState(roomData.roomId);
          emitSystemMessage(roomData.roomId, 'ゲーム開始！');
        }
      }, 1000);
    }
  });

  // Player actions
  socket.on('action', ({ type, amount }, callback) => {
    const roomData = roomManager.getRoomByPlayer(socket.id);
    if (!roomData) {
      callback?.({ error: 'ルームに参加していません' });
      return;
    }

    const game = roomData.game;
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    let result;
    switch (type) {
      case 'fold':
        result = game.fold(socket.id);
        if (!result.error) emitSystemMessage(roomData.roomId, `${player.name} がフォールドしました`);
        break;
      case 'check':
        result = game.check(socket.id);
        if (!result.error) emitSystemMessage(roomData.roomId, `${player.name} がチェックしました`);
        break;
      case 'call':
        result = game.call(socket.id);
        if (!result.error) emitSystemMessage(roomData.roomId, `${player.name} がコールしました`);
        break;
      case 'raise':
        result = game.raise(socket.id, amount);
        if (!result.error) emitSystemMessage(roomData.roomId, `${player.name} が ${amount} にレイズしました`);
        break;
      case 'allin':
        const allInAmount = player.chips + player.bet;
        result = game.raise(socket.id, allInAmount);
        if (!result.error) emitSystemMessage(roomData.roomId, `${player.name} がオールインしました！`);
        break;
      default:
        result = { error: '無効なアクション' };
    }

    if (result?.error) {
      callback?.({ error: result.error });
      return;
    }

    callback?.({ success: true });

    // Handle round end
    if (result?.action === 'round_end') {
      // Emit showdown state first (showing all cards)
      emitGameState(roomData.roomId);

      // Send winner info
      io.to(roomData.roomId).emit('round_result', {
        winners: result.winners,
        evaluations: result.evaluations,
      });

      // Emit winning message
      for (const w of result.winners) {
        const names = w.players.map(p => p.name).join(', ');
        const handName = w.hand ? ` (${w.hand.name})` : '';
        emitSystemMessage(roomData.roomId, `🏆 ${names} が ${w.amount} チップを獲得${handName}`);
      }

      // After delay, reset to waiting state
      setTimeout(() => {
        emitGameState(roomData.roomId);
      }, 500);
    } else {
      emitGameState(roomData.roomId);
    }
  });

  // Chat message
  socket.on('chat_message', ({ message }) => {
    const roomData = roomManager.getRoomByPlayer(socket.id);
    if (!roomData) return;

    const player = roomData.game.players.find(p => p.id === socket.id);
    if (!player) return;

    const chatMsg = roomManager.addChatMessage(roomData.roomId, socket.id, player.name, message);
    io.to(roomData.roomId).emit('chat_message', chatMsg);
  });

  // Leave room
  socket.on('leave_room', () => {
    handleDisconnect(socket);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    handleDisconnect(socket);
  });

  function handleDisconnect(socket) {
    const roomData = roomManager.getRoomByPlayer(socket.id);
    if (!roomData) return;

    const player = roomData.game.players.find(p => p.id === socket.id);
    const playerName = player?.name || '不明';

    const roomId = roomManager.leaveRoom(socket.id);
    socket.leave(roomId);

    if (roomId && roomManager.getRoom(roomId)) {
      emitGameState(roomId);
      emitSystemMessage(roomId, `${playerName} が退出しました`);
    }
  }
});

function emitGameState(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  // Send personalized state to each player
  const sockets = io.sockets.adapter.rooms.get(roomId);
  if (!sockets) return;

  for (const socketId of sockets) {
    const state = room.game.getStateForPlayer(socketId);
    const actions = room.game.getAvailableActions(socketId);
    io.to(socketId).emit('game_state', { ...state, availableActions: actions });
  }
}

function emitSystemMessage(roomId, message) {
  io.to(roomId).emit('chat_message', {
    id: Date.now().toString(),
    playerId: 'system',
    playerName: 'システム',
    message,
    timestamp: Date.now(),
    isSystem: true,
  });
}

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Poker server running on port ${PORT}`);
});
