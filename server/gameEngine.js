const { createDeck, evaluateHand, compareHands } = require('./handEvaluator');

const PHASES = ['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown'];

class PokerGame {
  constructor(roomId, options = {}) {
    this.roomId = roomId;
    this.players = []; // { id, name, chips, holeCards, bet, totalBet, folded, allIn, seatIndex }
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.phase = 'waiting';
    this.currentPlayerIndex = -1;
    this.dealerIndex = 0;
    this.smallBlind = options.smallBlind || 10;
    this.bigBlind = options.bigBlind || 20;
    this.minPlayers = 2;
    this.maxPlayers = options.maxPlayers || 6;
    this.initialChips = options.initialChips || 1000;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastRaiserIndex = -1;
    this.actionCount = 0;
    this.roundStarted = false;
  }

  addPlayer(id, name) {
    if (this.players.length >= this.maxPlayers) return { error: '部屋が満員です' };
    if (this.players.find(p => p.id === id)) return { error: 'すでに参加しています' };

    const seatIndex = this.getNextSeat();
    const player = {
      id,
      name,
      chips: this.initialChips,
      holeCards: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      seatIndex,
      isReady: false,
      disconnected: false,
    };
    this.players.push(player);
    return { success: true, player };
  }

  removePlayer(id) {
    const index = this.players.findIndex(p => p.id === id);
    if (index === -1) return;

    if (this.phase !== 'waiting') {
      // Mark as disconnected during active game
      this.players[index].disconnected = true;
      this.players[index].folded = true;
      // Check if we need to advance
      if (this.players[this.currentPlayerIndex]?.id === id) {
        this.advanceToNextPlayer();
      }
    } else {
      this.players.splice(index, 1);
    }
  }

  getNextSeat() {
    const taken = new Set(this.players.map(p => p.seatIndex));
    for (let i = 0; i < this.maxPlayers; i++) {
      if (!taken.has(i)) return i;
    }
    return this.players.length;
  }

  setReady(id, ready = true) {
    const player = this.players.find(p => p.id === id);
    if (player) player.isReady = ready;
  }

  canStart() {
    const activePlayers = this.players.filter(p => !p.disconnected);
    return activePlayers.length >= this.minPlayers && activePlayers.every(p => p.isReady);
  }

  startRound() {
    if (!this.canStart()) return { error: 'ゲームを開始できません' };

    // Remove disconnected players
    this.players = this.players.filter(p => !p.disconnected);

    // Remove players with 0 chips
    this.players = this.players.filter(p => p.chips > 0);

    if (this.players.length < this.minPlayers) {
      return { error: 'プレイヤーが足りません' };
    }

    // Reset round state
    this.deck = createDeck();
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastRaiserIndex = -1;
    this.actionCount = 0;
    this.roundStarted = true;

    for (const player of this.players) {
      player.holeCards = [];
      player.bet = 0;
      player.totalBet = 0;
      player.folded = false;
      player.allIn = false;
    }

    // Move dealer
    this.dealerIndex = this.dealerIndex % this.players.length;

    // Post blinds
    const sbIndex = this.players.length === 2
      ? this.dealerIndex
      : (this.dealerIndex + 1) % this.players.length;
    const bbIndex = this.players.length === 2
      ? (this.dealerIndex + 1) % this.players.length
      : (this.dealerIndex + 2) % this.players.length;

    this.postBlind(sbIndex, this.smallBlind);
    this.postBlind(bbIndex, this.bigBlind);
    this.currentBet = this.bigBlind;

    // Deal hole cards
    for (const player of this.players) {
      player.holeCards = [this.deck.pop(), this.deck.pop()];
    }

    this.phase = 'preflop';

    // First to act: player after BB (or after dealer in heads-up)
    this.currentPlayerIndex = (bbIndex + 1) % this.players.length;
    this.lastRaiserIndex = bbIndex;

    return { success: true };
  }

  postBlind(playerIndex, amount) {
    const player = this.players[playerIndex];
    const actual = Math.min(amount, player.chips);
    player.chips -= actual;
    player.bet = actual;
    player.totalBet = actual;
    this.pot += actual;
    if (player.chips === 0) player.allIn = true;
  }

  getCurrentPlayer() {
    if (this.currentPlayerIndex < 0 || this.currentPlayerIndex >= this.players.length) return null;
    return this.players[this.currentPlayerIndex];
  }

  getActivePlayers() {
    return this.players.filter(p => !p.folded && !p.disconnected);
  }

  getActiveNonAllInPlayers() {
    return this.players.filter(p => !p.folded && !p.allIn && !p.disconnected);
  }

  // Player actions
  fold(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.id !== this.getCurrentPlayer()?.id) return { error: 'あなたのターンではありません' };
    if (player.folded) return { error: 'すでにフォールドしています' };

