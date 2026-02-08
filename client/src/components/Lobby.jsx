import React, { useState } from 'react';
import './Lobby.css';

export default function Lobby({ onCreateRoom, onJoinRoom }) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState('menu'); // menu | create | join
  const [options, setOptions] = useState({
    smallBlind: 10,
    bigBlind: 20,
    initialChips: 1000,
    maxPlayers: 6,
  });

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreateRoom(name.trim(), options);
  };

  const handleJoin = () => {
    if (!name.trim() || !roomCode.trim()) return;
    onJoinRoom(name.trim(), roomCode.trim().toUpperCase());
  };

  return (
    <div className="lobby">
      <div className="lobby-bg">
        <div className="lobby-card-deco c1">♠</div>
        <div className="lobby-card-deco c2">♥</div>
        <div className="lobby-card-deco c3">♦</div>
        <div className="lobby-card-deco c4">♣</div>
      </div>

      <div className="lobby-container">
        <div className="lobby-header">
          <h1>♠ Texas Hold'em ♠</h1>
          <p>友人とオンラインポーカー</p>
        </div>

        {mode === 'menu' && (
          <div className="lobby-menu">
            <div className="name-input-group">
              <label>プレイヤー名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="名前を入力"
                maxLength={12}
                autoFocus
              />
            </div>
            <div className="lobby-buttons">
              <button className="btn-primary" onClick={() => name.trim() && setMode('create')}>
                ルームを作成
              </button>
              <button className="btn-secondary" onClick={() => name.trim() && setMode('join')}>
                ルームに参加
              </button>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div className="lobby-form">
            <h2>ルーム設定</h2>
            <div className="form-grid">
              <div className="form-group">
                <label>スモールブラインド</label>
                <input
                  type="number"
                  value={options.smallBlind}
                  onChange={(e) => setOptions({ ...options, smallBlind: parseInt(e.target.value) || 10, bigBlind: (parseInt(e.target.value) || 10) * 2 })}
                  min={1}
                />
              </div>
              <div className="form-group">
                <label>ビッグブラインド</label>
                <input
                  type="number"
                  value={options.bigBlind}
                  onChange={(e) => setOptions({ ...options, bigBlind: parseInt(e.target.value) || 20 })}
                  min={2}
                />
              </div>
              <div className="form-group">
                <label>初期チップ</label>
                <input
                  type="number"
                  value={options.initialChips}
                  onChange={(e) => setOptions({ ...options, initialChips: parseInt(e.target.value) || 1000 })}
                  min={100}
                  step={100}
                />
              </div>
              <div className="form-group">
                <label>最大人数</label>
                <select
                  value={options.maxPlayers}
                  onChange={(e) => setOptions({ ...options, maxPlayers: parseInt(e.target.value) })}
                >
                  <option value={2}>2人</option>
                  <option value={3}>3人</option>
                  <option value={4}>4人</option>
                  <option value={5}>5人</option>
                  <option value={6}>6人</option>
                </select>
              </div>
            </div>
            <div className="lobby-buttons">
              <button className="btn-primary" onClick={handleCreate}>作成する</button>
              <button className="btn-back" onClick={() => setMode('menu')}>戻る</button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="lobby-form">
            <h2>ルームに参加</h2>
            <div className="form-group">
              <label>ルームコード</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="例: ABC123"
                maxLength={6}
                autoFocus
                style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '1.5rem' }}
              />
            </div>
            <div className="lobby-buttons">
              <button className="btn-primary" onClick={handleJoin} disabled={roomCode.length < 4}>参加する</button>
              <button className="btn-back" onClick={() => setMode('menu')}>戻る</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
