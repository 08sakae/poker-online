const { evaluateHand, HAND_RANKS } = require('./handEvaluator');

// Bot personality types
const PERSONALITIES = {
  TIGHT_PASSIVE: { name: 'タイト', aggressiveness: 0.2, looseness: 0.3 },
  TIGHT_AGGRESSIVE: { name: 'シャーク', aggressiveness: 0.7, looseness: 0.3 },
  LOOSE_PASSIVE: { name: 'フィッシュ', aggressiveness: 0.2, looseness: 0.7 },
  LOOSE_AGGRESSIVE: { name: 'マニアック', aggressiveness: 0.7, looseness: 0.7 },
  BALANCED: { name: 'バランス', aggressiveness: 0.5, looseness: 0.5 },
};

const BOT_NAMES = [
  'ロボ太郎', 'AIちゃん', 'ボット君', 'メカ子',
  'デジ丸', 'サイバー', 'ネオ助', 'テック姫',
  'アルファ', 'ベータ', 'ガンマ', 'デルタ',
];

let botCounter = 0;

class BotPlayer {
  constructor(personality = null) {
    this.id = `bot_${Date.now()}_${++botCounter}`;
    this.personality = personality || this.randomPersonality();
    this.name = this.generateName();
    this.isBot = true;
  }

  randomPersonality() {
    const types = Object.values(PERSONALITIES);
    return types[Math.floor(Math.random() * types.length)];
  }

  generateName() {
    const available = BOT_NAMES[botCounter % BOT_NAMES.length];
    return `🤖${available}`;
  }

  /**
   * Decide what action to take given the current game state
   * @param {Object} game - The PokerGame instance
   * @returns {{ type: string, amount?: number }}
   */
  decide(game) {
    const player = game.players.find(p => p.id === this.id);
    if (!player) return { type: 'fold' };

    const actions = game.getAvailableActions(this.id);
    if (actions.length === 0) return null;

    const handStrength = this.evaluateStrength(game, player);
    const potOdds = this.calculatePotOdds(game, player);
    const { aggressiveness, looseness } = this.personality;

    // Add some randomness
    const rand = Math.random();
    const adjustedStrength = handStrength + (rand - 0.5) * 0.2;

    // Pre-flop strategy
    if (game.phase === 'preflop') {
      return this.preflopDecision(game, player, actions, adjustedStrength);
    }

    // Post-flop strategy
    return this.postflopDecision(game, player, actions, adjustedStrength, potOdds);
  }

  preflopDecision(game, player, actions, strength) {
    const { aggressiveness, looseness } = this.personality;
    const callAmount = game.currentBet - player.bet;
    const potRatio = callAmount / Math.max(game.pot, 1);

    // Strong hand (top pair+, premium cards)
    if (strength > 0.7) {
      if (actions.includes('raise') && Math.random() < aggressiveness + 0.3) {
        const raiseSize = this.calculateRaiseSize(game, player, 'strong');
        return { type: 'raise', amount: raiseSize };
      }
      return actions.includes('call') ? { type: 'call' } : { type: 'check' };
    }

    // Medium hand
    if (strength > 0.4) {
      if (callAmount === 0 && actions.includes('check')) {
        // Sometimes raise with medium hands (semi-bluff)
        if (actions.includes('raise') && Math.random() < aggressiveness * 0.5) {
          const raiseSize = this.calculateRaiseSize(game, player, 'medium');
          return { type: 'raise', amount: raiseSize };
        }
        return { type: 'check' };
      }

      // Call if pot odds are good or we're loose
      if (potRatio < looseness + 0.2) {
        return actions.includes('call') ? { type: 'call' } : { type: 'check' };
      }

      return { type: 'fold' };
    }

    // Weak hand
    if (callAmount === 0 && actions.includes('check')) {
      // Occasional bluff raise
      if (actions.includes('raise') && Math.random() < aggressiveness * 0.15) {
        const raiseSize = this.calculateRaiseSize(game, player, 'bluff');
        return { type: 'raise', amount: raiseSize };
      }
      return { type: 'check' };
    }

    // Loose players might call with weak hands
    if (Math.random() < looseness * 0.3 && potRatio < 0.3) {
      return actions.includes('call') ? { type: 'call' } : { type: 'fold' };
    }

    return { type: 'fold' };
  }

