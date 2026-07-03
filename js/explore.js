/*
 * ============================================================
 *  このファイルは何?
 * ------------------------------------------------------------
 *  explore.js — Phaser で作った「世界(複数エリア)」部分。
 *
 *  エリア(シーン)は4つ。⛩️ に近づいて E キーで行き来する。
 *    🏠 TownScene  … 町(ハブ)。スキン屋・各エリアへの入口。
 *    🌱 FarmScene  … 畑。いちご栽培の専用エリア。
 *    🌾/🕳️ FieldScene … 戦闘エリア。中身は FIELDS の設定で切替(草原/洞窟…複数可)。
 *
 *  ★各エリアのマップは画面より大きく、プレイヤーを追ってカメラがスクロールする。
 *   (Phaser本体の表示サイズ VIEW_W×VIEW_H より広いマップは、はみ出た分がスクロールで見える)
 *
 *   Explore.launch({
 *     parent: "game-container",
 *     onDefeat:     () => Promise<"revive"|"quit">,  // 敗北時(ICHIGOで任意復活)
 *     openSkinShop: () => Promise<void>,             // 町のスキン屋(DOMオーバーレイ)
 *     refreshHud:   () => {},                        // DOM HUD(Lv/ベリー等)更新
 *   });
 */
window.Explore = (function () {
  // ============================================================
  //  定数・共有の状態
  // ============================================================
  const TILE = 48;             // 1マスのピクセル数
  const VIEW_W = 900, VIEW_H = 600; // カメラに映る大きさ。これより広いマップはスクロールする。
  let game = null, cbs = null, hero = null;

  // 戦闘エリアの一覧。ここを増やせば戦闘エリアが増える(cols/rows で広さ、enemies で敵配置)。
  const FIELDS = {
    grass: {
      name: "みどりの草原", cols: 30, rows: 22,
      ground: [0x8bbf63, 0x7fb457], border: 0x5b8f3e, obstacle: 0x3f7a34, deco: "🌳", density: 0.06,
      enemies: [
        { c: 8, r: 5, def: GameData.ENEMIES.slug },
        { c: 15, r: 8, def: GameData.ENEMIES.mold },
        { c: 22, r: 12, def: GameData.ENEMIES.crow },
        { c: 25, r: 6, def: GameData.ENEMIES.slug },
        { c: 11, r: 17, def: GameData.ENEMIES.mold },
      ],
    },
    cave: {
      name: "じめじめ洞窟", cols: 30, rows: 22,
      ground: [0x6b6b7a, 0x5f5f6e], border: 0x3a3a44, obstacle: 0x2b2b33, deco: "🪨", density: 0.08,
      enemies: [
        { c: 9, r: 6, def: GameData.ENEMIES.mold },
        { c: 15, r: 9, def: GameData.ENEMIES.crow },
        { c: 23, r: 7, def: GameData.ENEMIES.crow },
        { c: 24, r: 16, def: GameData.ENEMIES.boss },
      ],
    },
  };

  // ============================================================
  //  launch / destroy — ゲームの起動と破棄
  // ============================================================
  function launch(opts) {
    cbs = opts; hero = null;
    game = new Phaser.Game({
      type: Phaser.AUTO, width: VIEW_W, height: VIEW_H, // ← 表示サイズは固定。マップはこれより広くできる。
      parent: opts.parent || "game-container",
      backgroundColor: "#2a1b26",
      physics: { default: "arcade", arcade: { debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [TownScene, FarmScene, FieldScene], // 先頭(町)から開始
    });
  }
  function destroy() { if (game) { game.destroy(true); game = null; } }

  function buildHero() {
    const h = GameData.clone(GameData.HERO);
    h.maxHp = GameState.maxHp(); h.hp = h.maxHp;
    return h;
  }

  // ============================================================
  //  共通ヘルパ — 見た目・演出
  // ============================================================
  function fitSprite(img, target) { img.setScale(target / Math.max(img.width, img.height)); return img; }
  function addShadow(scene, x, y) { return scene.add.ellipse(x, y + 14, 26, 10, 0x000000, 0.22).setDepth(1); }
  function sparkle(scene, x, y) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 12;
      const s = scene.add.text(x, y, "✨", { fontSize: "16px" }).setOrigin(0.5).setDepth(60);
      scene.tweens.add({ targets: s, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, alpha: 0, duration: 600, onComplete: () => s.destroy() });
    }
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ============================================================
  //  共通ヘルパ — マップ(アリーナ)の土台づくり
  // ============================================================
  // makeArena … 地面を描き、マップ/カメラの範囲を決め、外周を壁で囲んだ壁グループを返す。
  //             cols×rows がマップの広さ。VIEW より大きければスクロールする。
  function makeArena(scene, cols, rows, gA, gB, borderColor) {
    scene.mapCols = cols; scene.mapRows = rows;
    scene.mapW = cols * TILE; scene.mapH = rows * TILE;
    const g = scene.add.graphics();
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        g.fillStyle((x + y) % 2 === 0 ? gA : gB, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    scene.physics.world.setBounds(0, 0, scene.mapW, scene.mapH); // 物理世界の範囲
    scene.cameras.main.setBounds(0, 0, scene.mapW, scene.mapH);  // カメラが動ける範囲(=スクロール範囲)
    const walls = scene.physics.add.staticGroup();
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1)
          walls.add(scene.add.rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE, borderColor));
    return walls;
  }

  // addObstacles … 戦闘エリアに木や岩をまばらに置く(入口付近・敵の足元は避ける)。
  function addObstacles(scene, walls, cfg, protect) {
    const occ = new Set(protect.map((p) => p.c + "," + p.r));
    cfg.enemies.forEach((e) => occ.add(e.c + "," + e.r));
    for (let y = 2; y < cfg.rows - 2; y++)
      for (let x = 2; x < cfg.cols - 2; x++) {
        if (occ.has(x + "," + y) || (x < 5 && y < 5)) continue; // 敵の足元と入口付近は空ける
        if (Math.random() < cfg.density) {
          walls.add(scene.add.rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE, cfg.obstacle));
          scene.add.text(x * TILE + TILE / 2, y * TILE + TILE / 2, cfg.deco, { fontSize: "24px" }).setOrigin(0.5);
        }
      }
  }

  // addGate … 別エリアへの入口(⛩️+ラベル)。scene.gates に登録し、E で移動できるようにする。
  //   to=移動先シーン名, data=渡す情報(戦闘エリアの種類など)。
  function addGate(scene, tc, tr, label, to, data) {
    const x = tc * TILE + TILE / 2, y = tr * TILE + TILE / 2;
    scene.add.text(x, y, "⛩️", { fontSize: "34px" }).setOrigin(0.5).setDepth(1);
    scene.add.text(x, y + 30, label, { fontSize: "12px", color: "#fff", backgroundColor: "#0006", padding: { x: 4, y: 1 } })
      .setOrigin(0.5).setDepth(1);
    (scene.gates = scene.gates || []).push({ x, y, label, to, data });
  }

  // ============================================================
  //  共通ヘルパ — プレイヤー(移動・見た目・頭上マーカー)
  // ============================================================
  function addPlayer(scene, tx, ty) {
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    const shadow = addShadow(scene, x, y);
    const p = scene.add.text(x, y, "🐧", { fontSize: "30px" }).setOrigin(0.5).setDepth(3);
    scene.physics.add.existing(p);
    p.body.setSize(30, 30).setOffset((p.width - 30) / 2, (p.height - 30) / 2);
    p.body.setCollideWorldBounds(true);
    p.shadow = shadow;
    if (Assets.has(scene, "penguin")) {
      p.setText(""); // 絵文字を隠して画像を使う
      p.sprite = fitSprite(scene.add.image(x, y, "penguin").setDepth(3), 62);
    } else {
      p.ring = scene.add.circle(x, y, 20, GameState.skinColor(), 0.55).setDepth(2); // 画像が無い時だけスキン色のオーラ
    }
    p.marker = scene.add.text(x, y - 26, "🔻", { fontSize: "20px" }).setOrigin(0.5).setDepth(6); // 頭上の目印
    return p;
  }

  function movePlayer(scene) {
    const p = scene.player, speed = 180, now = scene.time.now;
    const c = scene.cursors, w = scene.wasd;
    let vx = 0, vy = 0;
    if (c.left.isDown || w.A.isDown) vx = -speed; else if (c.right.isDown || w.D.isDown) vx = speed;
    if (c.up.isDown || w.W.isDown) vy = -speed; else if (c.down.isDown || w.S.isDown) vy = speed;
    p.body.setVelocity(vx, vy);
    if (p.ring) p.ring.setPosition(p.x, p.y);
    if (p.shadow) p.shadow.setPosition(p.x, p.y + 14);
    if (p.sprite) p.sprite.setPosition(p.x, p.y + Math.sin(now / 250) * 2);
    if (p.marker) p.marker.setPosition(p.x, p.y - 26 + Math.sin(now / 200) * 3);
  }

  // 入力・カメラ・目印などの共通セットアップ(各シーンの create の最後で呼ぶ)
  function setupControls(scene) {
    scene.physics.add.collider(scene.player, scene.walls);
    scene.cameras.main.startFollow(scene.player, true, 0.1, 0.1); // カメラがプレイヤーを追う=スクロール
    scene.cursors = scene.input.keyboard.createCursorKeys();
    scene.wasd = scene.input.keyboard.addKeys("W,A,S,D");
    scene.eKey = scene.input.keyboard.addKey("E");
    scene.busy = false;
  }

  // ============================================================
  //  共通ヘルパ — 画面表示(トースト・操作案内)
  // ============================================================
  function toast(scene, msg, ms) {
    if (scene._toast) scene._toast.destroy();
    scene._toast = scene.add.text(VIEW_W / 2, VIEW_H - 40, msg,
      { fontSize: "18px", color: "#fff", backgroundColor: "#000000aa", padding: { x: 12, y: 6 } })
      .setOrigin(0.5).setScrollFactor(0).setDepth(200); // setScrollFactor(0)=カメラが動いても画面に固定
    scene.time.delayedCall(ms || 2400, () => { if (scene._toast) { scene._toast.destroy(); scene._toast = null; } });
  }
  function prompt(scene, msg) {
    if (!scene._prompt)
      scene._prompt = scene.add.text(VIEW_W / 2, 30, "", { fontSize: "16px", color: "#fff", backgroundColor: "#0008", padding: { x: 10, y: 4 } })
        .setOrigin(0.5).setScrollFactor(0).setDepth(200);
    scene._prompt.setText(msg || "").setVisible(!!msg);
  }
  function areaLabel(scene, text) {
    scene.add.text(VIEW_W / 2, 46, text, { fontSize: "22px", color: "#fff", backgroundColor: "#0006", padding: { x: 10, y: 4 } })
      .setOrigin(0.5).setScrollFactor(0).setDepth(150);
  }

  // ============================================================
  //  共通ヘルパ — インタラクト(近くの対象を調べて E で実行)
  // ============================================================
  // scanInteract … プレイヤーの近くにある「操作対象(畑/スキン屋/入口)」を返す。
  function scanInteract(scene) {
    const p = scene.player, R = 48;
    let near = null;
    (scene.plots || []).forEach((pl) => { if (dist(p, pl) < R) near = { type: "plot", pl }; });
    if (scene.shop && dist(p, scene.shop) < R) near = { type: "shop" };
    (scene.gates || []).forEach((g) => { if (dist(p, g) < R) near = { type: "gate", gate: g }; });
    return near;
  }
  // showPrompt … 近くの対象に応じた操作案内を表示。
  function showPrompt(scene, near) {
    if (!near) return prompt(scene, "");
    if (near.type === "plot") {
      const st = GameState.plotState(near.pl.i);
      prompt(scene, st === "empty" ? "E: いちごを植える" : st === "ready" ? "E: 収穫する 🍓" : "育成中…");
    } else if (near.type === "shop") prompt(scene, "E: スキンを変える 🎨");
    else prompt(scene, "E: " + near.gate.label);
  }
  // doInteract … E を押したときの実処理。
  function doInteract(scene, near) {
    if (near.type === "gate") { scene.scene.start(near.gate.to, near.gate.data || {}); return; }
    if (near.type === "plot") {
      const i = near.pl.i, st = GameState.plotState(i);
      if (st === "empty") { GameState.plant(i); toast(scene, "いちごを植えた! 少し待つと育つよ"); }
      else if (st === "ready") { const y = GameState.harvest(i); sparkle(scene, near.pl.x, near.pl.y); toast(scene, `収穫! 🍓ベリー +${y}`); cbs.refreshHud && cbs.refreshHud(); }
      else toast(scene, "まだ育っていない…");
      return;
    }
    if (near.type === "shop") {
      scene.busy = true; scene.scene.pause();
      Promise.resolve(cbs.openSkinShop && cbs.openSkinShop()).then(() => scene.scene.resume());
    }
  }
  // updatePlots … 畑の見た目(空/育成中/収穫可)を毎フレーム更新。
  function updatePlots(scene) {
    (scene.plots || []).forEach((pl) => {
      const st = GameState.plotState(pl.i);
      pl.label.setText(st === "empty" ? "" : st === "ready" ? GameData.CROP.ready : GameData.CROP.growing);
    });
  }
  // 各エリア共通の update(移動+インタラクト)。戦闘エリアは敵AIを別で足す。
  function baseUpdate(scene) {
    if (scene.busy) return null;
    movePlayer(scene);
    updatePlots(scene);
    const near = scanInteract(scene);
    showPrompt(scene, near);
    if (near && Phaser.Input.Keyboard.JustDown(scene.eKey)) { doInteract(scene, near); return "acted"; }
    return null;
  }

  // ===================================================================
  //  🏠 TownScene(町・ハブ) — スキン屋と各エリアへの入口
  // ===================================================================
  class TownScene extends Phaser.Scene {
    constructor() { super("town"); }
    preload() { Assets.load(this); }
    create() {
      const scene = this;
      GameState.load();
      scene.walls = makeArena(scene, 28, 20, 0x9ad97a, 0x8fce70, 0x6fae52); // 画面(900x600)より広い町
      areaLabel(scene, "🏠 イチゴの町");

      // 家(飾り兼壁)を数軒
      [[5, 5], [9, 5], [21, 5], [24, 12], [6, 15]].forEach(([c, r]) => {
        scene.walls.add(scene.add.rectangle(c * TILE + TILE / 2, r * TILE + TILE / 2, TILE, TILE, 0xd98f6f));
        scene.add.text(c * TILE + TILE / 2, r * TILE + TILE / 2, "🏠", { fontSize: "30px" }).setOrigin(0.5);
      });
      // 住人・施設エリア(近日)の看板
      scene.add.text(15 * TILE, 15 * TILE, "🚧 住人・施設(近日)", { fontSize: "14px", color: "#fff", backgroundColor: "#0006", padding: { x: 6, y: 2 } }).setOrigin(0.5);

      // スキン屋(🎨)
      scene.shop = { x: 13 * TILE + TILE / 2, y: 6 * TILE + TILE / 2 };
      scene.add.rectangle(scene.shop.x, scene.shop.y, TILE, TILE, 0x6f8fd9);
      scene.add.text(scene.shop.x, scene.shop.y, "🎨", { fontSize: "30px" }).setOrigin(0.5);

      // 各エリアへの入口(⛩️)
      addGate(scene, 3, 17, "畑へ 🌱", "farm");
      addGate(scene, 24, 3, "草原へ 🌾", "field", { fieldId: "grass" });
      addGate(scene, 24, 17, "洞窟へ 🕳️", "field", { fieldId: "cave" });

      scene.player = addPlayer(scene, 14, 10); // 町の中央あたりから開始
      setupControls(scene);

      // スキン屋から戻った時に見た目/HUDを更新
      scene.events.on("resume", () => {
        scene.busy = false;
        if (scene.player && scene.player.ring) scene.player.ring.setFillStyle(GameState.skinColor(), 0.55);
        cbs.refreshHud && cbs.refreshHud();
      });

      cbs.refreshHud && cbs.refreshHud();
      toast(scene, "矢印/WASDで移動。⛩️に近づいて E で各エリアへ。🎨で着替え", 3600);
    }
    update() { baseUpdate(this); }
  }

  // ===================================================================
  //  🌱 FarmScene(畑) — いちご栽培の専用エリア
  // ===================================================================
  class FarmScene extends Phaser.Scene {
    constructor() { super("farm"); }
    preload() { Assets.load(this); }
    create() {
      const scene = this;
      GameState.load();
      scene.walls = makeArena(scene, 22, 16, 0x9fd98a, 0x93cf7c, 0x6fae52);
      areaLabel(scene, "🌱 いちご畑");

      // 畑(6区画)。map で {i,x,y,label} を作って覚えておく。
      scene.plots = [[8, 6], [10, 6], [12, 6], [8, 9], [10, 9], [12, 9]].map(([c, r], i) => {
        const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
        scene.add.rectangle(x, y, TILE - 4, TILE - 4, 0x7a5230);
        const label = scene.add.text(x, y, "", { fontSize: "26px" }).setOrigin(0.5);
        return { i, x, y, label };
      });

      addGate(scene, 2, 2, "町へ 🏠", "town"); // 町へ戻る入口
      scene.player = addPlayer(scene, 11, 12);
      setupControls(scene);

      cbs.refreshHud && cbs.refreshHud();
      toast(scene, "畑に近づいて E で植える/収穫。⛩️で町へ", 3200);
    }
    update() { baseUpdate(this); }
  }

  // ===================================================================
  //  🌾 FieldScene(戦闘エリア) — FIELDS の設定で中身が変わる(草原/洞窟…)
  // ===================================================================
  class FieldScene extends Phaser.Scene {
    constructor() { super("field"); }
    preload() { Assets.load(this); }
    // init … scene.start("field", {fieldId}) で渡された情報を受け取る。
    init(data) { this.fieldId = (data && data.fieldId) || "grass"; }
    create() {
      const scene = this;
      const cfg = FIELDS[scene.fieldId];
      hero = buildHero();      // このエリアに入るたびHP満タンで用意
      scene.inBattle = false;
      scene.walls = makeArena(scene, cfg.cols, cfg.rows, cfg.ground[0], cfg.ground[1], cfg.border);
      areaLabel(scene, "⚔️ " + cfg.name);

      // 入口(=町へ戻る)と、その位置を守るための保護マス
      addGate(scene, 2, 2, "町へ 🏠", "town");
      addObstacles(scene, scene.walls, cfg, [{ c: 4, r: 3 }, { c: 2, r: 2 }]);

      // 敵配置
      scene.enemies = scene.physics.add.group();
      cfg.enemies.forEach((p) => addEnemy(scene, p.c, p.r, p.def));

      scene.player = addPlayer(scene, 4, 3);
      setupControls(scene);
      scene.physics.add.collider(scene.enemies, scene.walls);
      // プレイヤーと敵が重なったら戦闘へ(戦闘中でなければ)
      scene.physics.add.overlap(scene.player, scene.enemies, (pl, e) => { if (!scene.inBattle) onTouchEnemy(scene, e); });

      // 画面左下に固定のHP表示
      scene.hpText = scene.add.text(10, VIEW_H - 10, "", { fontSize: "16px", color: "#fff", backgroundColor: "#0007", padding: { x: 8, y: 4 } })
        .setOrigin(0, 1).setScrollFactor(0).setDepth(200);
      updateHp(scene);

      cbs.refreshHud && cbs.refreshHud();
      toast(scene, `Lv${GameState.profile.level}。赤Lvの敵は追尾/青Lvは逃走。⛩️で町へ`, 3600);
    }
    update() {
      const scene = this;
      if (scene.inBattle) return;
      const acted = baseUpdate(scene); // 移動+入口インタラクト(町へ戻るなど)
      if (acted) return;               // エリア移動したらこの先は処理しない
      const now = scene.time.now, plv = GameState.profile.level;
      scene.enemies.getChildren().forEach((e) => enemyAI(e, scene.player, plv, now)); // 敵AI
    }
  }

  // ============================================================
  //  敵 — 生成・AI(追尾/逃走/徘徊)
  // ============================================================
  function addEnemy(scene, c, r, def) {
    const size = def.kind === "boss" ? 40 : 30;
    const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
    const shadow = addShadow(scene, x, y);
    const e = scene.add.text(x, y, def.emoji, { fontSize: size + "px" }).setOrigin(0.5).setDepth(3);
    scene.physics.add.existing(e);
    e.body.setSize(size * 0.8, size * 0.8).setOffset((e.width - size * 0.8) / 2, (e.height - size * 0.8) / 2);
    e.body.setCollideWorldBounds(true);
    e.kind = def.kind; e.level = def.level;
    e.tag = scene.add.text(e.x, e.y - 24, "Lv" + def.level, { fontSize: "12px", color: "#fff", backgroundColor: "#0007", padding: { x: 3, y: 1 } })
      .setOrigin(0.5).setDepth(4);
    e.nextWander = 0; e.shadow = shadow;
    if (Assets.has(scene, def.id)) { e.setText(""); e.sprite = fitSprite(scene.add.image(x, y, def.id).setDepth(3), size + 10); }
    scene.enemies.add(e);
    return e;
  }

  // enemyAI … 敵レベル>自分=追尾(赤) / <自分=逃走(青) / 同格=徘徊(白)
  function enemyAI(e, player, plv, now) {
    const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
    const CHASE = 78, FLEE = 100, WANDER = 45;
    if (e.level > plv) {
      e.body.setVelocity((dx / d) * CHASE, (dy / d) * CHASE); e.tag.setColor("#ff9d9d");
    } else if (e.level < plv) {
      if (d < 200) e.body.setVelocity((-dx / d) * FLEE, (-dy / d) * FLEE); else wander(e, now, WANDER);
      e.tag.setColor("#9dd0ff");
    } else {
      wander(e, now, WANDER); e.tag.setColor("#ffffff");
    }
    e.tag.setPosition(e.x, e.y - 24);
    if (e.shadow) e.shadow.setPosition(e.x, e.y + 14);
    if (e.sprite) e.sprite.setPosition(e.x, e.y + Math.sin(now / 250 + e.x) * 2);
  }
  function wander(e, now, spd) {
    if (now > e.nextWander) {
      const a = Math.random() * Math.PI * 2;
      e.body.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
      e.nextWander = now + 1200 + Math.random() * 1400;
    }
  }

  function updateHp(scene) { if (scene.hpText) scene.hpText.setText(`🐧 HP ${hero.hp}/${hero.maxHp}`); }

  // ============================================================
  //  戦闘の呼び出し — 敵に触れる→戦闘→結果処理→探索へ復帰
  // ============================================================
  async function onTouchEnemy(scene, enemy) {
    scene.inBattle = true;
    scene.physics.pause();
    scene.player.body.setVelocity(0, 0);

    const result = await new Promise((res) =>
      Battle.start({ hero, enemies: GameData.encounter(enemy.kind), onEnd: res }));

    if (result === "lose") {
      const choice = cbs.onDefeat ? await cbs.onDefeat() : "quit";
      if (choice !== "revive") { scene.scene.start("town"); return; } // あきらめたら町へ
      hero.hp = hero.maxHp; // 復活(全回復)
    } else {
      const r = GameState.grantXp(enemy.kind);
      if (r.leveled) {
        hero.maxHp = GameState.maxHp(); hero.hp = hero.maxHp;
        scene.cameras.main.flash(300, 255, 240, 180);
        sparkle(scene, scene.player.x, scene.player.y);
      }
      toast(scene, `+${r.gained}XP / 🍓+${r.berries}` + (r.leveled ? `  レベルアップ! Lv${GameState.profile.level}` : ""));
      cbs.refreshHud && cbs.refreshHud();
    }

    // 敵(画像・影・ラベルも)を消して探索へ復帰
    enemy.tag.destroy();
    if (enemy.sprite) enemy.sprite.destroy();
    if (enemy.shadow) enemy.shadow.destroy();
    enemy.destroy();
    updateHp(scene);
    scene.inBattle = false;
    scene.physics.resume();
  }

  return { launch, destroy };
})();
