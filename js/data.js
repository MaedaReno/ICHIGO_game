/*
 * data.js — ゲームのデータ定義(ヒーロー / カード / 敵)
 * バランス調整はここをいじるだけでOK。
 */
window.GameData = (function () {
  // ---- カード定義 ----
  // type: attack(敵に攻撃) / heal(自分回復) / block(シールド獲得) / aoe(敵全体攻撃)
  // cost: 消費する「あまみ」エナジー
  const CARDS = {
    peck:     { id: "peck",     name: "つつき",         emoji: "🐧", type: "attack", cost: 1, value: 6,  desc: "敵に 6 ダメージ" },
    combo:    { id: "combo",    name: "れんぞくつつき", emoji: "⚡", type: "attack", cost: 1, value: 3, hits: 2, desc: "敵に 3 ダメージ ×2" },
    blizzard: { id: "blizzard", name: "ふぶき",         emoji: "❄️", type: "aoe",    cost: 2, value: 5,  desc: "敵全体に 5 ダメージ" },
    milk:     { id: "milk",     name: "いちごミルク",   emoji: "🥛", type: "heal",   cost: 1, value: 6,  desc: "HP を 6 回復" },
    guard:    { id: "guard",    name: "こおりのたて",   emoji: "🛡️", type: "block",  cost: 1, value: 6,  desc: "シールド +6" },
    bigbeak:  { id: "bigbeak",  name: "だいばくちくちばし", emoji: "💥", type: "attack", cost: 2, value: 12, desc: "敵に 12 ダメージ" },
  };

  // ---- ヒーロー(プレイヤー) ----
  const HERO = {
    name: "いちごペンギン",
    emoji: "🐧",
    maxHp: 42,
    energy: 3,          // 毎ターンのあまみ
    handSize: 5,        // 毎ターン引く枚数
    // 山札(カードidを並べる。同じidを複数入れると枚数が増える)
    deck: ["peck", "peck", "peck", "combo", "combo", "milk", "guard", "guard", "blizzard", "bigbeak"],
  };

  // ---- 敵 ----
  // intents: 行動パターン(順番にループ)。type: attack / defend
  const ENEMIES = {
    mold:  { id: "mold",  name: "カビ",       emoji: "🦠", maxHp: 20,
             intents: [{ type: "attack", value: 5 }, { type: "attack", value: 7 }, { type: "defend", value: 5 }] },
    slug:  { id: "slug",  name: "ナメクジ",   emoji: "🐛", maxHp: 14,
             intents: [{ type: "attack", value: 4 }, { type: "attack", value: 4 }] },
    crow:  { id: "crow",  name: "いちご泥棒カラス", emoji: "🐦", maxHp: 24,
             intents: [{ type: "attack", value: 8 }, { type: "defend", value: 6 }, { type: "attack", value: 6 }] },
    boss:  { id: "boss",  name: "カビゴーレム王", emoji: "👹", maxHp: 55,
             intents: [{ type: "attack", value: 10 }, { type: "defend", value: 8 }, { type: "attack", value: 6 }, { type: "attack", value: 14 }] },
  };

  // マップ上の敵配置に使う「戦闘の組み合わせ」
  function encounter(kind) {
    if (kind === "boss")  return [clone(ENEMIES.boss)];
    if (kind === "elite") return [clone(ENEMIES.crow), clone(ENEMIES.slug)];
    return [clone(ENEMIES.mold), clone(ENEMIES.slug)]; // 通常戦
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  return { CARDS, HERO, ENEMIES, encounter, clone };
})();
