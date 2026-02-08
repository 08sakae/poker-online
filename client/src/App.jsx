import React, { useState, useEffect, useCallback } from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import Lobby from './components/Lobby';
import GameTable from './components/GameTable';
import './App.css';

function AppContent() {
  const { socket, connected } = useSocket();
  const [screen, setScreen] = useState('lobby'); // lobby | game
  const [roomId, setRoomId] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [roundResult, setRoundResult] = useState(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('game_state', (state) => {
      setGameState(state);
      setScreen('game');
    });

    socket.on('chat_message', (msg) => {
      setChatMessages(prev => [...prev.slice(-99), msg]);
    });

    socket.on('round_result', (result) => {
      setRoundResult(result);
      // Clear after delay
      setTimeout(() => setRoundResult(null), 6000);
    });

    return () => {
      socket.off('game_state');
      socket.off('chat_message');
      socket.off('round_result');
    };
  }, [socket]);

  const handleCreateRoom = useCallback((name, options) => {
    if (!socket) return;
    setPlayerName(name);
    socket.emit('create_room', { playerName: name, options }, (response) => {
      if (response.error) {
        alert(response.error);
        return;
      }
      setRoomId(response.roomId);
      setChatMessages([]);
    });
  }, [socket]);

  const handleJoinRoom = useCallback((name, roomCode) => {
    if (!socket) return;
    setPlayerName(name);
    socket.emit('join_room', { roomId: roomCode, playerName: name }, (response) => {
      if (response.error) {
        alert(response.error);
        return;
      }
      setRoomId(roomCode.toUpperCase());
      setChatMessages([]);
    });
  }, [socket]);

  const handleLeaveRoom = useCallback(() => {
    if (!socket) return;
    socket.emit('leave_room');
    setScreen('lobby');
    setRoomId(null);
    setGameState(null);
    setChatMessages([]);
    setRoundResult(null);
  }, [socket]);

  const handleAction = useCallback((type, amount) => {
    if (!socket) return;
    socket.emit('action', { type, amount }, (response) => {
      if (response?.error) {
        console.error(response.error);
      }
    });
  }, [socket]);

  const handleReady = useCallback((ready) => {
    if (!socket) return;
    socket.emit('set_ready', { ready });
  }, [socket]);

  const handleSendChat = useCallback((message) => {
    if (!socket) return;
    socket.emit('chat_message', { message });
  }, [socket]);

  if (!connected) {
    return (
      <div className="connecting-screen">
        <div className="connecting-content">
          <div className="spinner" />
          <p>サーバーに接続中...</p>
        </div>
      </div>
    );
  }

  if (screen === 'lobby') {
    return (
      <Lobby
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
      />
    );
  }

  return (
    <GameTable
      gameState={gameState}
      roomId={roomId}
      playerId={socket?.id}
      playerName={playerName}
      chatMessages={chatMessages}
      roundResult={roundResult}
      onAction={handleAction}
      onReady={handleReady}
      onSendChat={handleSendChat}
      onLeave={handleLeaveRoom}
    />
  );
}

export default function App() {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
}