  postflopDecision(game, player, actions, strength, potOdds) {
    const { aggressiveness, looseness } = this.personality;
    const callAmount = game.currentBet - player.bet;
    const potRatio = callAmount / Math.max(game.pot, 1);

    // Very strong hand (two pair+)
    if (strength > 0.8) {
      if (actions.includes('raise')) {
        if (Math.random() < 0.8) {
          const raiseSize = this.calculateRaiseSize(game, player, 'strong');
          return { type: 'raise', amount: raiseSize };
        }
        // Slow play occasionally
        return actions.includes('call') ? { type: 'call' } : { type: 'check' };
      }
      return actions.includes('call') ? { type: 'call' } : { type: 'check' };
    }

    // Good hand (one pair with good kicker)
    if (strength > 0.55) {
      if (callAmount === 0) {
        // Bet for value
        if (actions.includes('raise') && Math.random() < aggressiveness + 0.2) {
          const raiseSize = this.calculateRaiseSize(game, player, 'medium');
          return { type: 'raise', amount: raiseSize };
        }
        return { type: 'check' };
      }

      // Call if reasonable
      if (potRatio < 0.5 + looseness * 0.3) {
        return actions.includes('call') ? { type: 'call' } : { type: 'fold' };
      }
      return { type: 'fold' };
    }

    // Drawing hand / medium
    if (strength > 0.35) {
      if (callAmount === 0) {
        // Semi-bluff
        if (actions.includes('raise') && Math.random() < aggressiveness * 0.4) {
          const raiseSize = this.calculateRaiseSize(game, player, 'bluff');
          return { type: 'raise', amount: raiseSize };
        }
        return { type: 'check' };
      }

      // Call if cheap
      if (potRatio < looseness * 0.4) {
        return actions.includes('call') ? { type: 'call' } : { type: 'fold' };
      }
      return { type: 'fold' };
    }

    // Weak hand
    if (callAmount === 0 && actions.includes('check')) {
      // Occasional bluff
      if (actions.includes('raise') && Math.random() < aggressiveness * 0.12) {
        const raiseSize = this.calculateRaiseSize(game, player, 'bluff');
        return { type: 'raise', amount: raiseSize };
      }
      return { type: 'check' };
    }

    return { type: 'fold' };
  }

  evaluateStrength(game, player) {
    if (game.phase === 'preflop') {
      return this.preflopHandStrength(player.holeCards);
    }

    // Post-flop: evaluate actual hand
    const hand = evaluateHand(player.holeCards, game.communityCards);
    return this.handRankToStrength(hand.rank);
  }

  preflopHandStrength(holeCards) {
    if (!holeCards || holeCards.length < 2) return 0.2;

    const c1 = holeCards[0];
    const c2 = holeCards[1];
    const v1 = this.cardValue(c1.rank);
    const v2 = this.cardValue(c2.rank);
    const high = Math.max(v1, v2);
    const low = Math.min(v1, v2);
    const suited = c1.suit === c2.suit;
    const paired = v1 === v2;

    // Premium pairs AA, KK, QQ
    if (paired && high >= 12) return 0.95;
    // JJ, TT
    if (paired && high >= 10) return 0.85;
    // Mid pairs 77-99
    if (paired && high >= 7) return 0.7;
    // Small pairs
    if (paired) return 0.55;

    // AK suited
    if (high === 14 && low === 13 && suited) return 0.9;
    // AK offsuit
    if (high === 14 && low === 13) return 0.85;
    // AQ, AJ suited
    if (high === 14 && low >= 11 && suited) return 0.8;
    // AQ, AJ offsuit
    if (high === 14 && low >= 11) return 0.7;
    // AT suited
    if (high === 14 && low === 10 && suited) return 0.65;
    // KQ suited
    if (high === 13 && low === 12 && suited) return 0.7;
    // KQ offsuit
    if (high === 13 && low === 12) return 0.6;

    // Suited connectors
    if (suited && high - low === 1 && high >= 6) return 0.5;
    // Suited with Ace
    if (suited && high === 14) return 0.5;

    // High cards
    if (high >= 12 && low >= 10) return 0.45;

    // Connected cards
    if (high - low <= 2 && high >= 7) return 0.35;

    // Suited
    if (suited && high >= 9) return 0.3;

    // Low trash
    return 0.15;
  }

  handRankToStrength(rank) {
    const map = {
      [HAND_RANKS.ROYAL_FLUSH]: 1.0,
      [HAND_RANKS.STRAIGHT_FLUSH]: 0.98,
      [HAND_RANKS.FOUR_OF_A_KIND]: 0.95,
      [HAND_RANKS.FULL_HOUSE]: 0.9,
      [HAND_RANKS.FLUSH]: 0.85,
      [HAND_RANKS.STRAIGHT]: 0.8,
      [HAND_RANKS.THREE_OF_A_KIND]: 0.7,
      [HAND_RANKS.TWO_PAIR]: 0.6,
      [HAND_RANKS.ONE_PAIR]: 0.45,
      [HAND_RANKS.HIGH_CARD]: 0.2,
    };
    return map[rank] || 0.2;
  }

  calculatePotOdds(game, player) {
    const callAmount = game.currentBet - player.bet;
    if (callAmount <= 0) return 0;
    return callAmount / (game.pot + callAmount);
  }

  calculateRaiseSize(game, player, type) {
    const pot = game.pot;
    const minRaise = game.currentBet + game.minRaise;

    let raiseAmount;
    switch (type) {
      case 'strong':
        // Raise 60-100% of pot
        raiseAmount = game.currentBet + Math.floor(pot * (0.6 + Math.random() * 0.4));
        break;
      case 'medium':
        // Raise 40-60% of pot
        raiseAmount = game.currentBet + Math.floor(pot * (0.4 + Math.random() * 0.2));
        break;
      case 'bluff':
        // Raise 30-50% of pot
        raiseAmount = game.currentBet + Math.floor(pot * (0.3 + Math.random() * 0.2));
        break;
      default:
        raiseAmount = minRaise;
    }

    // Ensure minimum raise
    raiseAmount = Math.max(raiseAmount, minRaise);

    // Cap at all-in
    const maxRaise = player.chips + player.bet;
    raiseAmount = Math.min(raiseAmount, maxRaise);

    return raiseAmount;
  }

  cardValue(rank) {
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    return ranks.indexOf(rank) + 2;
  }
}

module.exports = { BotPlayer, BOT_NAMES, PERSONALITIES };
