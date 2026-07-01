/*
 * explore.js — Phaser の世界(2エリア)
 *   🏡 VillageScene … 平和なイチゴの村。栽培・スキン変更・フィールドへの門。
 *   🌾 FieldScene   … 戦闘エリア。動く敵に接触で戦闘。敵レベル>自分=追尾 / <自分=逃走。
 *
 *   Explore.launch({
 *     parent: "game-container",
 *     onDefeat:     () => Promise<"revive"|"quit">,  // 敗北時(ICHIGO任意復活)
 *     openSkinShop: () => Promise<void>,             // 村のスキン屋(DOMオーバーレイ)
 *     refreshHud:   () => {},                        // DOM HUD 更新
 *   });
 */
window.Explore = (function () {
  const TILE = 48, COLS = 20, ROWS = 15;
  const W = COLS * TILE, H = ROWS * TILE;
  let game = null, cbs = null, hero = null;

  function launch(opts) {
    cbs = opts; hero = null;
    game = new Phaser.Game({
      type: Phaser.AUTO, width: W, height: H,
      parent: opts.parent || "game-container",
      backgroundColor: "#8fca6b",
      physics: { default: "arcade", arcade: { debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [VillageScene, FieldScene],
    });
  }
  function destroy() { if (game) { game.destroy(true); game = null; } }

  function buildHero() {
    const h = GameData.clone(GameData.HERO);
    h.maxHp = GameState.maxHp(); h.hp = h.maxHp;
    return h;
  }

  // ===== 共通ヘルパ =====
  function drawGround(scene, a, b) {
    const g = scene.add.graphics();
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        g.fillStyle((x + y) % 2 === 0 ? a : b, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
  }

  function addPlayer(scene, tx, ty) {
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    const ring = scene.add.circle(x, y, 20, GameState.skinColor(), 0.55).setDepth(2);
    const p = scene.add.text(x, y, "🐧", { fontSize: "30px" }).setOrigin(0.5).setDepth(3);
    scene.physics.add.existing(p);
    p.body.setSize(30, 30).setOffset((p.width - 30) / 2, (p.height - 30) / 2);
    p.body.setCollideWorldBounds(true);
    p.ring = ring;
    return p;
  }

  function movePlayer(scene) {
    const p = scene.player, speed = 180;
    const c = scene.cursors, w = scene.wasd;
    let vx = 0, vy = 0;
    if (c.left.isDown || w.A.isDown) vx = -speed; else if (c.right.isDown || w.D.isDown) vx = speed;
    if (c.up.isDown || w.W.isDown) vy = -speed; else if (c.down.isDown || w.S.isDown) vy = speed;
    p.body.setVelocity(vx, vy);
    p.ring.setPosition(p.x, p.y);
  }

  function makeWalls(scene) {
    const walls = scene.physics.add.staticGroup();
    scene.physics.world.setBounds(0, 0, W, H);
    scene.cameras.main.setBounds(0, 0, W, H);
    return walls;
  }
  function borderWalls(scene, walls, color) {
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1)
          walls.add(scene.add.rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE, color));
  }

  function toast(scene, msg, ms) {
    if (scene._toast) scene._toast.destroy();
    scene._toast = scene.add.text(scene.scale.width / 2, scene.scale.height - 40, msg,
      { fontSize: "18px", color: "#fff", backgroundColor: "#000000aa", padding: { x: 12, y: 6 } })
      .setOrigin(0.5).setScrollFactor(0).setDepth(200);
    scene.time.delayedCall(ms || 2400, () => { if (scene._toast) { scene._toast.destroy(); scene._toast = null; } });
  }

  function prompt(scene, msg) {
    if (!scene._prompt)
      scene._prompt = scene.add.text(scene.scale.width / 2, 30, "", { fontSize: "16px", color: "#fff", backgroundColor: "#0008", padding: { x: 10, y: 4 } })
        .setOrigin(0.5).setScrollFactor(0).setDepth(200);
    scene._prompt.setText(msg || "").setVisible(!!msg);
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ===================================================================
  //  村シーン
  // ===================================================================
  class VillageScene extends Phaser.Scene {
    constructor() { super("village"); }
    create() {
      const scene = this;
      GameState.load();
      drawGround(scene, 0x9ad97a, 0x8fce70);
      const walls = makeWalls(scene);
      borderWalls(scene, walls, 0x6fae52);

      // 家など(飾り兼壁)
      [[3, 3], [16, 3], [3, 11]].forEach(([c, r]) => {
        walls.add(scene.add.rectangle(c * TILE + TILE / 2, r * TILE + TILE / 2, TILE, TILE, 0xd98f6f));
        scene.add.text(c * TILE + TILE / 2, r * TILE + TILE / 2, "🏠", { fontSize: "30px" }).setOrigin(0.5);
      });
      scene.add.text(W / 2, 46, "🏡 イチゴの村", { fontSize: "22px", color: "#fff", backgroundColor: "#0006", padding: { x: 10, y: 4 } })
        .setOrigin(0.5).setScrollFactor(0).setDepth(150);

      // 畑(3区画)
      scene.plots = [[7, 6], [9, 6], [11, 6]].map(([c, r], i) => {
        const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
        scene.add.rectangle(x, y, TILE - 4, TILE - 4, 0x7a5230);
        const label = scene.add.text(x, y, "", { fontSize: "26px" }).setOrigin(0.5);
        return { i, x, y, label };
      });

      // スキン屋
      scene.shop = { x: 15 * TILE + TILE / 2, y: 9 * TILE + TILE / 2 };
      scene.add.rectangle(scene.shop.x, scene.shop.y, TILE, TILE, 0x6f8fd9);
      scene.add.text(scene.shop.x, scene.shop.y, "🎨", { fontSize: "30px" }).setOrigin(0.5);

      // フィールドへの門
      scene.gate = { x: (COLS - 2) * TILE + TILE / 2, y: (ROWS - 2) * TILE + TILE / 2 };
      scene.add.text(scene.gate.x, scene.gate.y, "⛩️", { fontSize: "34px" }).setOrigin(0.5);
      scene.add.text(scene.gate.x, scene.gate.y + 30, "フィールドへ", { fontSize: "12px", color: "#fff" }).setOrigin(0.5);

      // 近日開放(住人/施設)
      scene.add.text(6 * TILE, 11 * TILE, "🚧 住人・施設(近日)", { fontSize: "13px", color: "#fff", backgroundColor: "#0006", padding: { x: 6, y: 2 } });

      scene.player = addPlayer(scene, 10, 10);
      scene.physics.add.collider(scene.player, walls);
      scene.cameras.main.startFollow(scene.player, true, 0.1, 0.1);

      scene.cursors = scene.input.keyboard.createCursorKeys();
      scene.wasd = scene.input.keyboard.addKeys("W,A,S,D");
      scene.eKey = scene.input.keyboard.addKey("E");
      scene.busy = false;

      // スキン変更などから戻った時に見た目を更新
      scene.events.on("resume", () => {
        scene.busy = false;
        if (scene.player) scene.player.ring.setFillStyle(GameState.skinColor(), 0.55);
        cbs.refreshHud && cbs.refreshHud();
      });

      cbs.refreshHud && cbs.refreshHud();
      toast(scene, "矢印/WASDで移動。畑や🎨に近づいて E で操作、⛩️でフィールドへ", 3600);
    }

    update() {
      const scene = this;
      if (scene.busy) return;
      movePlayer(scene);

      // 畑の表示更新
      scene.plots.forEach((pl) => {
        const st = GameState.plotState(pl.i);
        pl.label.setText(st === "empty" ? "" : st === "ready" ? GameData.CROP.ready : GameData.CROP.growing);
      });

      // 最寄りのインタラクト対象
      const p = scene.player;
      let near = null, R = 46;
      scene.plots.forEach((pl) => { if (dist(p, pl) < R) near = { type: "plot", pl }; });
      if (dist(p, scene.shop) < R) near = { type: "shop" };
      if (dist(p, scene.gate) < R) near = { type: "gate" };

      if (near) {
        if (near.type === "plot") {
          const st = GameState.plotState(near.pl.i);
          prompt(scene, st === "empty" ? "E: いちごを植える" : st === "ready" ? "E: 収穫する 🍓" : "育成中…");
        } else if (near.type === "shop") prompt(scene, "E: スキンを変える 🎨");
        else prompt(scene, "E: フィールドへ ⛩️");
      } else prompt(scene, "");

      if (near && Phaser.Input.Keyboard.JustDown(scene.eKey)) interact(scene, near);
    }
  }

  function interact(scene, near) {
    if (near.type === "gate") { scene.scene.start("field"); return; }
    if (near.type === "plot") {
      const i = near.pl.i, st = GameState.plotState(i);
      if (st === "empty") { GameState.plant(i); toast(scene, "いちごを植えた! 少し待つと育つよ"); }
      else if (st === "ready") { const y = GameState.harvest(i); toast(scene, `収穫! 🍓ベリー +${y}`); cbs.refreshHud && cbs.refreshHud(); }
      else toast(scene, "まだ育っていない…");
      return;
    }
    if (near.type === "shop") {
      scene.busy = true;
      scene.scene.pause();
      Promise.resolve(cbs.openSkinShop && cbs.openSkinShop()).then(() => scene.scene.resume());
    }
  }

  // ===================================================================
  //  フィールドシーン(戦闘)
  // ===================================================================
  class FieldScene extends Phaser.Scene {
    constructor() { super("field"); }
    create() {
      const scene = this;
      hero = buildHero(); // このフィールド行きのHPを初期化
      scene.inBattle = false;
      drawGround(scene, 0x8bbf63, 0x7fb457);
      const walls = makeWalls(scene);
      borderWalls(scene, walls, 0x5b8f3e);
      // 障害物(まばら)
      for (let y = 2; y < ROWS - 2; y++)
        for (let x = 2; x < COLS - 2; x++)
          if (Math.random() < 0.07) {
            walls.add(scene.add.rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE, 0x3f7a34));
            scene.add.text(x * TILE + TILE / 2, y * TILE + TILE / 2, "🌳", { fontSize: "24px" }).setOrigin(0.5);
          }

      // 村へ戻る門
      scene.gate = { x: 2 * TILE + TILE / 2, y: 2 * TILE + TILE / 2 };
      scene.add.text(scene.gate.x, scene.gate.y, "⛩️", { fontSize: "34px" }).setOrigin(0.5).setDepth(1);
      scene.add.text(scene.gate.x, scene.gate.y + 28, "村へ", { fontSize: "12px", color: "#fff" }).setOrigin(0.5).setDepth(1);

      // 敵配置
      scene.enemies = scene.physics.add.group();
      [
        { c: 8, r: 4, def: GameData.ENEMIES.slug },
        { c: 13, r: 6, def: GameData.ENEMIES.mold },
        { c: 6, r: 10, def: GameData.ENEMIES.crow },
        { c: 16, r: 11, def: GameData.ENEMIES.boss },
      ].forEach((p) => addEnemy(scene, p.c, p.r, p.def));

      scene.player = addPlayer(scene, 4, 3);
      scene.physics.add.collider(scene.player, walls);
      scene.physics.add.collider(scene.enemies, walls);
      scene.cameras.main.startFollow(scene.player, true, 0.1, 0.1);

      scene.physics.add.overlap(scene.player, scene.enemies, (pl, e) => {
        if (!scene.inBattle) onTouchEnemy(scene, e);
      });

      scene.cursors = scene.input.keyboard.createCursorKeys();
      scene.wasd = scene.input.keyboard.addKeys("W,A,S,D");

      // フィールド内HP表示
      scene.hpText = scene.add.text(10, H - 10, "", { fontSize: "16px", color: "#fff", backgroundColor: "#0007", padding: { x: 8, y: 4 } })
        .setOrigin(0, 1).setScrollFactor(0).setDepth(200);
      updateHp(scene);

      cbs.refreshHud && cbs.refreshHud();
      toast(scene, `Lv${GameState.profile.level}。赤Lvの敵は追ってくる! 青Lvは逃げる。⛩️で村へ`, 3600);
    }

    update() {
      const scene = this;
      if (scene.inBattle) return;
      movePlayer(scene);
      const now = scene.time.now, plv = GameState.profile.level;
      scene.enemies.getChildren().forEach((e) => enemyAI(e, scene.player, plv, now));
      if (dist(scene.player, scene.gate) < 40) scene.scene.start("village");
    }
  }

  function addEnemy(scene, c, r, def) {
    const size = def.kind === "boss" ? 40 : 30;
    const e = scene.add.text(c * TILE + TILE / 2, r * TILE + TILE / 2, def.emoji, { fontSize: size + "px" }).setOrigin(0.5).setDepth(3);
    scene.physics.add.existing(e);
    e.body.setSize(size * 0.8, size * 0.8).setOffset((e.width - size * 0.8) / 2, (e.height - size * 0.8) / 2);
    e.body.setCollideWorldBounds(true);
    e.kind = def.kind; e.level = def.level;
    e.tag = scene.add.text(e.x, e.y - 24, "Lv" + def.level, { fontSize: "12px", color: "#fff", backgroundColor: "#0007", padding: { x: 3, y: 1 } })
      .setOrigin(0.5).setDepth(4);
    e.nextWander = 0;
    scene.enemies.add(e);
    return e;
  }

  function enemyAI(e, player, plv, now) {
    const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
    const CHASE = 78, FLEE = 100, WANDER = 45;
    if (e.level > plv) {
      e.body.setVelocity((dx / d) * CHASE, (dy / d) * CHASE);
      e.tag.setColor("#ff9d9d");
    } else if (e.level < plv) {
      if (d < 200) e.body.setVelocity((-dx / d) * FLEE, (-dy / d) * FLEE);
      else wander(e, now, WANDER);
      e.tag.setColor("#9dd0ff");
    } else {
      wander(e, now, WANDER);
      e.tag.setColor("#ffffff");
    }
    e.tag.setPosition(e.x, e.y - 24);
  }
  function wander(e, now, spd) {
    if (now > e.nextWander) {
      const a = Math.random() * Math.PI * 2;
      e.body.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
      e.nextWander = now + 1200 + Math.random() * 1400;
    }
  }

  function updateHp(scene) { if (scene.hpText) scene.hpText.setText(`🐧 HP ${hero.hp}/${hero.maxHp}`); }

  async function onTouchEnemy(scene, enemy) {
    scene.inBattle = true;
    scene.physics.pause();
    scene.player.body.setVelocity(0, 0);

    const result = await new Promise((res) =>
      Battle.start({ hero, enemies: GameData.encounter(enemy.kind), onEnd: res }));

    if (result === "lose") {
      const choice = cbs.onDefeat ? await cbs.onDefeat() : "quit";
      if (choice !== "revive") { scene.scene.start("village"); return; }
      hero.hp = hero.maxHp; // 復活(全回復)
    } else {
      const r = GameState.grantXp(enemy.kind);
      if (r.leveled) { hero.maxHp = GameState.maxHp(); hero.hp = hero.maxHp; }
      toast(scene, `+${r.gained}XP / 🍓+${r.berries}` + (r.leveled ? `  レベルアップ! Lv${GameState.profile.level}` : ""));
      cbs.refreshHud && cbs.refreshHud();
    }

    // 敵を消して探索へ復帰(勝利 or 復活)
    enemy.tag.destroy(); enemy.destroy();
    updateHp(scene);
    scene.inBattle = false;
    scene.physics.resume();
  }

  return { launch, destroy };
})();
