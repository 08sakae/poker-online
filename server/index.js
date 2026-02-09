const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./roomManager');
const { BotPlayer } = require('./botPlayer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const roomManager = new RoomManager();

// Track bots per room: roomId -> Map<botId, BotPlayer>
const roomBots = new Map();

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
    roomBots.set(result.roomId, new Map());
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

  // Add NPC bot
  socket.on('add_bot', (data, callback) => {
    const roomData = roomManager.getRoomByPlayer(socket.id);
    if (!roomData) {
      callback?.({ error: 'ルームに参加していません' });
      return;
    }

    // Only host can add bots
    const room = roomManager.getRoom(roomData.roomId);
    if (room.hostId !== socket.id) {
      callback?.({ error: 'ホストのみがNPCを追加できます' });
      return;
    }

    if (roomData.game.phase !== 'waiting') {
      callback?.({ error: 'ゲーム中はNPCを追加できません' });
      return;
    }

    const bot = new BotPlayer();
    const result = roomData.game.addPlayer(bot.id, bot.name);
    if (result.error) {
      callback?.({ error: result.error });
      return;
    }

    // Mark player as bot in game
    const botPlayer = roomData.game.players.find(p => p.id === bot.id);
    if (botPlayer) {
      botPlayer.isBot = true;
      botPlayer.isReady = true; // Bots are always ready
    }

    // Track bot
    const bots = roomBots.get(roomData.roomId);
    if (bots) {
      bots.set(bot.id, bot);
    }

    callback?.({ success: true, botId: bot.id, botName: bot.name });

    emitGameState(roomData.roomId);
    emitSystemMessage(roomData.roomId, `${bot.name} がルームに参加しました`);

    // Check auto-start after adding bot
    checkAutoStart(roomData.roomId);
  });

  // Remove NPC bot
  socket.on('remove_bot', ({ botId }, callback) => {
    const roomData = roomManager.getRoomByPlayer(socket.id);
    if (!roomData) {
      callback?.({ error: 'ルームに参加していません' });
      return;
    }

    const room = roomManager.getRoom(roomData.roomId);
    if (room.hostId !== socket.id) {
      callback?.({ error: 'ホストのみがNPCを削除できます' });
      return;
    }

    if (roomData.game.phase !== 'waiting') {
      callback?.({ error: 'ゲーム中はNPCを削除できません' });
      return;
    }

    const bots = roomBots.get(roomData.roomId);
    const bot = bots?.get(botId);
    if (!bot) {
      callback?.({ error: 'NPCが見つかりません' });
      return;
    }

    roomData.game.removePlayer(botId);
    bots.delete(botId);

    callback?.({ success: true });

    emitGameState(roomData.roomId);
    emitSystemMessage(roomData.roomId, `${bot.name} が退出しました`);
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
    checkAutoStart(roomData.roomId);
  });

  // Player actions
  socket.on('action', ({ type, amount }, callback) => {
    const roomData = roomManager.getRoomByPlayer(socket.id);
    if (!roomData) {
      callback?.({ error: 'ルームに参加していません' });
      return;
    }

    const result = executeAction(roomData.roomId, roomData.game, socket.id, type, amount);

    if (result?.error) {
      callback?.({ error: result.error });
      return;
    }

    callback?.({ success: true });

    // Handle round end
    if (result?.action === 'round_end') {
      handleRoundEnd(roomData.roomId, result);
    } else {
      emitGameState(roomData.roomId);
      // Check if next player is a bot
      scheduleBotAction(roomData.roomId);
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
      // Check if the room still has human players
      const room = roomManager.getRoom(roomId);
      const humanPlayers = room.game.players.filter(p => !p.isBot && !p.disconnected);

      if (humanPlayers.length === 0) {
        // Remove all bots and clean up the room
        const bots = roomBots.get(roomId);
        if (bots) {
          for (const botId of bots.keys()) {
            room.game.removePlayer(botId);
          }
          roomBots.delete(roomId);
        }
        roomManager.rooms.delete(roomId);
      } else {
        emitGameState(roomId);
        emitSystemMessage(roomId, `${playerName} が退出しました`);
      }
    }
  }
});

