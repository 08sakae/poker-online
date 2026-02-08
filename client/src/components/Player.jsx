import React from 'react';
import Card from './Card';
import './Player.css';

export default function Player({ player, isCurrentPlayer, isMe, isDealer, position }) {
  const isActive = !player.folded && !player.disconnected;

  return (
    <div
      className={`player-seat ${position} ${isMe ? 'is-me' : ''} ${isCurrentPlayer ? 'is-current' : ''} ${player.folded ? 'is-folded' : ''} ${player.disconnected ? 'is-disconnected' : ''}`}
    >
      {/* Cards */}
      <div className="player-cards">
        {player.holeCards && player.holeCards.length > 0 ? (
          player.holeCards.map((card, i) => (
            <Card key={i} card={card} small={!isMe} />
          ))
        ) : null}
      </div>

      {/* Player info */}
      <div className="player-info">
        <div className="player-name-row">
          {isDealer && <span className="dealer-badge">D</span>}
          <span className="player-name">{player.name}</span>
          {player.allIn && <span className="allin-badge">ALL IN</span>}
        </div>
        <div className="player-chips">
          <span className="chip-icon">●</span>
          <span>{player.chips.toLocaleString()}</span>
        </div>
        {player.bet > 0 && (
          <div className="player-bet">
            BET: {player.bet}
          </div>
        )}
        {!player.isReady && !player.holeCards?.length && (
          <div className="player-status waiting">待機中</div>
        )}
        {player.isReady && !player.holeCards?.length && (
          <div className="player-status ready">準備OK</div>
        )}
        {player.folded && (
          <div className="player-status folded">FOLD</div>
        )}
        {player.disconnected && (
          <div className="player-status disconnected">切断</div>
        )}
      </div>
    </div>
  );
}
