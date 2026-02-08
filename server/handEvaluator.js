// Hand Rankings (higher = better)
const HAND_RANKS = {
  ROYAL_FLUSH: 10,
  STRAIGHT_FLUSH: 9,
  FOUR_OF_A_KIND: 8,
  FULL_HOUSE: 7,
  FLUSH: 6,
  STRAIGHT: 5,
  THREE_OF_A_KIND: 4,
  TWO_PAIR: 3,
  ONE_PAIR: 2,
  HIGH_CARD: 1,
};

const HAND_NAMES = {
  10: 'ロイヤルフラッシュ',
  9: 'ストレートフラッシュ',
  8: 'フォーカード',
  7: 'フルハウス',
  6: 'フラッシュ',
  5: 'ストレート',
  4: 'スリーカード',
  3: 'ツーペア',
  2: 'ワンペア',
  1: 'ハイカード',
};

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return shuffle(deck);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function rankValue(rank) {
  return RANKS.indexOf(rank) + 2; // 2=2, 3=3, ..., A=14
}

function cardValue(card) {
  return rankValue(card.rank);
}

// Get all 5-card combinations from 7 cards
function getCombinations(cards, k = 5) {
  if (k === 0) return [[]];
  if (cards.length < k) return [];
  const [first, ...rest] = cards;
  const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

// Evaluate a 5-card hand
function evaluate5(cards) {
  const sorted = [...cards].sort((a, b) => cardValue(b) - cardValue(a));
  const values = sorted.map(c => cardValue(c));
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight (including A-2-3-4-5 wheel)
  let isStraight = false;
  let straightHigh = values[0];

  if (
    values[0] - values[1] === 1 &&
    values[1] - values[2] === 1 &&
    values[2] - values[3] === 1 &&
    values[3] - values[4] === 1
  ) {
    isStraight = true;
    straightHigh = values[0];
  }
  // Wheel: A-2-3-4-5
  if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5; // 5-high straight
  }

  // Count ranks
  const counts = {};
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
  }
  const countEntries = Object.entries(counts)
    .map(([v, c]) => ({ value: parseInt(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  // Royal Flush
  if (isFlush && isStraight && straightHigh === 14) {
    return { rank: HAND_RANKS.ROYAL_FLUSH, tiebreakers: [14], name: HAND_NAMES[10] };
  }

  // Straight Flush
  if (isFlush && isStraight) {
    return { rank: HAND_RANKS.STRAIGHT_FLUSH, tiebreakers: [straightHigh], name: HAND_NAMES[9] };
  }

  // Four of a Kind
  if (countEntries[0].count === 4) {
    return {
      rank: HAND_RANKS.FOUR_OF_A_KIND,
      tiebreakers: [countEntries[0].value, countEntries[1].value],
      name: HAND_NAMES[8],
    };
  }

  // Full House
  if (countEntries[0].count === 3 && countEntries[1].count === 2) {
    return {
      rank: HAND_RANKS.FULL_HOUSE,
      tiebreakers: [countEntries[0].value, countEntries[1].value],
      name: HAND_NAMES[7],
    };
  }

  // Flush
  if (isFlush) {
    return { rank: HAND_RANKS.FLUSH, tiebreakers: values, name: HAND_NAMES[6] };
  }

  // Straight
  if (isStraight) {
    return { rank: HAND_RANKS.STRAIGHT, tiebreakers: [straightHigh], name: HAND_NAMES[5] };
  }

  // Three of a Kind
  if (countEntries[0].count === 3) {
    const kickers = countEntries.filter(e => e.count === 1).map(e => e.value).sort((a, b) => b - a);
    return {
      rank: HAND_RANKS.THREE_OF_A_KIND,
      tiebreakers: [countEntries[0].value, ...kickers],
      name: HAND_NAMES[4],
    };
  }

  // Two Pair
  if (countEntries[0].count === 2 && countEntries[1].count === 2) {
    const pairs = [countEntries[0].value, countEntries[1].value].sort((a, b) => b - a);
    const kicker = countEntries[2].value;
    return {
      rank: HAND_RANKS.TWO_PAIR,
      tiebreakers: [...pairs, kicker],
      name: HAND_NAMES[3],
    };
  }

  // One Pair
  if (countEntries[0].count === 2) {
    const kickers = countEntries.filter(e => e.count === 1).map(e => e.value).sort((a, b) => b - a);
    return {
      rank: HAND_RANKS.ONE_PAIR,
      tiebreakers: [countEntries[0].value, ...kickers],
      name: HAND_NAMES[2],
    };
  }

  // High Card
  return { rank: HAND_RANKS.HIGH_CARD, tiebreakers: values, name: HAND_NAMES[1] };
}

// Evaluate best 5-card hand from 7 cards
function evaluateHand(holeCards, communityCards) {
  const allCards = [...holeCards, ...communityCards];
  const combos = getCombinations(allCards, 5);

  let bestHand = null;
  let bestCards = null;

  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!bestHand || compareHands(result, bestHand) > 0) {
      bestHand = result;
      bestCards = combo;
    }
  }

  return { ...bestHand, cards: bestCards };
}

// Compare two evaluated hands. Returns >0 if a wins, <0 if b wins, 0 if tie
function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.tiebreakers.length, b.tiebreakers.length); i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i]) return a.tiebreakers[i] - b.tiebreakers[i];
  }
  return 0;
}

module.exports = {
  createDeck,
  shuffle,
  evaluateHand,
  compareHands,
  HAND_RANKS,
  HAND_NAMES,
  SUITS,
  RANKS,
};
