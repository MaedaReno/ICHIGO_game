/*
 * data.js — ゲームのデータ定義(ヒーロー / カード / 敵 / スキン / 作物 / 成長曲線)
 * バランス調整はここをいじるだけでOK。
 */
window.GameData = (function () {
  // ---- カード定義 ----
  const CARDS = {
    peck:     { id: "peck",     name: "つつき",         emoji: "🐧", type: "attack", cost: 1, value: 6,  desc: "敵に 6 ダメージ" },
    combo:    { id: "combo",    name: "れんぞくつつき", emoji: "⚡", type: "attack", cost: 1, value: 3, hits: 2, desc: "敵に 3 ダメージ ×2" },
    blizzard: { id: "blizzard", name: "ふぶき",         emoji: "❄️", type: "aoe",    cost: 2, value: 5,  desc: "敵全体に 5 ダメージ" },
    milk:     { id: "milk",     name: "いちごミルク",   emoji: "🥛", type: "heal",   cost: 1, value: 6,  desc: "HP を 6 回復" },
    guard:    { id: "guard",    name: "こおりのたて",   emoji: "🛡️", type: "block",  cost: 1, value: 6,  desc: "シールド +6" },
    bigbeak:  { id: "bigbeak",  name: "だいばくちくちばし", emoji: "💥", type: "attack", cost: 2, value: 12, desc: "敵に 12 ダメージ" },
  };

  // ---- ヒーロー(ベース。最大HPはレベルで上書きされる) ----
  const HERO = {
    name: "いちごペンギン",
    emoji: "🐧",
    maxHp: 42,
    energy: 3,
    handSize: 5,
    deck: ["peck", "peck", "peck", "combo", "combo", "milk", "guard", "guard", "blizzard", "bigbeak"],
  };

  // ---- 敵(level 付き。マップ上の追尾/逃走の判定に使う) ----
  const ENEMIES = {
    slug:  { id: "slug",  name: "ナメクジ",   emoji: "🐛", kind: "normal", level: 1, maxHp: 14,
             intents: [{ type: "attack", value: 4 }, { type: "attack", value: 4 }] },
    mold:  { id: "mold",  name: "カビ",       emoji: "🦠", kind: "normal", level: 1, maxHp: 20,
             intents: [{ type: "attack", value: 5 }, { type: "attack", value: 7 }, { type: "defend", value: 5 }] },
    crow:  { id: "crow",  name: "いちご泥棒カラス", emoji: "🐦", kind: "elite", level: 3, maxHp: 24,
             intents: [{ type: "attack", value: 8 }, { type: "defend", value: 6 }, { type: "attack", value: 6 }] },
    boss:  { id: "boss",  name: "カビゴーレム王", emoji: "👹", kind: "boss", level: 5, maxHp: 55,
             intents: [{ type: "attack", value: 10 }, { type: "defend", value: 8 }, { type: "attack", value: 6 }, { type: "attack", value: 14 }] },
  };

  // 戦闘の組み合わせ
  function encounter(kind) {
    if (kind === "boss")  return [clone(ENEMIES.boss)];
    if (kind === "elite") return [clone(ENEMIES.crow), clone(ENEMIES.slug)];
    return [clone(ENEMIES.mold), clone(ENEMIES.slug)];
  }

  // ---- スキン(ペンギンのオーラ色。currency: null=最初から / "berry" / "ichigo"=任意課金) ----
  const SKINS = {
    normal:     { id: "normal",     name: "ノーマル",     color: 0x8fd0ff, price: 0,  currency: null },
    strawberry: { id: "strawberry", name: "いちご",       color: 0xff5a7a, price: 30, currency: "berry" },
    mint:       { id: "mint",       name: "ミント",       color: 0x7be0b0, price: 30, currency: "berry" },
    gold:       { id: "gold",       name: "ゴールド",     color: 0xffd24a, price: 90, currency: "berry" },
    aurora:     { id: "aurora",     name: "オーロラ✨",   color: 0xb388ff, price: 5,  currency: "ichigo" }, // 任意ICHIGO
  };

  // ---- 作物(いちご栽培) ----
  const CROP = { seed: "🌱", growing: "🌿", ready: "🍓", growMs: 20000, yield: 12 };

  // ---- 成長曲線 ----
  function maxHpForLevel(lv) { return 42 + (lv - 1) * 6; }
  function xpForNext(lv)     { return 20 + (lv - 1) * 15; }
  function xpReward(kind)    { return kind === "boss" ? 60 : kind === "elite" ? 25 : 10; }
  function berryReward(kind) { return kind === "boss" ? 50 : kind === "elite" ? 15 : 4; }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  return { CARDS, HERO, ENEMIES, encounter, SKINS, CROP,
           maxHpForLevel, xpForNext, xpReward, berryReward, clone };
})();