    player.folded = true;

    // Check if only one player remains
    const active = this.getActivePlayers();
    if (active.length === 1) {
      return this.endRound([{ players: [active[0]], amount: this.pot }]);
    }

    return this.advanceToNextPlayer();
  }

  check(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.id !== this.getCurrentPlayer()?.id) return { error: 'あなたのターンではありません' };
    if (player.bet < this.currentBet) return { error: 'チェックできません。コールまたはレイズしてください' };

    return this.advanceToNextPlayer();
  }

  call(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.id !== this.getCurrentPlayer()?.id) return { error: 'あなたのターンではありません' };

    const callAmount = Math.min(this.currentBet - player.bet, player.chips);
    player.chips -= callAmount;
    player.bet += callAmount;
    player.totalBet += callAmount;
    this.pot += callAmount;

    if (player.chips === 0) player.allIn = true;

    return this.advanceToNextPlayer();
  }

  raise(playerId, raiseAmount) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.id !== this.getCurrentPlayer()?.id) return { error: 'あなたのターンではありません' };

    const totalNeeded = raiseAmount;
    const additional = totalNeeded - player.bet;

    if (additional > player.chips) {
      // All-in
      const allInAmount = player.chips;
      player.bet += allInAmount;
      player.totalBet += allInAmount;
      this.pot += allInAmount;
      player.chips = 0;
      player.allIn = true;

      if (player.bet > this.currentBet) {
        this.minRaise = player.bet - this.currentBet;
        this.currentBet = player.bet;
        this.lastRaiserIndex = this.currentPlayerIndex;
      }
    } else {
      if (totalNeeded < this.currentBet + this.minRaise && additional < player.chips) {
        return { error: `最低レイズ額は ${this.currentBet + this.minRaise} です` };
      }

      this.minRaise = totalNeeded - this.currentBet;
      this.currentBet = totalNeeded;

      player.chips -= additional;
      player.bet += additional;
      player.totalBet += additional;
      this.pot += additional;

      if (player.chips === 0) player.allIn = true;
      this.lastRaiserIndex = this.currentPlayerIndex;
    }

    return this.advanceToNextPlayer();
  }

  advanceToNextPlayer() {
    const activePlayers = this.getActiveNonAllInPlayers();

    // If only 1 or 0 non-allin active players, advance phase
    if (activePlayers.length <= 1) {
      // If all active players have matched the bet or are all-in
      const allMatched = this.getActivePlayers().every(p => p.bet === this.currentBet || p.allIn);
      if (allMatched || activePlayers.length === 0) {
        return this.advancePhase();
      }
    }

    // Find next player who can act
    let nextIndex = (this.currentPlayerIndex + 1) % this.players.length;
    let checked = 0;

    while (checked < this.players.length) {
      const nextPlayer = this.players[nextIndex];
      if (!nextPlayer.folded && !nextPlayer.allIn && !nextPlayer.disconnected) {
        // Check if betting round is complete
        if (nextIndex === this.lastRaiserIndex && this.actionCount > 0) {
          return this.advancePhase();
        }
        this.currentPlayerIndex = nextIndex;
        this.actionCount++;
        return { success: true, action: 'next_player' };
      }
      nextIndex = (nextIndex + 1) % this.players.length;
      checked++;
    }

    // No one can act, advance phase
    return this.advancePhase();
  }

  advancePhase() {
    // Reset bets for new betting round
    for (const player of this.players) {
      player.bet = 0;
    }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.actionCount = 0;

    const phaseIndex = PHASES.indexOf(this.phase);

    if (phaseIndex >= 4 || this.getActivePlayers().length <= 1) {
      // Go to showdown
      return this.showdown();
    }

    // Deal community cards
    this.deck.pop(); // Burn card

    if (this.phase === 'preflop') {
      this.phase = 'flop';
      this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    } else if (this.phase === 'flop') {
      this.phase = 'turn';
      this.communityCards.push(this.deck.pop());
    } else if (this.phase === 'turn') {
      this.phase = 'river';
      this.communityCards.push(this.deck.pop());
    }

    // Check if we need more betting (if only 1 or 0 non-allin active players)
    const canAct = this.getActiveNonAllInPlayers();
    if (canAct.length <= 1) {
      return this.advancePhase();
    }

    // Set first to act (first active player after dealer)
    let startIndex = (this.dealerIndex + 1) % this.players.length;
    let checked = 0;
    while (checked < this.players.length) {
      const p = this.players[startIndex];
      if (!p.folded && !p.allIn && !p.disconnected) {
        this.currentPlayerIndex = startIndex;
        this.lastRaiserIndex = startIndex; // Will complete full round
        break;
      }
      startIndex = (startIndex + 1) % this.players.length;
      checked++;
    }

    return { success: true, action: 'phase_advance', phase: this.phase };
  }

  showdown() {
    this.phase = 'showdown';

    const activePlayers = this.getActivePlayers();

    if (activePlayers.length === 1) {
      // Everyone else folded
      const winner = activePlayers[0];
      winner.chips += this.pot;
      const result = {
        success: true,
        action: 'round_end',
        winners: [{ players: [{ id: winner.id, name: winner.name }], amount: this.pot, hand: null }],
      };
      this.prepareNextRound();
      return result;
    }

    // Evaluate hands
    const evaluations = activePlayers.map(p => ({
      player: p,
      hand: evaluateHand(p.holeCards, this.communityCards),
    }));

    // Calculate side pots
    const pots = this.calculateSidePots();

    const winners = [];

    for (const pot of pots) {
      const eligibleEvals = evaluations.filter(e =>
        pot.eligible.includes(e.player.id)
      );

      if (eligibleEvals.length === 0) continue;

      // Find best hand(s)
      eligibleEvals.sort((a, b) => compareHands(b.hand, a.hand));
      const bestHand = eligibleEvals[0].hand;
      const potWinners = eligibleEvals.filter(e => compareHands(e.hand, bestHand) === 0);

      const share = Math.floor(pot.amount / potWinners.length);
      const remainder = pot.amount - share * potWinners.length;

      potWinners.forEach((w, i) => {
        w.player.chips += share + (i === 0 ? remainder : 0);
      });

      winners.push({
        players: potWinners.map(w => ({
          id: w.player.id,
          name: w.player.name,
          holeCards: w.player.holeCards,
        })),
        amount: pot.amount,
        hand: bestHand,
      });
    }

    const result = {
      success: true,
      action: 'round_end',
      winners,
      evaluations: evaluations.map(e => ({
        playerId: e.player.id,
        playerName: e.player.name,
        hand: e.hand,
        holeCards: e.player.holeCards,
      })),
    };

    this.prepareNextRound();
    return result;
  }

  calculateSidePots() {
    const activePlayers = this.players.filter(p => !p.disconnected);
    const bets = activePlayers
      .filter(p => p.totalBet > 0)
      .sort((a, b) => a.totalBet - b.totalBet);

    const pots = [];
    let processedBet = 0;

    const uniqueBets = [...new Set(bets.map(b => b.totalBet))].sort((a, b) => a - b);

    for (const betLevel of uniqueBets) {
      const increment = betLevel - processedBet;
      if (increment <= 0) continue;

      const contributors = activePlayers.filter(p => p.totalBet >= betLevel);
      const eligible = contributors.filter(p => !p.folded).map(p => p.id);
      const amount = increment * contributors.length;

      if (amount > 0 && eligible.length > 0) {
        pots.push({ amount, eligible });
      }

      processedBet = betLevel;
    }

    // If no pots calculated, create a simple main pot
    if (pots.length === 0 && this.pot > 0) {
      const eligible = this.getActivePlayers().map(p => p.id);
      pots.push({ amount: this.pot, eligible });
    }

    return pots;
  }

  prepareNextRound() {
    this.phase = 'waiting';
    this.roundStarted = false;
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;

    // Remove disconnected players and players with 0 chips
    this.players = this.players.filter(p => !p.disconnected);

    // Reset ready status
    for (const player of this.players) {
      player.isReady = false;
      player.holeCards = [];
      player.bet = 0;
      player.totalBet = 0;
      player.folded = false;
      player.allIn = false;
    }

    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
  }

  // Get game state for a specific player (hides other players' cards)
  getStateForPlayer(playerId) {
    const currentPlayer = this.getCurrentPlayer();
    const isShowdown = this.phase === 'showdown';

    return {
      roomId: this.roomId,
      phase: this.phase,
      communityCards: this.communityCards,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      dealerIndex: this.dealerIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayerId: currentPlayer?.id || null,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        bet: p.bet,
        totalBet: p.totalBet,
        folded: p.folded,
        allIn: p.allIn,
        seatIndex: p.seatIndex,
        isReady: p.isReady,
        holeCards: p.id === playerId || isShowdown ? p.holeCards : p.holeCards.map(() => ({ rank: '?', suit: '?' })),
        disconnected: p.disconnected,
      })),
    };
  }

  getAvailableActions(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.getCurrentPlayer()?.id !== playerId) return [];
    if (player.folded || player.allIn) return [];

    const actions = ['fold'];
    const callAmount = this.currentBet - player.bet;

    if (callAmount === 0) {
      actions.push('check');
    } else {
      actions.push('call');
    }

    if (player.chips > callAmount) {
      actions.push('raise');
    }

    // All-in is always available
    actions.push('allin');

    return actions;
  }
}

module.exports = PokerGame;
