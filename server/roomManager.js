const PokerGame = require('./gameEngine');

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> { game, chat, createdAt }
    this.playerRooms = new Map(); // playerId -> roomId
  }

  createRoom(hostId, hostName, options = {}) {
    const roomId = this.generateRoomId();
    const game = new PokerGame(roomId, options);
    const result = game.addPlayer(hostId, hostName);

    if (result.error) return { error: result.error };

    this.rooms.set(roomId, {
      game,
      chat: [],
      createdAt: Date.now(),
      hostId,
    });
    this.playerRooms.set(hostId, roomId);

    return { roomId, game };
  }

  joinRoom(roomId, playerId, playerName) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'ルームが見つかりません' };

    const result = room.game.addPlayer(playerId, playerName);
    if (result.error) return { error: result.error };

    this.playerRooms.set(playerId, roomId);
    return { success: true, game: room.game };
  }

  leaveRoom(playerId) {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    room.game.removePlayer(playerId);
    this.playerRooms.delete(playerId);

    // Clean up empty rooms
    const activePlayers = room.game.players.filter(p => !p.disconnected);
    if (activePlayers.length === 0) {
      this.rooms.delete(roomId);
    }

    return roomId;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomByPlayer(playerId) {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return null;
    return { roomId, ...this.rooms.get(roomId) };
  }

  addChatMessage(roomId, playerId, playerName, message) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const chatMsg = {
      id: Date.now().toString(),
      playerId,
      playerName,
      message,
      timestamp: Date.now(),
    };
    room.chat.push(chatMsg);

    // Keep last 100 messages
    if (room.chat.length > 100) {
      room.chat = room.chat.slice(-100);
    }

    return chatMsg;
  }

  getChat(roomId) {
    const room = this.rooms.get(roomId);
    return room ? room.chat : [];
  }

  getRoomList() {
    const list = [];
    for (const [roomId, room] of this.rooms) {
      const activePlayers = room.game.players.filter(p => !p.disconnected);
      list.push({
        roomId,
        playerCount: activePlayers.length,
        maxPlayers: room.game.maxPlayers,
        phase: room.game.phase,
        blinds: `${room.game.smallBlind}/${room.game.bigBlind}`,
        createdAt: room.createdAt,
      });
    }
    return list;
  }

  generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    if (this.rooms.has(result)) return this.generateRoomId();
    return result;
  }
}

module.exports = RoomManager;
