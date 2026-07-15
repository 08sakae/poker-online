import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";

import { MODELS, estimateCost } from "./models.js";
import {
  TASTES,
  ANALYZE_SYSTEM,
  ANALYZE_SCHEMA,
  PROPOSE_PERSONA,
  buildProposeUserMessage,
} from "./prompts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(path.join(__dirname, "catalog.json"), "utf-8"));

// ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login` プロファイルを自動解決
const client = new Anthropic();

const app = express();
app.use(express.json({ limit: "50mb" })); // base64画像を受けるため大きめに
app.use(express.static(path.join(__dirname, "..", "public")));

const MAX_IMAGES = 6;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

app.get("/api/config", (_req, res) => {
  res.json({ tastes: TASTES, tiers: Object.keys(MODELS.tiers), models: MODELS });
});

app.get("/api/catalog", (_req, res) => res.json(catalog));

// ── 1. 図面・写真の解析(Haiku 4.5 / vision + 構造化出力) ────────────────
app.post("/api/analyze", async (req, res) => {
  try {
    const { images = [], notes = "" } = req.body;
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "画像を1枚以上アップロードしてください。" });
    }
    if (images.length > MAX_IMAGES) {
      return res.status(400).json({ error: `画像は最大${MAX_IMAGES}枚までです。` });
    }

    const content = [];
    for (const img of images) {
      if (!ALLOWED_MEDIA.has(img.media_type)) {
        return res.status(400).json({ error: `未対応の画像形式です: ${img.media_type}` });
      }
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      });
    }
    content.push({
      type: "text",
      text:
        "これらの画像(図面・室内写真)を解析してください。" +
        (notes ? `\n\n施主からの補足: ${notes}` : ""),
    });

    const response = await client.messages.create({
      model: MODELS.analyze,
      max_tokens: 3000,
      system: ANALYZE_SYSTEM,
      output_config: { format: { type: "json_schema", schema: ANALYZE_SCHEMA } },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "この画像は解析できませんでした。別の画像をお試しください。" });
    }
    if (response.stop_reason === "max_tokens") {
      return res.status(502).json({ error: "解析結果が長すぎて途中で切れました。画像の枚数を減らしてお試しください。" });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const analysis = JSON.parse(textBlock.text);
    res.json({ analysis, cost: estimateCost(MODELS.analyze, response.usage) });
  } catch (err) {
    handleApiError(err, res);
  }
});

// ── 2. コーディネート提案の生成(プラン別モデル、SSEストリーミング) ─────────
app.post("/api/propose", async (req, res) => {
  const { analysis, tastes = [], budget = "", notes = "", tier = "standard" } = req.body;
  if (!analysis) return res.status(400).json({ error: "先に解析を実行してください。" });
  if (!Array.isArray(tastes) || tastes.length === 0) {
    return res.status(400).json({ error: "テイストを1つ以上選択してください。" });
  }
  const model = MODELS.tiers[tier];
  if (!model) return res.status(400).json({ error: `不明なプランです: ${tier}` });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  // カタログをキャッシュ対象ブロックとして system の末尾に配置。
  // ペルソナ+カタログのプレフィックスが不変なので、2回目以降はキャッシュ読み取りになる。
  const system = [
    { type: "text", text: PROPOSE_PERSONA },
    {
      type: "text",
      text: `## 家具カタログ(この中から選定すること)\n${JSON.stringify(catalog, null, 1)}`,
      cache_control: { type: "ephemeral" },
    },
  ];
  const messages = [
    { role: "user", content: buildProposeUserMessage({ analysis, tastes, budget, notes }) },
  ];

  try {
    let stream;
    if (tier === "master") {
      // Fable 5: thinking は常時ON(パラメータ指定不可)。安全分類器による
      // refusal に備えて Opus 4.8 へのサーバーサイドフォールバックを有効化。
      stream = client.beta.messages.stream({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-06-01"],
        fallbacks: [{ model: "claude-opus-4-8" }],
        output_config: { effort: "high" },
        system,
        messages,
      });
    } else if (tier === "premium") {
      // Opus 4.8: adaptive thinking は明示的に指定しないと無効
      stream = client.messages.stream({
        model,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system,
        messages,
      });
    } else {
      // Sonnet 5: adaptive thinking がデフォルトで有効。effort medium でコストを抑える
      stream = client.messages.stream({
        model,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system,
        messages,
      });
    }

    stream.on("text", (delta) => send({ type: "delta", text: delta }));

    const final = await stream.finalMessage();

    if (final.stop_reason === "refusal") {
      send({ type: "error", message: "この内容の提案は生成できませんでした。要望メモの内容を変えてお試しください。" });
    } else {
      const servedBy = final.model; // フォールバック発動時は実際に応答したモデル
      send({
        type: "done",
        model: servedBy,
        stop_reason: final.stop_reason,
        cost: estimateCost(normalizeModelId(servedBy), final.usage),
      });
    }
  } catch (err) {
    send({ type: "error", message: userFacingError(err) });
  } finally {
    res.end();
  }
});

// レスポンスの model はスナップショットIDのことがあるため、料金表のキーに寄せる
function normalizeModelId(id) {
  if (!id) return id;
  if (id.startsWith("claude-fable-5")) return "claude-fable-5";
  if (id.startsWith("claude-opus-4-8")) return "claude-opus-4-8";
  if (id.startsWith("claude-sonnet-5")) return "claude-sonnet-5";
  if (id.startsWith("claude-haiku-4-5")) return "claude-haiku-4-5";
  return id;
}

function userFacingError(err) {
  if (
    err instanceof Anthropic.AuthenticationError ||
    /authentication method/i.test(err?.message || "") ||
    /authentication method/i.test(err?.cause?.message || "")
  ) {
    return "APIキーが設定されていません。サーバーの環境変数 ANTHROPIC_API_KEY を設定して再起動してください。";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "アクセスが集中しています。しばらく待ってから再実行してください。";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `リクエストが不正です: ${err.message}`;
  }
  if (err instanceof Anthropic.APIError) {
    return `APIエラー(${err.status}): ${err.message}`;
  }
  console.error(err);
  return "サーバー内部でエラーが発生しました。";
}

function handleApiError(err, res) {
  const message = userFacingError(err);
  const status =
    err instanceof Anthropic.AuthenticationError ? 500 :
    err instanceof Anthropic.RateLimitError ? 429 :
    err instanceof Anthropic.BadRequestError ? 400 :
    err instanceof Anthropic.APIError ? 502 : 500;
  res.status(status).json({ error: message });
}

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`Interior AI: http://localhost:${PORT}`);
});
