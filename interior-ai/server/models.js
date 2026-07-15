// モデルルーティングと料金計算
//
// トークンコスト最適化の方針:
//   - 画像解析(図面・写真の構造化読み取り)は最安の Haiku 4.5 に振り分ける
//   - 提案文の生成は品質とコストのバランスが良い Sonnet 5 を標準にする
//   - 上位プランとして Opus 4.8 / Fable 5 を選択可能にする
//   - 家具カタログはプロンプトキャッシュに載せ、2回目以降の読み取りを約1/10コストにする

export const MODELS = {
  // 図面・写真の解析(vision + 構造化出力)。最も呼び出し回数が多いので最安モデル。
  analyze: "claude-haiku-4-5",

  // 提案生成の各プラン
  tiers: {
    standard: "claude-sonnet-5",
    premium: "claude-opus-4-8",
    master: "claude-fable-5",
  },
};

// USD / 1M トークン(2026-06 時点の定価)
export const PRICING = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-5": { input: 3.0, output: 15.0 }, // 2026-08-31 まで $2/$10 の導入価格
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-fable-5": { input: 10.0, output: 50.0 },
};

const CACHE_WRITE_MULT = 1.25; // 5分TTLキャッシュ書き込み
const CACHE_READ_MULT = 0.1; // キャッシュ読み取り

// usage オブジェクトから概算コスト(USD)を計算する
export function estimateCost(model, usage) {
  const p = PRICING[model];
  if (!p || !usage) return null;
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  const usd =
    (inTok * p.input +
      cacheWrite * p.input * CACHE_WRITE_MULT +
      cacheRead * p.input * CACHE_READ_MULT +
      outTok * p.output) /
    1_000_000;

  return {
    model,
    input_tokens: inTok,
    output_tokens: outTok,
    cache_creation_input_tokens: cacheWrite,
    cache_read_input_tokens: cacheRead,
    usd: Math.round(usd * 10000) / 10000,
  };
}
