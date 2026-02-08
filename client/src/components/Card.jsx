import React from 'react';
import './Card.css';

const SUIT_SYMBOLS = {
  '♠': { symbol: '♠', color: '#1a1a2e', name: 'spade' },
  '♥': { symbol: '♥', color: '#e74c3c', name: 'heart' },
  '♦': { symbol: '♦', color: '#3498db', name: 'diamond' },
  '♣': { symbol: '♣', color: '#27ae60', name: 'club' },
  '?': { symbol: '?', color: '#666', name: 'hidden' },
};

export default function Card({ card, small = false, highlight = false }) {
  if (!card) return null;

  const isHidden = card.rank === '?';
  const suitInfo = SUIT_SYMBOLS[card.suit] || SUIT_SYMBOLS['?'];

  if (isHidden) {
    return (
      <div className={`card card-hidden ${small ? 'card-small' : ''}`}>
        <div className="card-back-pattern">
          <div className="card-back-inner">♠♥♦♣</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card ${small ? 'card-small' : ''} ${highlight ? 'card-highlight' : ''}`}
      style={{ '--suit-color': suitInfo.color }}
    >
      <div className="card-corner top-left">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit-small">{suitInfo.symbol}</span>
      </div>
      <div className="card-center">
        <span className="card-suit-large">{suitInfo.symbol}</span>
      </div>
      <div className="card-corner bottom-right">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit-small">{suitInfo.symbol}</span>
      </div>
    </div>
  );
}
