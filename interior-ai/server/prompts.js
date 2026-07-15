// プロンプト定義
//
// キャッシュ戦略: システムプロンプトは [固定ペルソナ+指示, 家具カタログ(cache_control付き)] の
// 順に並べ、リクエストごとに変わる内容(解析結果・テイスト・予算)はすべて user メッセージに置く。
// これでカタログを含むプレフィックスがプロンプトキャッシュに載り、2回目以降の入力コストが下がる。

export const TASTES = [
  { id: "hokuo", label: "北欧ナチュラル", desc: "明るい木目と白を基調にした温かみのある空間" },
  { id: "japandi", label: "ジャパンディ", desc: "和の静けさと北欧の機能美を融合したミニマルな空間" },
  { id: "industrial", label: "インダストリアル", desc: "スチール・レザー・古材でつくる無骨なブルックリンスタイル" },
  { id: "modern", label: "モダンミニマル", desc: "直線的でノイズのない洗練された空間" },
  { id: "hotel", label: "ホテルライク", desc: "左右対称と間接照明で非日常感を演出する上質な空間" },
  { id: "natural", label: "ナチュラルカジュアル", desc: "リネンやコットン素材でつくる肩の力が抜けた空間" },
  { id: "feminine", label: "フレンチフェミニン", desc: "淡い色調と曲線で構成する柔らかな空間" },
  { id: "family", label: "ファミリー実用", desc: "安全性・収納力・掃除のしやすさを優先した空間" },
];

// 画像解析(Haiku)用のシステムプロンプト
export const ANALYZE_SYSTEM = `あなたは建築図面と室内写真の読み取りを専門とするインテリアコーディネーターのアシスタントです。
渡された図面・写真から、部屋の構造・寸法・既存の家具・現状の問題点を正確に読み取り、指定されたJSONスキーマで出力してください。

読み取りのポイント:
- 図面からは間取り、畳数/平米、開口部(窓・ドア)の位置、動線を読み取る
- 写真からは既存家具、色調、採光、床・壁の素材、生活感の出ているポイントを読み取る
- 寸法が不明な場合は一般的な間取りから推定し、confidence を下げる
- 推測した値には必ず estimated: true の意味合いをnotesに残す`;

// 画像解析の構造化出力スキーマ
export const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    room_type: { type: "string", description: "部屋の種類(例: リビングダイニング、寝室、ワンルーム)" },
    layout: { type: "string", description: "間取り(例: 1LDK、2DK)。不明ならunknown" },
    size_estimate: { type: "string", description: "広さの推定(例: 約12畳 / 約20㎡)" },
    windows_and_doors: { type: "string", description: "開口部の位置と採光の特徴" },
    floor_wall: { type: "string", description: "床・壁の素材と色調" },
    existing_furniture: {
      type: "array",
      description: "写真・図面から確認できた既存家具",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          condition: { type: "string", description: "状態・スタイルの印象" },
          keep_or_replace: { type: "string", enum: ["keep", "replace", "remove"], description: "残す/入れ替える/撤去する の提案" }
        },
        required: ["name", "condition", "keep_or_replace"],
        additionalProperties: false
      }
    },
    current_style: { type: "string", description: "現状のインテリアテイストの分析" },
    issues: { type: "array", items: { type: "string" }, description: "現状の課題(動線、採光の活かし方、色の統一感など)" },
    opportunities: { type: "array", items: { type: "string" }, description: "この部屋のポテンシャル・活かすべき長所" },
    confidence: { type: "string", enum: ["high", "medium", "low"], description: "読み取りの確度" },
    notes: { type: "string", description: "推定を含む場合の注記" }
  },
  required: ["room_type", "layout", "size_estimate", "windows_and_doors", "floor_wall", "existing_furniture", "current_style", "issues", "opportunities", "confidence", "notes"],
  additionalProperties: false
};

// 提案生成用のペルソナ(固定・キャッシュ対象)
export const PROPOSE_PERSONA = `あなたは世界的に評価されるインテリアデザイナーです。住宅・ホテル・商業空間の受賞歴を持ち、
「その部屋に住む人の暮らしが良くなること」を最優先に、実際に購入できる市販家具だけでプランを組むことを信条としています。

提案のルール:
1. 家具の選定は、後続で渡す「家具カタログ」の中から行うこと。カタログにない品が必要な場合のみ、
   ブランドと商品ジャンルを指定した上で「カタログ外」と明記して提案してよい。
2. 部屋の寸法・動線に対して物理的に置けるサイズかを必ず検証し、根拠(通路幅60cm以上の確保など)を示すこと。
3. 既存家具の keep_or_replace 判断を尊重しつつ、デザイナーとしてより良い判断があれば理由付きで上書きしてよい。
4. 予算が指定されている場合は合計金額を予算内に収め、予算配分の考え方を説明すること。
5. 各テイストの提案は以下の構成で書くこと:
   ## テイスト名
   - **コンセプト**: 2〜3文でこの部屋にそのテイストを適用する意図
   - **カラーパレット**: ベース/メイン/アクセントの3色
   - **家具リスト**: 表形式(| 品名(ブランド) | 参考価格 | 配置場所 | 選定理由 |)
   - **レイアウトのポイント**: 配置と動線の説明
   - **合計金額**: 家具リストの合計
   - **ワンポイント**: 照明・グリーン・ファブリックなど仕上げの一手
6. 日本語で、施主に直接語りかけるプロフェッショナルな文体で書くこと。`;

export function buildProposeUserMessage({ analysis, tastes, budget, notes }) {
  const parts = [
    "以下の部屋について、指定テイストごとのコーディネート提案書を作成してください。",
    "",
    "## 部屋の解析結果",
    "```json",
    JSON.stringify(analysis, null, 2),
    "```",
    "",
    `## 希望テイスト: ${tastes.join("、")}`,
  ];
  if (budget) parts.push(`## 予算上限: ${budget}`);
  if (notes) parts.push(`## 施主からの要望メモ: ${notes}`);
  return parts.join("\n");
}
