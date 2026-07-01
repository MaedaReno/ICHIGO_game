/*
 * ============================================================
 *  このファイルは何?
 * ------------------------------------------------------------
 *  battle.js — ターン制カードバトルの本体(画面は DOM/CSS だけで作る自己完結ファイル)
 *
 *  「1画面ぶんの戦闘」をまるごと担当します。プレイヤー(hero)が手札のカードを選んで
 *  敵(enemies)を攻撃し、敵もターンごとに反撃してくる…という流れをここで処理します。
 *  画面のHTMLとCSSもこのファイルの中で作るので、他ファイルに依存しすぎず単体で動きます。
 *
 *  使い方(外から呼ぶのはこの1つだけ):
 *    Battle.start({ hero, enemies, onEnd });
 *      hero    : { name, emoji, maxHp, hp, energy, handSize, deck:[cardId...] }  ← hp を書き換えて持ち越す
 *      enemies : GameData.encounter(kind) の配列
 *      onEnd   : (result) => {}   result は "win" | "lose"   戦闘が終わったら呼ばれる関数
 * ============================================================
 */

// window.Battle に「戦闘機能ひとかたまり」を入れる。
// 全体を (function(){ ... })() で囲むのは「即時実行関数」= 定義したその場ですぐ実行する書き方。
// こうすると中で作った変数を外から触れなくして、名前の衝突を防げる(必要な start だけ最後に公開する)。
window.Battle = (function () {
  // C は「カードの定義データ」を取り出す関数(呼ぶたびに最新を返す)。
  // () => ... は「アロー関数」= function を短く書いた書き方。
  const C = () => window.GameData.CARDS;
  let S = null; // 現在の戦闘状態(State)をここに1つだけ持つ。戦闘中の全情報がここに入る

  // ============================================================
  //  スタイル注入 — 戦闘画面の見た目(CSS)をページに1度だけ追加する
  // ============================================================
  function injectStyle() {
    // すでに追加済み(同じ id の <style> がある)なら二重に入れないように何もせず終了。
    if (document.getElementById("battle-style")) return;
    // css はスタイルの中身。`...` はテンプレートリテラル = 改行や ${} を含められる文字列。
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
    #battle .unit { position:relative; }                 /* ダメージ数字を上に重ねるための基準 */
    #battle .portrait { width:3rem; height:3rem; object-fit:contain; }  /* アニメ画像の表示サイズ */
    #battle .float { position:absolute; left:50%; top:6px; transform:translateX(-50%); font-weight:800; font-size:1.15rem; pointer-events:none; text-shadow:0 1px 3px #000; animation:floatUp .9s ease-out forwards; }
    #battle .float.dmg { color:#ff6b6b; }                /* ダメージは赤 */
    #battle .float.heal { color:#7bed9f; }               /* 回復は緑 */
    @keyframes floatUp { to { transform:translate(-50%,-40px); opacity:0; } } /* 上へ浮かんで消える */
    #battle.shake { animation:shake .3s; }               /* 被弾時に画面を揺らす */
    @keyframes shake { 0%,100%{transform:translate(0,0);} 25%{transform:translate(-6px,0);} 75%{transform:translate(6px,0);} }
    `;
    // <style> タグを新しく作り、上で書いた css を中身にして <head> に差し込む。
    const el = document.createElement("style");
    el.id = "battle-style"; el.textContent = css;
    document.head.appendChild(el);
  }

  // ============================================================
  //  土台の用意 — 戦闘画面を入れる箱(div#battle)を確保する
  // ============================================================
  function ensureRoot() {
    // すでに #battle があればそれを使い、無ければ作って <body> に追加する。
    let root = document.getElementById("battle");
    if (!root) {
      root = document.createElement("div");
      root.id = "battle";
      document.body.appendChild(root);
    }
    return root; // 以降はこの root の中に戦闘画面を描いていく
  }

  // ============================================================
  //  シャッフル — 配列をランダムに並べ替える(山札を混ぜる用)
  // ============================================================
  function shuffle(arr) {
    const a = arr.slice(); // slice() で元の配列を壊さないようコピーを作る
    // 後ろから順に、ランダムな位置と入れ替えていく(フィッシャー・イェーツ法)。
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); // 0〜i のランダムな番号
      [a[i], a[j]] = [a[j], a[i]];                   // a[i] と a[j] を同時に交換
    }
    return a;
  }

  // ============================================================
  //  見た目ヘルパ — キャラ画像(あれば)/ ダメージ数字 / 画面揺れ
  // ============================================================
  // artOK … 画像が存在するidを覚えておく箱({penguin:true} など)。
  const artOK = {};
  // probeArt … 画像を1回だけ試し読みして「あるか無いか」を記録(戦闘中に404を連発させないため)。
  function probeArt(ids) {
    ids.forEach((id) => {
      if (id in artOK) return;                // 調べ済みならスキップ
      const im = new Image();
      im.onload = () => (artOK[id] = true);   // 読めた=画像あり
      im.onerror = () => (artOK[id] = false); // 読めない=画像なし(絵文字を使う)
      im.src = "assets/char/" + id + ".png";
    });
  }
  // charHtml … キャラの見た目HTML。画像があれば<img>、無ければ絵文字の<div>を返す。
  function charHtml(id, emoji) {
    if (artOK[id]) return `<img class="portrait" src="assets/char/${id}.png" alt="">`;
    return `<div class="emoji">${emoji}</div>`;
  }
  // floatEl … 指定要素の上に「-6」などの数字をふわっと浮かせる小道具。
  function floatEl(el, txt, cls) {
    if (!el) return;
    const f = document.createElement("div");
    f.className = "float " + cls; f.textContent = txt;
    el.appendChild(f);
    setTimeout(() => f.remove(), 900); // 0.9秒後に消す
  }
  function floatEnemy(i, txt) { floatEl(ensureRoot().querySelectorAll(".unit.enemy")[i], txt, "dmg"); } // i番目の敵の上に
  function floatHero(txt, cls) { floatEl(ensureRoot().querySelector(".unit.hero"), txt, cls); }          // 味方の上に
  function shake() { const r = ensureRoot(); r.classList.add("shake"); setTimeout(() => r.classList.remove("shake"), 300); } // 画面を揺らす

  // ============================================================
  //  戦闘開始 — 外部から呼ばれる入口。状態を初期化して1ターン目を始める
  // ============================================================
  // 引数の { hero, enemies, onEnd } は「分割代入」= 渡されたオブジェクトから必要な値を取り出す書き方。
  function start({ hero, enemies, onEnd }) {
    injectStyle();                 // 見た目のCSSを用意
    probeArt(["penguin", ...enemies.map((e) => e.id)]); // 出てくるキャラの画像有無を先に確認(...はスプレッド=配列を展開)
    const root = ensureRoot();     // 戦闘画面の箱を用意
    root.classList.add("show");    // "show" クラスを付けて画面を表示状態にする

    // 戦闘状態 S をまとめて初期化する。
    S = {
      hero, enemies, onEnd,
      draw: shuffle(hero.deck), hand: [], discard: [], // draw=山札(シャッフル済) / hand=手札 / discard=捨て札
      energy: hero.energy, selected: -1, busy: false, over: false, // selected=選択中カード(-1は未選択), busy=処理中, over=決着済み
    };
    hero.block = 0; // プレイヤーのシールドを0に
    // 敵ごとに初期値を設定。e.hp ?? e.maxHp は「hp が未設定(null/undefined)なら maxHp を使う」(?? はNull合体演算子)。
    enemies.forEach((e) => { e.hp = e.hp ?? e.maxHp; e.block = 0; e.intentIdx = 0; });
    newPlayerTurn(true); // 最初のプレイヤーターンを開始(true = 戦闘開始の1回目)
  }

  // ============================================================
  //  カードを引く — 山札から n 枚を手札に移す(尽きたら捨て札を混ぜ直す)
  // ============================================================
  function drawCards(n) {
    for (let i = 0; i < n; i++) {
      // 山札が空なら、捨て札をシャッフルして新しい山札にする(リサイクル)。
      if (S.draw.length === 0) { S.draw = shuffle(S.discard); S.discard = []; }
      if (S.draw.length === 0) break;   // それでも0枚なら引けないので中断
      S.hand.push(S.draw.pop());        // 山札の一番上(末尾)を取って手札に加える
    }
  }

  // ============================================================
  //  プレイヤーのターン開始 — シールド/あまみをリセットし手札を引き直す
  // ============================================================
  // first: true なら戦闘のいちばん最初のターン(ログ表示だけ変える)。
  function newPlayerTurn(first) {
    S.hero.block = 0;             // 前ターンのシールドは持ち越さない
    S.energy = S.hero.energy;     // あまみ(エネルギー)を満タンに戻す
    S.discard.push(...S.hand); S.hand = []; // 残った手札を全部捨て札へ(...は配列を展開するスプレッド構文)
    drawCards(S.hero.handSize);   // 決められた枚数だけ引き直す
    S.selected = -1;              // カード選択状態を解除
    render(first ? "戦闘開始! カードを選ぼう。" : "あなたのターン。"); // 画面を描き直す
  }

  // 敵が今から取る行動(intent)を返す。% で割った余りを使い、行動リストをぐるぐる繰り返す。
  function currentIntent(e) { return e.intents[e.intentIdx % e.intents.length]; }
  // 生きている(hp > 0)敵だけを取り出して返す。filter は条件に合う要素だけ集める。
  function aliveEnemies() { return S.enemies.filter((e) => e.hp > 0); }

  // ============================================================
  //  手札クリック — カードをタップしたときの処理(攻撃は狙う敵を決める)
  // ============================================================
  function clickCard(idx) {
    if (S.busy || S.over) return; // 敵のターン処理中や決着後は操作させない
    const card = C()[S.hand[idx]]; // クリックされた手札のカード定義を取り出す
    if (card.cost > S.energy) { flashLog("あまみが足りない!"); return; } // コスト不足なら弾く
    if (card.type === "attack") {
      // 単体攻撃 → ターゲット選択(敵1体なら自動)
      const alive = aliveEnemies();
      if (alive.length === 1) { playCard(idx, alive[0]); } // 敵が1体だけなら自動でその敵に
      // 敵が複数なら、このカードを「選択中」にして敵クリック待ちにする(同じカードを再クリックで選択解除)。
      else { S.selected = (S.selected === idx ? -1 : idx); render(S.selected >= 0 ? "攻撃する敵を選んでね。" : "あなたのターン。"); }
    } else {
      playCard(idx, null); // heal/block/aoe はターゲット不要なので即時に使う
    }
  }

  // ============================================================
  //  敵クリック — 攻撃カード選択中に敵をタップしたらその敵へ攻撃実行
  // ============================================================
  function clickEnemy(enemy) {
    // 処理中/決着後/カード未選択/死んでる敵、のいずれかなら何もしない。
    if (S.busy || S.over || S.selected < 0 || enemy.hp <= 0) return;
    playCard(S.selected, enemy); // 選択中のカードをこの敵に対して使う
  }

  // ============================================================
  //  カードを使う — コストを払い、種類ごとに効果を適用して手札→捨て札へ
  // ============================================================
  // idx: 使う手札の番号 / target: 攻撃対象の敵(攻撃以外は null)。
  function playCard(idx, target) {
    const id = S.hand[idx];
    const card = C()[id];
    if (!card || card.cost > S.energy) return; // カードが無い/コスト不足なら中断
    S.energy -= card.cost;   // あまみを消費
    S.hand.splice(idx, 1);   // 手札からこのカードを取り除く
    S.discard.push(id);      // 捨て札に入れる
    S.selected = -1;         // 選択状態を解除

    let msg = ""; // 画面下に出すログ文。テンプレートリテラル `${...}` で値を埋め込む
    if (card.type === "attack") {                 // 単体攻撃
      const hits = card.hits || 1;                // 連続ヒット数(未指定なら1回)
      for (let h = 0; h < hits; h++) dealToEnemy(target, card.value); // 回数ぶんダメージ
      msg = `${card.name}! ${target.name} に ${card.value}${hits > 1 ? "×" + hits : ""} ダメージ`;
    } else if (card.type === "aoe") {             // 全体攻撃
      aliveEnemies().forEach((e) => dealToEnemy(e, card.value)); // 生きてる敵全員に
      msg = `${card.name}! 敵全体に ${card.value} ダメージ`;
    } else if (card.type === "heal") {            // 回復
      S.hero.hp = Math.min(S.hero.maxHp, S.hero.hp + card.value); // maxHp を超えないように
      msg = `${card.name}! HP を ${card.value} 回復`;
    } else if (card.type === "block") {           // 防御(シールド獲得)
      S.hero.block += card.value;
      msg = `${card.name}! シールド +${card.value}`;
    }

    // ダメージ/回復の数字を、描画のあとにキャラの上へ浮かせる関数(render後に呼ぶ必要がある)
    const doFloat = () => {
      if (card.type === "attack") floatEnemy(S.enemies.indexOf(target), "-" + (card.value * (card.hits || 1)));
      else if (card.type === "aoe") S.enemies.forEach((e, i) => floatEnemy(i, "-" + card.value));
      else if (card.type === "heal") floatHero("+" + card.value, "heal");
    };

    // 敵が全滅したら勝ち。ログを出してから finish("win") で締める。
    if (aliveEnemies().length === 0) { render(msg); doFloat(); return finish("win"); }
    render(msg); doFloat(); // まだ敵が残っていれば画面を更新し、数字を浮かせる
  }

  // ============================================================
  //  ダメージ計算 — 敵1体へのダメージ。まずシールドで減らしてから hp を削る
  // ============================================================
  function dealToEnemy(e, dmg) {
    const blocked = Math.min(e.block, dmg); // シールドで防げる量(ダメージとシールドの小さい方)
    e.block -= blocked;                      // 防いだぶんシールドを減らす
    e.hp = Math.max(0, e.hp - (dmg - blocked)); // 残りを hp から引く。Math.max で0未満にはしない
  }

  // ============================================================
  //  敵のターン — 敵が順番に行動する。間を置きながら演出する(非同期処理)
  // ============================================================
  // async を付けた関数の中では await が使える。await は「その処理が終わるまで待つ」の意味。
  // ここでは sleep(待ち時間)を待って、1体ずつ順番に動く演出をしている。
  async function endTurn() {
    if (S.busy || S.over) return;          // 二重実行や決着後は防ぐ
    S.busy = true; S.selected = -1;        // 処理中フラグを立て、カード選択も解除
    render("敵のターン…");
    await sleep(500);                      // 少し待ってから開始(テンポ調整)
    for (const e of S.enemies) {           // 敵を先頭から1体ずつ
      if (e.hp <= 0) continue;             // 倒れている敵は飛ばす
      const it = currentIntent(e);         // この敵が今取る行動
      if (it.type === "attack") {          // 攻撃してくる場合
        const blocked = Math.min(S.hero.block, it.value); // プレイヤーのシールドで防げる量
        S.hero.block -= blocked;
        S.hero.hp = Math.max(0, S.hero.hp - (it.value - blocked)); // 残りぶんHPを削る
        render(`${e.name} の攻撃! ${it.value - blocked} ダメージ`);
        if (it.value - blocked > 0) { floatHero("-" + (it.value - blocked), "dmg"); shake(); } // ダメージ数字+画面揺れ
      } else if (it.type === "defend") {   // 守りを固める場合
        e.block += it.value;
        render(`${e.name} は身を固めた(シールド +${it.value})`);
      }
      e.intentIdx++;                       // 次に取る行動へ進める
      await sleep(650);                    // 1体動くごとに少し待つ
      if (S.hero.hp <= 0) { S.busy = false; return finish("lose"); } // HPが0になったら負け
    }
    S.busy = false;         // 処理中フラグを下ろす
    newPlayerTurn(false);   // 敵の行動が終わったのでプレイヤーのターンへ戻す
  }

  // ============================================================
  //  決着 — 勝敗バナーを出し、ボタンで戦闘を閉じて onEnd を呼ぶ
  // ============================================================
  function finish(result) {
    if (S.over) return;   // すでに決着済みなら二重に出さない
    S.over = true;        // 決着フラグを立てる(以降の操作を止める)
    const root = ensureRoot();
    // 画面全体を覆う結果バナーを作る。
    const banner = document.createElement("div");
    banner.className = "banner";
    banner.innerHTML = `<div>${result === "win" ? "🎉 勝利!" : "💀 やられた…"}</div>`;
    const btn = document.createElement("button");
    btn.textContent = result === "win" ? "探索にもどる" : "タイトルへ";
    // ボタンが押されたときの処理。onclick に関数を入れておくとクリック時に実行される。
    btn.onclick = () => {
      root.classList.remove("show"); // 画面を隠す
      root.innerHTML = "";           // 中身を空に(次の戦闘に備えて掃除)
      const cb = S.onEnd; S = null;  // onEnd を控えてから状態 S を破棄(片付けてからコールバック)
      cb && cb(result);              // onEnd が渡されていれば結果("win"/"lose")を渡して呼ぶ
    };
    banner.appendChild(btn);
    root.appendChild(banner);
  }

  // ============================================================
  //  描画 — 現在の状態 S を見て、戦闘画面のHTMLを毎回まるごと作り直す
  // ============================================================
  // log: 画面上部に出すメッセージ。状態が変わるたびに render を呼んで画面を更新する。
  function render(log) {
    const root = ensureRoot();
    // 敵1体ずつをHTML文字列に変換する。map は配列を1対1で別の配列に変換する関数。
    const enemiesHtml = S.enemies.map((e, i) => {
      const it = currentIntent(e); // この敵の行動予告(intent)
      // 生きていれば「⚔️数値(攻撃)」か「🛡️数値(防御)」を、倒れていれば空文字を表示。
      const intentTxt = e.hp <= 0 ? "" :
        (it.type === "attack" ? `⚔️ ${it.value}` : `🛡️ ${it.value}`);
      // 攻撃カード選択中(selected>=0)で生きている敵には targetable クラスを付けて狙える見た目にする。
      const targetable = S.selected >= 0 && e.hp > 0 ? "targetable" : "";
      const dead = e.hp <= 0 ? "dead" : ""; // 倒れていれば dead クラス(灰色表示)
      // data-ei に敵の番号 i を仕込んでおく。あとでクリック時にどの敵かを特定するのに使う。
      return `<div class="unit enemy ${targetable} ${dead}" data-ei="${i}">
        ${charHtml(e.id, e.emoji)}
        <div class="nm">${e.name}</div>
        ${e.hp > 0 ? `<div class="intent">${intentTxt}</div>` : ""}
        <div class="hpbar"><div class="hpfill" style="width:${(e.hp / e.maxHp) * 100}%"></div></div>
        <div class="hptxt">${e.hp}/${e.maxHp}${e.block ? ` 🛡️${e.block}` : ""}</div>
      </div>`;
    }).join(""); // map で作った配列を join で1つの文字列に連結

    // プレイヤー(hero)の表示を作る。
    const h = S.hero;
    const heroHtml = `<div class="unit hero">
        ${charHtml("penguin", h.emoji)}
        <div class="nm">${h.name}</div>
        <div class="hpbar"><div class="hpfill" style="width:${(h.hp / h.maxHp) * 100}%"></div></div>
        <div class="hptxt">${h.hp}/${h.maxHp} ${h.block ? `<span class="shield">🛡️${h.block}</span>` : ""}</div>
      </div>`;

    // 手札の各カードをHTML文字列に変換する。
    const handHtml = S.hand.map((id, i) => {
      const c = C()[id];
      const disabled = c.cost > S.energy ? "disabled" : ""; // あまみ不足なら使えない見た目に
      const sel = S.selected === i ? "selected" : "";       // 選択中なら強調表示
      // data-ci にカードの手札番号 i を仕込む(クリック時にどのカードかを特定する)。
      return `<div class="card ${disabled} ${sel}" data-ci="${i}">
        <div class="ccost">${c.cost}</div>
        <div class="cemoji">${c.emoji}</div>
        <div class="cname">${c.name}</div>
        <div class="cdesc">${c.desc}</div>
      </div>`;
    }).join("");

    // 上で作った各パーツ(ログ・敵・味方・あまみ/ターン終了・手札)を組み立てて画面に反映。
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
    // innerHTML で作り直すと中身のボタンなどは新品になるため、クリックの反応(イベント)を毎回付け直す。
    // querySelectorAll は条件に合う要素を全部集める。addEventListener は「クリックされたら〜する」を登録する。
    // +el.dataset.ci の「+」は data-ci の文字列を数値に変換している(例: "2" → 2)。
    root.querySelectorAll(".card").forEach((el) =>
      el.addEventListener("click", () => clickCard(+el.dataset.ci)));
    root.querySelectorAll(".unit.enemy").forEach((el) =>
      el.addEventListener("click", () => clickEnemy(S.enemies[+el.dataset.ei])));
    // ターン終了ボタン。?. は「要素があれば実行」の安全呼び出し(無ければ何もしない)。
    root.querySelector(".endbtn")?.addEventListener("click", endTurn);
  }

  // ============================================================
  //  一時ログ表示 — 短いお知らせを出し、少ししたら通常メッセージに戻す
  // ============================================================
  let logTimer = null; // 消すタイマーを覚えておく変数(連打対策)
  function flashLog(text) {
    const el = ensureRoot().querySelector(".log");
    if (!el) return;
    el.textContent = text;      // まずお知らせ文を表示
    clearTimeout(logTimer);     // 前のタイマーが残っていれば取り消す
    // 1200ミリ秒(1.2秒)後に「あなたのターン。」へ戻す。setTimeout は「後で1回だけ実行」。
    logTimer = setTimeout(() => { const l = ensureRoot().querySelector(".log"); if (l) l.textContent = "あなたのターン。"; }, 1200);
  }

  // ============================================================
  //  待ち時間ユーティリティ — 指定ミリ秒だけ待つ(await と一緒に使う)
  // ============================================================
  // Promise は「あとで終わる処理」を表す入れ物。ms 後に完了する Promise を返すので await で待てる。
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 即時実行関数の返り値。外に公開するのは start だけ(他は外から触れない)。
  return { start };
})();