// Execute a player/bot action
function executeAction(roomId, game, playerId, type, amount) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) return { error: 'プレイヤーが見つかりません' };

  let result;
  switch (type) {
    case 'fold':
      result = game.fold(playerId);
      if (!result.error) emitSystemMessage(roomId, `${player.name} がフォールドしました`);
      break;
    case 'check':
      result = game.check(playerId);
      if (!result.error) emitSystemMessage(roomId, `${player.name} がチェックしました`);
      break;
    case 'call':
      result = game.call(playerId);
      if (!result.error) emitSystemMessage(roomId, `${player.name} がコールしました`);
      break;
    case 'raise':
      result = game.raise(playerId, amount);
      if (!result.error) emitSystemMessage(roomId, `${player.name} が ${amount} にレイズしました`);
      break;
    case 'allin':
      const allInAmount = player.chips + player.bet;
      result = game.raise(playerId, allInAmount);
      if (!result.error) emitSystemMessage(roomId, `${player.name} がオールインしました！`);
      break;
    default:
      result = { error: '無効なアクション' };
  }

  return result;
}

// Handle round end logic
function handleRoundEnd(roomId, result) {
  // Emit showdown state first (showing all cards)
  emitGameState(roomId);

  // Send winner info
  io.to(roomId).emit('round_result', {
    winners: result.winners,
    evaluations: result.evaluations,
  });

  // Emit winning message
  for (const w of result.winners) {
    const names = w.players.map(p => p.name).join(', ');
    const handName = w.hand ? ` (${w.hand.name})` : '';
    emitSystemMessage(roomId, `🏆 ${names} が ${w.amount} チップを獲得${handName}`);
  }

  // After delay, reset to waiting state and re-ready bots
  setTimeout(() => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // Re-set bot ready status
    const bots = roomBots.get(roomId);
    if (bots) {
      for (const [botId, bot] of bots) {
        const botPlayer = room.game.players.find(p => p.id === botId);
        if (botPlayer) {
          botPlayer.isReady = true;
          botPlayer.isBot = true;
        }
      }
      // Remove bots that were eliminated (0 chips)
      for (const [botId, bot] of bots) {
        const botPlayer = room.game.players.find(p => p.id === botId);
        if (!botPlayer) {
          bots.delete(botId);
        }
      }
    }

    emitGameState(roomId);
  }, 500);
}

// Check if game can auto-start
function checkAutoStart(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  if (room.game.canStart()) {
    setTimeout(() => {
      const result = room.game.startRound();
      if (result.success) {
        emitGameState(roomId);
        emitSystemMessage(roomId, 'ゲーム開始！');
        // Check if first player is a bot
        scheduleBotAction(roomId);
      }
    }, 1000);
  }
}

// Schedule bot action if current player is a bot
function scheduleBotAction(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  const game = room.game;
  if (game.phase === 'waiting' || game.phase === 'showdown') return;

  const currentPlayer = game.getCurrentPlayer();
  if (!currentPlayer) return;

  const bots = roomBots.get(roomId);
  if (!bots) return;

  const bot = bots.get(currentPlayer.id);
  if (!bot) return;

  // Add a delay to make bot actions feel natural (1-3 seconds)
  const delay = 1000 + Math.random() * 2000;

  setTimeout(() => {
    // Re-check that it's still the bot's turn
    const freshRoom = roomManager.getRoom(roomId);
    if (!freshRoom) return;
    const freshGame = freshRoom.game;
    const freshCurrent = freshGame.getCurrentPlayer();
    if (!freshCurrent || freshCurrent.id !== bot.id) return;

    // Get bot decision
    const decision = bot.decide(freshGame);
    if (!decision) return;

    const result = executeAction(roomId, freshGame, bot.id, decision.type, decision.amount);

    if (result?.error) {
      // If bot action fails, try fold
      const foldResult = executeAction(roomId, freshGame, bot.id, 'fold');
      if (foldResult?.action === 'round_end') {
        handleRoundEnd(roomId, foldResult);
        return;
      }
      emitGameState(roomId);
      scheduleBotAction(roomId);
      return;
    }

    if (result?.action === 'round_end') {
      handleRoundEnd(roomId, result);
    } else {
      emitGameState(roomId);
      // Check if next player is also a bot
      scheduleBotAction(roomId);
    }
  }, delay);
}

function emitGameState(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  // Send personalized state to each player
  const sockets = io.sockets.adapter.rooms.get(roomId);
  if (!sockets) return;

  // Get bot info for the room
  const bots = roomBots.get(roomId);
  const botIds = bots ? Array.from(bots.keys()) : [];

  for (const socketId of sockets) {
    const state = room.game.getStateForPlayer(socketId);
    const actions = room.game.getAvailableActions(socketId);

    // Add bot flags and host info to player data
    const enrichedPlayers = state.players.map(p => ({
      ...p,
      isBot: botIds.includes(p.id) || p.isBot || false,
    }));

    io.to(socketId).emit('game_state', {
      ...state,
      players: enrichedPlayers,
      availableActions: actions,
      hostId: room.hostId,
    });
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
