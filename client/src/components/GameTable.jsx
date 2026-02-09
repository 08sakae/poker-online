import React, { useState, useMemo } from 'react';
import Card from './Card';
import Player from './Player';
import ActionPanel from './ActionPanel';
import Chat from './Chat';
import './GameTable.css';

const PHASE_NAMES = {
  waiting: 'ラウンド待ち',
  preflop: 'プリフロップ',
  flop: 'フロップ',
  turn: 'ターン',
  river: 'リバー',
  showdown: 'ショーダウン',
};

export default function GameTable({
  gameState,
  roomId,
  playerId,
  playerName,
  chatMessages,
  roundResult,
  onAction,
  onReady,
  onSendChat,
  onLeave,
  onAddBot,
  onRemoveBot,
}) {
  const [showResult, setShowResult] = useState(false);

  const me = gameState?.players?.find(p => p.id === playerId);
  const isWaiting = gameState?.phase === 'waiting';
  const myReady = me?.isReady || false;
  const isHost = gameState?.hostId === playerId;
  const botPlayers = gameState?.players?.filter(p => p.isBot) || [];
  const totalPlayers = gameState?.players?.length || 0;
  const maxPlayers = gameState?.players ? 6 : 6; // Default max

  // Arrange players with "me" at the bottom
  const arrangedPlayers = useMemo(() => {
    if (!gameState?.players) return [];
    const players = [...gameState.players];
    const myIndex = players.findIndex(p => p.id === playerId);
    if (myIndex === -1) return players.map((p, i) => ({ ...p, displayPos: i }));

    // Rotate so "me" is at position 0 (bottom)
    const rotated = [];
    for (let i = 0; i < players.length; i++) {
      const idx = (myIndex + i) % players.length;
      rotated.push({ ...players[idx], displayPos: i });
    }
    return rotated;
  }, [gameState?.players, playerId]);

  const positionClass = (displayPos, totalPlayers) => {
    // Map display position to CSS position class
    const positions = {
      2: [0, 3],
      3: [0, 2, 4],
      4: [0, 1, 3, 5],
      5: [0, 1, 2, 4, 5],
      6: [0, 1, 2, 3, 4, 5],
    };
    const map = positions[totalPlayers] || positions[6];
    return `pos-${map[displayPos] ?? displayPos}`;
  };

  // Copy room code to clipboard
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId).catch(() => {});
  };

  return (
    <div className="game-screen">
      {/* Top bar */}
      <div className="top-bar">
        <div className="top-left">
          <button className="leave-btn" onClick={onLeave}>← 退出</button>
        </div>
        <div className="top-center">
          <span className="room-label">ルーム</span>
          <button className="room-code" onClick={copyRoomCode} title="クリックでコピー">
            {roomId}
          </button>
          <span className="phase-badge">{PHASE_NAMES[gameState?.phase] || ''}</span>
        </div>
        <div className="top-right">
          <span className="blinds-info">
            ブラインド: {gameState?.smallBlind}/{gameState?.bigBlind}
          </span>
        </div>
      </div>

      {/* Table area */}
      <div className="table-area">
        <div className="poker-table">
          <div className="table-felt">
            {/* Community cards */}
            <div className="community-cards">
              {gameState?.communityCards?.map((card, i) => (
                <Card key={i} card={card} />
              ))}
              {/* Placeholder cards */}
              {Array.from({ length: 5 - (gameState?.communityCards?.length || 0) }).map((_, i) => (
                <div key={`empty-${i}`} className="card-placeholder" />
              ))}
            </div>

            {/* Pot */}
            {gameState?.pot > 0 && (
              <div className="pot-display">
                <span className="pot-label">POT</span>
                <span className="pot-amount">{gameState.pot.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Players */}
          {arrangedPlayers.map((player) => (
            <Player
              key={player.id}
              player={player}
              isCurrentPlayer={player.id === gameState?.currentPlayerId}
              isMe={player.id === playerId}
              isDealer={gameState?.players?.indexOf(gameState.players.find(p => p.id === player.id)) === gameState?.dealerIndex}
              position={positionClass(player.displayPos, arrangedPlayers.length)}
            />
          ))}
        </div>
      </div>

      {/* Ready & NPC controls (waiting phase) */}
      {isWaiting && me && (
        <div className="ready-area">
          <div className="ready-controls">
            <button
              className={`ready-btn ${myReady ? 'ready' : ''}`}
              onClick={() => onReady(!myReady)}
            >
              {myReady ? '✓ 準備OK（解除する）' : '準備完了'}
            </button>

            {isHost && (
              <div className="npc-controls">
                <button
                  className="npc-add-btn"
                  onClick={onAddBot}
                  disabled={totalPlayers >= 6}
                  title="NPCを追加"
                >
                  🤖 NPC追加
                </button>
                {botPlayers.length > 0 && (
                  <div className="npc-list">
                    {botPlayers.map(bot => (
                      <div key={bot.id} className="npc-item">
                        <span className="npc-name">{bot.name}</span>
                        <button
                          className="npc-remove-btn"
                          onClick={() => onRemoveBot(bot.id)}
                          title="NPCを削除"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Round result overlay */}
      {roundResult && (
        <div className="result-overlay">
          <div className="result-content">
            {roundResult.winners?.map((w, i) => (
              <div key={i} className="winner-info">
                <div className="winner-names">
                  {w.players.map(p => p.name).join(', ')}
                </div>
                <div className="winner-amount">+{w.amount.toLocaleString()} チップ</div>
                {w.hand && <div className="winner-hand">{w.hand.name}</div>}
                {w.players[0]?.holeCards && (
                  <div className="winner-cards">
                    {w.players[0].holeCards.map((c, j) => (
                      <Card key={j} card={c} small />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Panel */}
      <ActionPanel
        gameState={gameState}
        playerId={playerId}
        onAction={onAction}
      />

      {/* Chat */}
      <Chat messages={chatMessages} onSendMessage={onSendChat} />
    </div>
  );
}
