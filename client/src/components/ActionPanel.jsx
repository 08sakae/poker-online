import React, { useState, useMemo } from 'react';
import './ActionPanel.css';

export default function ActionPanel({ gameState, playerId, onAction }) {
  const [raiseAmount, setRaiseAmount] = useState(0);

  const me = gameState?.players?.find(p => p.id === playerId);
  const actions = gameState?.availableActions || [];
  const isMyTurn = gameState?.currentPlayerId === playerId;

  const callAmount = useMemo(() => {
    if (!me || !gameState) return 0;
    return gameState.currentBet - me.bet;
  }, [me, gameState]);

  const minRaiseTotal = useMemo(() => {
    if (!gameState) return 0;
    return gameState.currentBet + gameState.minRaise;
  }, [gameState]);

  const maxRaise = useMemo(() => {
    if (!me) return 0;
    return me.chips + me.bet;
  }, [me]);

  // Reset raise amount when it's our turn
  React.useEffect(() => {
    if (isMyTurn) {
      setRaiseAmount(minRaiseTotal);
    }
  }, [isMyTurn, minRaiseTotal]);

  if (!isMyTurn || actions.length === 0) return null;

  const handleRaise = () => {
    onAction('raise', raiseAmount);
  };

  const presetRaises = [
    { label: 'Min', amount: minRaiseTotal },
    { label: '½ Pot', amount: Math.max(minRaiseTotal, Math.floor(gameState.pot / 2) + gameState.currentBet) },
    { label: 'Pot', amount: Math.min(maxRaise, gameState.pot + gameState.currentBet) },
  ];

  return (
    <div className="action-panel">
      <div className="action-info">
        <span className="your-turn-badge">あなたのターン</span>
        {callAmount > 0 && <span className="call-info">コール: {callAmount}</span>}
      </div>

      <div className="action-buttons">
        {actions.includes('fold') && (
          <button className="action-btn fold" onClick={() => onAction('fold')}>
            フォールド
          </button>
        )}

        {actions.includes('check') && (
          <button className="action-btn check" onClick={() => onAction('check')}>
            チェック
          </button>
        )}

        {actions.includes('call') && (
          <button className="action-btn call" onClick={() => onAction('call')}>
            コール <span className="btn-amount">{callAmount}</span>
          </button>
        )}

        {actions.includes('raise') && (
          <div className="raise-section">
            <div className="raise-presets">
              {presetRaises.map(p => (
                <button
                  key={p.label}
                  className={`preset-btn ${raiseAmount === p.amount ? 'active' : ''}`}
                  onClick={() => setRaiseAmount(Math.min(p.amount, maxRaise))}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="raise-slider-row">
              <input
                type="range"
                min={minRaiseTotal}
                max={maxRaise}
                value={raiseAmount}
                onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
                className="raise-slider"
              />
              <input
                type="number"
                value={raiseAmount}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || minRaiseTotal;
                  setRaiseAmount(Math.max(minRaiseTotal, Math.min(maxRaise, v)));
                }}
                className="raise-input"
                min={minRaiseTotal}
                max={maxRaise}
              />
            </div>
            <button className="action-btn raise" onClick={handleRaise}>
              レイズ <span className="btn-amount">{raiseAmount}</span>
            </button>
          </div>
        )}

        {actions.includes('allin') && (
          <button className="action-btn allin" onClick={() => onAction('allin')}>
            オールイン <span className="btn-amount">{me?.chips || 0}</span>
          </button>
        )}
      </div>
    </div>
  );
}
