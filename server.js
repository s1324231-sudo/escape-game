/*
 * 授業用 generic-webapi の server.js から Express の初期化、/api/ の
 * 入出力、テンプレート置換、OpenAI 呼び出しと JSON.parse() を引用・改変。
 * Ko Fujimura, MIT (上流 README)
 * https://github.com/s1324231-sudo/generic-webapi/blob/c2cac0bc8fc0b79a539d47270c864b8637da8b38/server.js
 * 脱出ゲーム用のスキーマ、入力・出力の検証、利用制限を追加。
 */
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const app = express();
const port = process.env.PORT || 8080;
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const promptTemplate = fs.readFileSync(path.join(__dirname, 'prompt.md'), 'utf8');
const levels = ['やさしい', 'ふつう', 'むずかしい'];
const tones = ['ほのぼの', 'ミステリー', 'ちょいホラー'];
const string = { type: 'string' };
const list = items => ({ type: 'array', items });
const object = properties => ({
  type: 'object',
  required: Object.keys(properties),
  additionalProperties: false,
  properties
});
const schema = object({
  games: list(object({
    title: string,
    introduction: string,
    ending: string,
    rooms: list(object({
      title: string,
      scene: string,
      items: list(object({ name: string, clue: string })),
      question: string,
      options: list(string),
      answerIndex: { type: 'integer' },
      hint: string,
      explanation: string
    }))
  }))
});

if (process.env.RENDER === 'true') app.set('trust proxy', 1);
app.use(express.json({ limit: '4kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const nextByAddress = new Map();
let windowEnd = 0;
let requests = 0;
function allowGeneration(address) {
  const now = Date.now();
  if (now >= windowEnd) {
    windowEnd = now + 60 * 60_000;
    requests = 0;
    nextByAddress.clear();
  }
  if (requests >= 100 || now < (nextByAddress.get(address) ?? 0)) return false;
  nextByAddress.set(address, now + 5000);
  requests += 1;
  return true;
}

function fillTemplate(template, variables) {
  return template.replace(/\$\{(\w+)\}/g, (match, key) => (
    Object.hasOwn(variables, key) ? String(variables[key]) : match
  ));
}

async function callOpenAI(prompt, setting) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.OPENAI_API_KEY
    },
    body: JSON.stringify({
      model,
      store: false,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify({ setting }) }
      ],
      max_completion_tokens: 6000,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'escape_game', strict: true, schema }
      }
    }),
    signal: AbortSignal.timeout(50_000)
  });
  if (!response.ok) throw new Error('OpenAI HTTP ' + response.status);
  const result = await response.json();
  const choice = result.choices?.[0];
  if (choice?.finish_reason !== 'stop' || choice.message?.refusal) {
    throw new Error('OpenAI response was incomplete: ' + (choice?.finish_reason ?? 'unknown') + (choice?.message?.refusal ? ' (refusal)' : ''));
  }
  return JSON.parse(choice.message.content).games;
}

const isText = (value, limit) => typeof value === 'string' && !!value.trim() && value.length <= limit;
function validGame(games) {
  if (!Array.isArray(games) || games.length !== 1) return false;
  const game = games[0];
  if (!game || !isText(game.title, 25) || !isText(game.introduction, 120) || !isText(game.ending, 120) ||
      !Array.isArray(game.rooms) || game.rooms.length !== 3) return false;

  return game.rooms.every(room => {
    if (!room || !isText(room.title, 20) || !isText(room.scene, 85) ||
        !isText(room.question, 75) || !isText(room.hint, 90) || !isText(room.explanation, 100) ||
        !Array.isArray(room.items) || room.items.length !== 2 ||
        !Array.isArray(room.options) || room.options.length !== 3 ||
        !Number.isInteger(room.answerIndex) || room.answerIndex < 0 || room.answerIndex > 2) return false;
    return room.items.every(item => item && isText(item.name, 20) && isText(item.clue, 90)) &&
      new Set(room.items.map(item => item.name.trim())).size === 2 &&
      room.options.every(option => isText(option, 24)) &&
      new Set(room.options.map(option => option.trim())).size === 3;
  });
}

app.post('/api/', async (req, res) => {
  const { setting, level, tone } = req.body || {};
  if (!isText(setting, 80) || !levels.includes(level) || !tones.includes(tone)) {
    return res.status(400).json({ error: '舞台・難易度・雰囲気を確認してください。' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'サーバーにOpenAI APIキーが設定されていません。サンプルは遊べます。' });
  }
  if (!allowGeneration(req.ip)) {
    return res.status(429).json({ error: '生成リクエストの上限に達しました。時間をおいてお試しください。' });
  }
  try {
    const games = await callOpenAI(fillTemplate(promptTemplate, { level, tone }), setting.trim());
    if (!validGame(games)) {
      return res.status(422).json({ error: '遊べる形式でゲームを作れませんでした。もう一度生成してください。' });
    }
    return res.json({ title: 'ひらけ、密室。', data: games });
  } catch (error) {
    console.error('Game generation failed:', error.message);
    return res.status(502).json({ error: 'AIの応答を受け取れませんでした。時間をおいて再度お試しください。' });
  }
});

app.use((error, req, res, next) => {
  if (error.status === 400 || error.status === 413) {
    return res.status(error.status).json({ error: '入力データの形式またはサイズを確認してください。' });
  }
  next(error);
});

app.listen(port, '0.0.0.0', () => console.log('ひらけ、密室。 ポート ' + port));
