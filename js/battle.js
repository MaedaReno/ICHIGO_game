/*
 * battle.js — ターン制カードバトル(DOM/CSS・自己完結)
 * 使い方:
 *   Battle.start({ hero, enemies, onEnd });
 *     hero    : { name, emoji, maxHp, hp, energy, handSize, deck:[cardId...] }  ← hp を書き換えて持ち越す
 *     enemies : GameData.encounter(kind) の配列
 *     onEnd   : (result) => {}   result は "win" | "lose"
 */
window.Battle = (function () {
  const C = () => window.GameData.CARDS;
  let S = null; // 現在の戦闘状態

  // ---- スタイルを1度だけ注入 ----
  function injectStyle() {
    if (document.getElementById("battle-style")) return;
    const css = `
    #battle { position:fixed; inset:0; z-index:1000; display:none; flex-direction:column;
      background:linear-gradient(180deg,#3a2233,#5a2f45); color:#fff; font-family:system-ui,sans-serif;
      padding:16px; gap:12px; overflow:auto; }
    #battle.show { display:flex; }
    #battle .enemies { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; min-height:120px; }
    #battle .unit { background:rgba(0,0,0,.25); border-radius:14px; padding:10px 14px; text-align:center; min-width:120px; }
    #battle .unit.enemy { cursor:default; border:2px solid transparent; }
    #battle .unit.enemy.targetable { cursor:pointer; border-color:#ffd24a; box-shadow:0 0 14px #ffd24a; }
    #battle .unit.enemy.dead { opacity:.25; filter:grayscale(1); }
    #battle .emoji { font-size:2.4rem; line-height:1; }
    #battle .nm { font-weight:700; margin-top:2px; }
    #battle .intent { font-size:.8rem; margin-top:4px; background:#00000040; border-radius:8px; padding:2px 6px; display:inline-block; }
    #battle .hpbar { height:10px; background:#00000055; border-radius:6px; overflow:hidden; margin-top:6px; }
    #battle .hpfill { height:100%; background:linear-gradient(90deg,#ff5a7a,#ff8fa3); transition:width .25s; }
    #battle .hptxt { font-size:.78rem; margin-top:2px; }
    #battle .shield { font-size:.78rem; color:#8fd0ff; }
    #battle .heroRow { display:flex; justify-content:center; }
    #battle .hero { border:2px solid #ffd24a55; }
    #battle .midbar { display:flex; align-items:center; justify-content:center; gap:16px; }
    #battle .energy { font-size:1.1rem; font-weight:700; background:#ffb400; color:#5a2f45; border-radius:20px; padding:6px 14px; }
    #battle .endbtn { background:#fff; color:#5a2f45; border:0; border-radius:10px; padding:10px 20px; font-weight:700; cursor:pointer; }
    #battle .hand { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:auto; padding-top:8px; }
    #battle .card { width:110px; background:#fff; color:#2a2a2a; border-radius:12px; padding:10px; cursor:pointer;
      box-shadow:0 4px 10px #0006; border:3px solid transparent; transition:transform .1s; text-align:center; }
    #battle .card:hover { transform:translateY(-6px); }
    #battle .card.selected { border-color:#ffd24a; transform:translateY(-10px); }
    #battle .card.disabled { opacity:.45; cursor:not-allowed; }
    #battle .card .cemoji { font-size:1.6rem; }
    #battle .card .cname { font-weight:700; font-size:.9rem; margin:2px 0; }
    #battle .card .cdesc { font-size:.72rem; color:#666; }
    #battle .card .ccost { position:relative; display:inline-block; background:#ffb400; color:#fff; border-radius:50%;
      width:22px; height:22px; line-height:22px; font-weight:700; font-size:.85rem; margin-bottom:2px; }
    #battle .log { text-align:center; min-height:1.4em; font-size:.9rem; color:#ffe6ef; }
    #battle .banner { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column;
      background:#000000aa; font-size:2rem; font-weight:800; gap:16px; z-index:5; }
    #battle .banner button { font-size:1rem; padding:10px 22px; border:0; border-radius:10px; cursor:pointer; background:#ffd24a; }
    `;
    const el = document.createElement("style");
    el.id = "battle-style"; el.textContent = css;
    document.head.appendChild(el);
  }

  function ensureRoot() {
    let root = document.getElementById("battle");
    if (!root) {
      root = document.createElement("div");
      root.id = "battle";
      document.body.appendChild(root);
    }
    return root;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function start({ hero, enemies, onEnd }) {
    injectStyle();
    const root = ensureRoot();
    root.classList.add("show");

    S = {
      hero, enemies, onEnd,
      draw: shuffle(hero.deck), hand: [], discard: [],
      energy: hero.energy, selected: -1, busy: false, over: false,
    };
    hero.block = 0;
    enemies.forEach((e) => { e.hp = e.hp ?? e.maxHp; e.block = 0; e.intentIdx = 0; });
    newPlayerTurn(true);
  }

  function drawCards(n) {
    for (let i = 0; i < n; i++) {
      if (S.draw.length === 0) { S.draw = shuffle(S.discard); S.discard = []; }
      if (S.draw.length === 0) break;
      S.hand.push(S.draw.pop());
    }
  }

  function newPlayerTurn(first) {
    S.hero.block = 0;
    S.energy = S.hero.energy;
    S.discard.push(...S.hand); S.hand = [];
    drawCards(S.hero.handSize);
    S.selected = -1;
    render(first ? "戦闘開始! カードを選ぼう。" : "あなたのターン。");
  }

  function currentIntent(e) { return e.intents[e.intentIdx % e.intents.length]; }
  function aliveEnemies() { return S.enemies.filter((e) => e.hp > 0); }

  function clickCard(idx) {
    if (S.busy || S.over) return;
    const card = C()[S.hand[idx]];
    if (card.cost > S.energy) { flashLog("あまみが足りない!"); return; }
    if (card.type === "attack") {
      // 単体攻撃 → ターゲット選択(敵1体なら自動)
      const alive = aliveEnemies();
      if (alive.length === 1) { playCard(idx, alive[0]); }
      else { S.selected = (S.selected === idx ? -1 : idx); render(S.selected >= 0 ? "攻撃する敵を選んでね。" : "あなたのターン。"); }
    } else {
      playCard(idx, null); // heal/block/aoe は即時
    }
  }

  function clickEnemy(enemy) {
    if (S.busy || S.over || S.selected < 0 || enemy.hp <= 0) return;
    playCard(S.selected, enemy);
  }

  function playCard(idx, target) {
    const id = S.hand[idx];
    const card = C()[id];
    if (!card || card.cost > S.energy) return;
    S.energy -= card.cost;
    S.hand.splice(idx, 1);
    S.discard.push(id);
    S.selected = -1;

    let msg = "";
    if (card.type === "attack") {
      const hits = card.hits || 1;
      for (let h = 0; h < hits; h++) dealToEnemy(target, card.value);
      msg = `${card.name}! ${target.name} に ${card.value}${hits > 1 ? "×" + hits : ""} ダメージ`;
    } else if (card.type === "aoe") {
      aliveEnemies().forEach((e) => dealToEnemy(e, card.value));
      msg = `${card.name}! 敵全体に ${card.value} ダメージ`;
    } else if (card.type === "heal") {
      S.hero.hp = Math.min(S.hero.maxHp, S.hero.hp + card.value);
      msg = `${card.name}! HP を ${card.value} 回復`;
    } else if (card.type === "block") {
      S.hero.block += card.value;
      msg = `${card.name}! シールド +${card.value}`;
    }

    if (aliveEnemies().length === 0) { render(msg); return finish("win"); }
    render(msg);
  }

  function dealToEnemy(e, dmg) {
    const blocked = Math.min(e.block, dmg);
    e.block -= blocked;
    e.hp = Math.max(0, e.hp - (dmg - blocked));
  }

  async function endTurn() {
    if (S.busy || S.over) return;
    S.busy = true; S.selected = -1;
    render("敵のターン…");
    await sleep(500);
    for (const e of S.enemies) {
      if (e.hp <= 0) continue;
      const it = currentIntent(e);
      if (it.type === "attack") {
        const blocked = Math.min(S.hero.block, it.value);
        S.hero.block -= blocked;
        S.hero.hp = Math.max(0, S.hero.hp - (it.value - blocked));
        render(`${e.name} の攻撃! ${it.value - blocked} ダメージ`);
      } else if (it.type === "defend") {
        e.block += it.value;
        render(`${e.name} は身を固めた(シールド +${it.value})`);
      }
      e.intentIdx++;
      await sleep(650);
      if (S.hero.hp <= 0) { S.busy = false; return finish("lose"); }
    }
    S.busy = false;
    newPlayerTurn(false);
  }

  function finish(result) {
    if (S.over) return;
    S.over = true;
    const root = ensureRoot();
    const banner = document.createElement("div");
    banner.className = "banner";
    banner.innerHTML = `<div>${result === "win" ? "🎉 勝利!" : "💀 やられた…"}</div>`;
    const btn = document.createElement("button");
    btn.textContent = result === "win" ? "探索にもどる" : "タイトルへ";
    btn.onclick = () => {
      root.classList.remove("show");
      root.innerHTML = "";
      const cb = S.onEnd; S = null;
      cb && cb(result);
    };
    banner.appendChild(btn);
    root.appendChild(banner);
  }

  // ---- 描画 ----
  function render(log) {
    const root = ensureRoot();
    const enemiesHtml = S.enemies.map((e, i) => {
      const it = currentIntent(e);
      const intentTxt = e.hp <= 0 ? "" :
        (it.type === "attack" ? `⚔️ ${it.value}` : `🛡️ ${it.value}`);
      const targetable = S.selected >= 0 && e.hp > 0 ? "targetable" : "";
      const dead = e.hp <= 0 ? "dead" : "";
      return `<div class="unit enemy ${targetable} ${dead}" data-ei="${i}">
        <div class="emoji">${e.emoji}</div>
        <div class="nm">${e.name}</div>
        ${e.hp > 0 ? `<div class="intent">${intentTxt}</div>` : ""}
        <div class="hpbar"><div class="hpfill" style="width:${(e.hp / e.maxHp) * 100}%"></div></div>
        <div class="hptxt">${e.hp}/${e.maxHp}${e.block ? ` 🛡️${e.block}` : ""}</div>
      </div>`;
    }).join("");

    const h = S.hero;
    const heroHtml = `<div class="unit hero">
        <div class="emoji">${h.emoji}</div>
        <div class="nm">${h.name}</div>
        <div class="hpbar"><div class="hpfill" style="width:${(h.hp / h.maxHp) * 100}%"></div></div>
        <div class="hptxt">${h.hp}/${h.maxHp} ${h.block ? `<span class="shield">🛡️${h.block}</span>` : ""}</div>
      </div>`;

    const handHtml = S.hand.map((id, i) => {
      const c = C()[id];
      const disabled = c.cost > S.energy ? "disabled" : "";
      const sel = S.selected === i ? "selected" : "";
      return `<div class="card ${disabled} ${sel}" data-ci="${i}">
        <div class="ccost">${c.cost}</div>
        <div class="cemoji">${c.emoji}</div>
        <div class="cname">${c.name}</div>
        <div class="cdesc">${c.desc}</div>
      </div>`;
    }).join("");

    root.innerHTML = `
      <div class="log">${log || ""}</div>
      <div class="enemies">${enemiesHtml}</div>
      <div class="heroRow">${heroHtml}</div>
      <div class="midbar">
        <span class="energy">あまみ ${S.energy}/${h.energy}</span>
        <button class="endbtn">ターン終了</button>
      </div>
      <div class="hand">${handHtml}</div>
    `;
    root.querySelectorAll(".card").forEach((el) =>
      el.addEventListener("click", () => clickCard(+el.dataset.ci)));
    root.querySelectorAll(".unit.enemy").forEach((el) =>
      el.addEventListener("click", () => clickEnemy(S.enemies[+el.dataset.ei])));
    root.querySelector(".endbtn")?.addEventListener("click", endTurn);
  }

  let logTimer = null;
  function flashLog(text) {
    const el = ensureRoot().querySelector(".log");
    if (!el) return;
    el.textContent = text;
    clearTimeout(logTimer);
    logTimer = setTimeout(() => { const l = ensureRoot().querySelector(".log"); if (l) l.textContent = "あなたのターン。"; }, 1200);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  return { start };
})();
