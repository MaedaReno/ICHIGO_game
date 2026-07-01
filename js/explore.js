/*
 * explore.js — Phaser で作った「探索マップ」部分(2つのエリアがある)
 *
 *   🏡 VillageScene(村シーン) … 平和なイチゴの村。いちご栽培・スキン変更・フィールドへの門。
 *   🌾 FieldScene(フィールドシーン) … 戦闘エリア。動く敵に接触すると戦闘が始まる。
 *                                       敵レベル>自分=追いかけてくる / 敵レベル<自分=逃げる。
 *
 *   ▼ 使い方(外部からこの1つの関数を呼ぶだけでゲームが起動する)
 *   Explore.launch({
 *     parent: "game-container",                        // ゲーム画面を埋め込むHTML要素のid
 *     onDefeat:     () => Promise<"revive"|"quit">,    // 敗北したとき(ICHIGOで任意復活するか決める)
 *     openSkinShop: () => Promise<void>,               // 村のスキン屋を開く(DOMのオーバーレイ)
 *     refreshHud:   () => {},                          // 画面上部などのDOM製HUD(体力やベリー表示)を更新する
 *   });
 *
 *   ※Phaser の Scene(シーン)= ゲームの「場面/画面」のこと。
 *     create() … その場面に入った「最初に1回だけ」呼ばれる(地形や敵の初期配置に使う)。
 *     update() … その場面にいる間「毎フレーム(毎秒60回くらい)」呼ばれる(移動やAIの更新に使う)。
 */

// (function(){ ... })() は「即時実行関数」。中の変数を外から隠しつつ、
// window.Explore に { launch, destroy } だけを公開するための書き方(モジュールの代わり)。
window.Explore = (function () {
  // ============================================================
  //  定数・共有の状態 — マップの大きさや、全体で使い回す変数
  // ============================================================

  // TILE=1マスのピクセル数, COLS=横のマス数, ROWS=縦のマス数
  const TILE = 48, COLS = 20, ROWS = 15;
  // W=マップ全体の幅, H=高さ(マス数 × 1マスのサイズ)
  const W = COLS * TILE, H = ROWS * TILE;
  // game=Phaser本体, cbs=launchで渡されたコールバック集, hero=プレイヤーキャラのデータ
  let game = null, cbs = null, hero = null;

  // ============================================================
  //  launch / destroy — ゲームの起動と破棄
  // ============================================================

  function launch(opts) {
    cbs = opts; hero = null; // コールバックを保存し、ヒーローは未生成にしておく
    // new Phaser.Game(設定) でゲーム本体を作る。ここに書いた設定でゲーム全体が動き出す。
    game = new Phaser.Game({
      type: Phaser.AUTO, width: W, height: H,       // AUTO=描画方式はPhaserにお任せ。幅と高さを指定
      parent: opts.parent || "game-container",       // 埋め込み先のHTML要素(未指定なら "game-container")
      backgroundColor: "#8fca6b",                    // 背景色(草っぽい緑)
      // physics=物理エンジンの設定。arcade は軽量で2Dゲーム向け。debug:false で判定枠を表示しない。
      physics: { default: "arcade", arcade: { debug: false } },
      // scale=画面サイズ調整。FIT=枠に収まるよう拡大縮小、CENTER_BOTH=中央寄せ。
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [VillageScene, FieldScene],             // 使うシーン一覧。先頭(村)が最初に表示される。
    });
  }
  // destroy() … ゲームを完全に破棄してメモリを解放する(画面を閉じる時などに呼ぶ)。
  function destroy() { if (game) { game.destroy(true); game = null; } }

  // buildHero() … 戦闘に使うプレイヤーキャラのデータを作る。
  function buildHero() {
    const h = GameData.clone(GameData.HERO); // 元データを壊さないようコピーを作る
    h.maxHp = GameState.maxHp(); h.hp = h.maxHp; // 最大HPを今のレベルから計算し、HPを満タンに
    return h;
  }

  // ============================================================
  //  共通ヘルパ関数 — 村とフィールドの両方で使い回す部品
  // ============================================================

  // drawGround … 市松模様(チェック柄)の地面を描く。a と b は交互に使う2色。
  // scene.add.graphics() … 図形を自由に描くための「お絵かき道具」を画面に置く。
  function drawGround(scene, a, b) {
    const g = scene.add.graphics();
    // 縦横のマスを2重ループで全部塗る
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        // (x+y) が偶数か奇数かで色を切り替え → 市松模様になる。fillStyle は塗り色の指定。
        g.fillStyle((x + y) % 2 === 0 ? a : b, 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE); // 1マス分の四角を塗る
      }
  }

  // addPlayer … プレイヤー(ペンギン🐧)を tx,ty マス目に置く。scene.add.* は「画面に置く」の意味。
  function addPlayer(scene, tx, ty) {
    // マス目座標 → ピクセル座標へ変換(+TILE/2 でマスの中央に置く)
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    const shadow = addShadow(scene, x, y); // 足元の影(立体感)
    // 足元の色つきリング(スキンの色。半透明0.55)。setDepth は重なり順(数字が大きいほど手前)。
    const ring = scene.add.circle(x, y, 20, GameState.skinColor(), 0.55).setDepth(2);
    // 絵文字を文字として画面に置く。setOrigin(0.5) で「文字の中心」を座標基準にする。
    const p = scene.add.text(x, y, "🐧", { fontSize: "30px" }).setOrigin(0.5).setDepth(3);
    scene.physics.add.existing(p); // この表示物に「物理ボディ」を持たせる(=衝突や速度で動かせるようになる)
    // 当たり判定の大きさを 30×30 に整え、絵文字の中央に合わせる
    p.body.setSize(30, 30).setOffset((p.width - 30) / 2, (p.height - 30) / 2);
    p.body.setCollideWorldBounds(true); // マップの外へ出ないようにする
    p.ring = ring; p.shadow = shadow; // リングと影を後で動かせるよう覚えておく
    // assets/char/penguin.png があれば、そのアニメ画像で表示(絵文字は隠す)。無ければ絵文字のまま。
    if (Assets.has(scene, "penguin")) { p.setText(""); p.sprite = fitSprite(scene.add.image(x, y, "penguin").setDepth(3), 44); }
    return p;
  }

  // movePlayer … キー入力を見てプレイヤーを動かす。update() から毎フレーム呼ばれる。
  function movePlayer(scene) {
    const p = scene.player, speed = 180, now = scene.time.now; // speed=移動速度, now=現在時刻(揺れ演出に使う)
    const c = scene.cursors, w = scene.wasd; // c=矢印キー, w=WASDキー
    let vx = 0, vy = 0; // vx=横方向の速度, vy=縦方向の速度(初期は0=止まっている)
    // 左右キーどちらかが押されていれば横方向の速度を設定
    if (c.left.isDown || w.A.isDown) vx = -speed; else if (c.right.isDown || w.D.isDown) vx = speed;
    // 上下キーどちらかが押されていれば縦方向の速度を設定
    if (c.up.isDown || w.W.isDown) vy = -speed; else if (c.down.isDown || w.S.isDown) vy = speed;
    // setVelocity(速度)で動かす。位置を直接変えず「速度」を与えるのが物理エンジン流。
    p.body.setVelocity(vx, vy);
    p.ring.setPosition(p.x, p.y); // 足元リングをプレイヤーに追従させる
    if (p.shadow) p.shadow.setPosition(p.x, p.y + 14); // 影も追従
    // アニメ画像を少し上下に揺らして「生きている」感じを出す(sin波でふわふわ)
    if (p.sprite) p.sprite.setPosition(p.x, p.y + Math.sin(now / 250) * 2);
  }

  // makeWalls … 壁をまとめる「静的グループ」を作り、マップとカメラの動ける範囲を決める。
  function makeWalls(scene) {
    // staticGroup=動かない物のまとまり。壁はここへ add していく。
    const walls = scene.physics.add.staticGroup();
    scene.physics.world.setBounds(0, 0, W, H); // 物理世界の範囲(この外へは出られない)
    scene.cameras.main.setBounds(0, 0, W, H);  // カメラが映せる範囲
    return walls;
  }
  // borderWalls … マップの外周(1周ぶん)を壁で囲む。
  function borderWalls(scene, walls, color) {
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        // いちばん端(上下左右の縁)のマスだけ壁にする
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1)
          walls.add(scene.add.rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE, color));
  }

  // toast … 画面下に一時的なメッセージを出す(ms ミリ秒後に自動で消える)。
  function toast(scene, msg, ms) {
    if (scene._toast) scene._toast.destroy(); // 前のメッセージが残っていたら消す
    scene._toast = scene.add.text(scene.scale.width / 2, scene.scale.height - 40, msg,
      { fontSize: "18px", color: "#fff", backgroundColor: "#000000aa", padding: { x: 12, y: 6 } })
      // setScrollFactor(0)=カメラが動いても画面に貼り付いたまま(=UI表示)。setDepth(200)で最前面に。
      .setOrigin(0.5).setScrollFactor(0).setDepth(200);
    // delayedCall … 指定ミリ秒後に1回だけ実行。ここでは時間が経ったらメッセージを消す。
    scene.time.delayedCall(ms || 2400, () => { if (scene._toast) { scene._toast.destroy(); scene._toast = null; } });
  }

  // prompt … 画面上部に「E: ○○する」などの操作案内を出す。msg が空なら非表示にする。
  function prompt(scene, msg) {
    if (!scene._prompt) // 案内テキストがまだ無ければ最初に1つだけ作る
      scene._prompt = scene.add.text(scene.scale.width / 2, 30, "", { fontSize: "16px", color: "#fff", backgroundColor: "#0008", padding: { x: 10, y: 4 } })
        .setOrigin(0.5).setScrollFactor(0).setDepth(200);
    scene._prompt.setText(msg || "").setVisible(!!msg); // 文字を差し替え、空なら隠す(!!で真偽に変換)
  }

  // dist … 2点 a,b の距離を返すアロー関数。=> は関数の短い書き方。
  // Math.hypot(横の差, 縦の差) は三平方の定理で「まっすぐな距離」を計算してくれる便利関数。
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ============================================================
  //  見た目の演出ヘルパ — アニメ画像の差し込み・影・キラキラ
  // ============================================================

  // fitSprite … 画像の「大きい方の辺」が target px になるよう自動で縮小する(アニメ画像のサイズ調整)
  function fitSprite(img, target) { img.setScale(target / Math.max(img.width, img.height)); return img; }

  // addShadow … キャラの足元に薄い楕円の影を置いて立体感を出す
  function addShadow(scene, x, y) { return scene.add.ellipse(x, y + 14, 26, 10, 0x000000, 0.22).setDepth(1); }

  // sparkle … ✨を放射状にパッと散らす簡単な演出(収穫・レベルアップで使う)
  function sparkle(scene, x, y) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 12; // ランダムな向き・距離
      const s = scene.add.text(x, y, "✨", { fontSize: "16px" }).setOrigin(0.5).setDepth(60);
      // tweens.add … 時間をかけて値をなめらかに変える演出。外側へ飛ばしながら透明に消す。
      scene.tweens.add({ targets: s, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, alpha: 0, duration: 600, onComplete: () => s.destroy() });
    }
  }

  // ============================================================
  //  VillageScene(村シーン) — 平和なイチゴの村。栽培・スキン屋・フィールドへの門
  // ============================================================
  // class ... extends ... は「継承」。Phaser.Scene の機能を受け継いだ自分専用のシーンを作る。
  class VillageScene extends Phaser.Scene {
    constructor() { super("village"); } // super("village") でこのシーンに "village" という名前を付ける
    // preload() … create の前に呼ばれ、使う画像を読み込む(あれば)。無い画像は自動で絵文字にフォールバック。
    preload() { Assets.load(this); }
    // create() … 村に入った最初の1回。地形・建物・畑・プレイヤーなどを配置する。
    create() {
      const scene = this; // this(このシーン自身)を scene という名前で使いやすくしておく
      GameState.load(); // セーブデータ(レベルや畑の状態など)を読み込む
      drawGround(scene, 0x9ad97a, 0x8fce70); // 地面を2色の市松模様で描く
      const walls = makeWalls(scene);          // 壁グループを用意
      borderWalls(scene, walls, 0x6fae52);     // マップの外周を壁で囲む

      // 家など(見た目の飾りだが、壁として当たり判定も持つ)
      // forEach で3軒ぶんの [列c, 行r] を順に処理。壁として登録しつつ🏠の絵文字を重ねる。
      [[3, 3], [16, 3], [3, 11]].forEach(([c, r]) => {
        walls.add(scene.add.rectangle(c * TILE + TILE / 2, r * TILE + TILE / 2, TILE, TILE, 0xd98f6f));
        scene.add.text(c * TILE + TILE / 2, r * TILE + TILE / 2, "🏠", { fontSize: "30px" }).setOrigin(0.5);
      });
      // 画面上部に固定表示するタイトル(setScrollFactor(0) で画面に貼り付く)
      scene.add.text(W / 2, 46, "🏡 イチゴの村", { fontSize: "22px", color: "#fff", backgroundColor: "#0006", padding: { x: 10, y: 4 } })
        .setOrigin(0.5).setScrollFactor(0).setDepth(150);

      // 畑(3区画)。map で各畑の情報オブジェクト {i, x, y, label} の配列を作って覚えておく。
      scene.plots = [[7, 6], [9, 6], [11, 6]].map(([c, r], i) => {
        const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
        scene.add.rectangle(x, y, TILE - 4, TILE - 4, 0x7a5230); // 茶色の土
        const label = scene.add.text(x, y, "", { fontSize: "26px" }).setOrigin(0.5); // 作物の表示(後で更新)
        return { i, x, y, label }; // i=畑番号。後で状態を調べるのに使う
      });

      // スキン屋(🎨)。座標を覚えておき、近づいたら開けるようにする。
      scene.shop = { x: 15 * TILE + TILE / 2, y: 9 * TILE + TILE / 2 };
      scene.add.rectangle(scene.shop.x, scene.shop.y, TILE, TILE, 0x6f8fd9);
      scene.add.text(scene.shop.x, scene.shop.y, "🎨", { fontSize: "30px" }).setOrigin(0.5);

      // フィールドへの門(⛩️)。ここに近づいて E を押すと戦闘エリアへ移動する。
      scene.gate = { x: (COLS - 2) * TILE + TILE / 2, y: (ROWS - 2) * TILE + TILE / 2 };
      scene.add.text(scene.gate.x, scene.gate.y, "⛩️", { fontSize: "34px" }).setOrigin(0.5);
      scene.add.text(scene.gate.x, scene.gate.y + 30, "フィールドへ", { fontSize: "12px", color: "#fff" }).setOrigin(0.5);

      // 近日開放(住人/施設)の案内(まだ未実装のエリア)
      scene.add.text(6 * TILE, 11 * TILE, "🚧 住人・施設(近日)", { fontSize: "13px", color: "#fff", backgroundColor: "#0006", padding: { x: 6, y: 2 } });

      scene.player = addPlayer(scene, 10, 10);          // プレイヤーを中央あたりに置く
      scene.physics.add.collider(scene.player, walls);  // collider=衝突判定。プレイヤーは壁を通り抜けられない
      // startFollow … カメラがプレイヤーを追いかける。後ろの数字(0.1)は追従のなめらかさ。
      scene.cameras.main.startFollow(scene.player, true, 0.1, 0.1);

      // キー入力の準備
      scene.cursors = scene.input.keyboard.createCursorKeys(); // 矢印キー一式
      scene.wasd = scene.input.keyboard.addKeys("W,A,S,D");     // WASDキー
      scene.eKey = scene.input.keyboard.addKey("E");            // 決定/操作用の E キー
      scene.busy = false; // busy=true の間は操作を止める(スキン屋を開いている最中など)

      // スキン屋などから戻って(resume=シーン再開)きた時に、見た目やHUDを更新する
      scene.events.on("resume", () => {
        scene.busy = false;
        if (scene.player) scene.player.ring.setFillStyle(GameState.skinColor(), 0.55); // 選んだ色を反映
        cbs.refreshHud && cbs.refreshHud(); // refreshHud があれば呼ぶ(&& で存在チェック)
      });

      cbs.refreshHud && cbs.refreshHud();
      toast(scene, "矢印/WASDで移動。畑や🎨に近づいて E で操作、⛩️でフィールドへ", 3600);
    }

    // update() … 村にいる間、毎フレーム呼ばれる。移動・畑の見た目・操作案内を処理する。
    update() {
      const scene = this;
      if (scene.busy) return; // 何かを開いている最中は動かさない
      movePlayer(scene);      // キー入力に応じてプレイヤーを動かす

      // 畑の見た目を状態に合わせて更新(空=表示なし / 収穫可=完成の絵 / それ以外=育成中の絵)
      scene.plots.forEach((pl) => {
        const st = GameState.plotState(pl.i);
        pl.label.setText(st === "empty" ? "" : st === "ready" ? GameData.CROP.ready : GameData.CROP.growing);
      });

      // プレイヤーに最も近い「操作できる対象」を探す(距離 R 以内なら near に入れる)
      const p = scene.player;
      let near = null, R = 46;
      scene.plots.forEach((pl) => { if (dist(p, pl) < R) near = { type: "plot", pl }; });
      if (dist(p, scene.shop) < R) near = { type: "shop" };
      if (dist(p, scene.gate) < R) near = { type: "gate" };

      // 近くに対象があれば、その種類に応じた操作案内を表示する
      if (near) {
        if (near.type === "plot") {
          const st = GameState.plotState(near.pl.i);
          prompt(scene, st === "empty" ? "E: いちごを植える" : st === "ready" ? "E: 収穫する 🍓" : "育成中…");
        } else if (near.type === "shop") prompt(scene, "E: スキンを変える 🎨");
        else prompt(scene, "E: フィールドへ ⛩️");
      } else prompt(scene, ""); // 近くに何も無ければ案内を消す

      // 対象が近くにあり、かつ E が「今このフレームで押された瞬間」なら実行(JustDown=押しっぱなしを弾く)
      if (near && Phaser.Input.Keyboard.JustDown(scene.eKey)) interact(scene, near);
    }
  }

  // interact … 村で E を押したときの処理。near.type ごとに動作を分ける。
  function interact(scene, near) {
    // 門 … フィールドシーンへ移動して終了
    if (near.type === "gate") { scene.scene.start("field"); return; }
    // 畑 … 状態に応じて「植える / 収穫する / まだ育っていない」
    if (near.type === "plot") {
      const i = near.pl.i, st = GameState.plotState(i);
      if (st === "empty") { GameState.plant(i); toast(scene, "いちごを植えた! 少し待つと育つよ"); }
      else if (st === "ready") { const y = GameState.harvest(i); sparkle(scene, near.pl.x, near.pl.y); toast(scene, `収穫! 🍓ベリー +${y}`); cbs.refreshHud && cbs.refreshHud(); }
      else toast(scene, "まだ育っていない…");
      return;
    }
    // スキン屋 … シーンを一時停止してDOMのスキン屋を開く
    if (near.type === "shop") {
      scene.busy = true;
      scene.scene.pause(); // シーンを一時停止(update が止まる)
      // Promise=「あとで終わる処理」の受け皿。openSkinShop の完了を待ってからシーンを再開する。
      // Promise.resolve(...) で包むことで、戻り値がPromiseでも普通の値でも .then が使える。
      Promise.resolve(cbs.openSkinShop && cbs.openSkinShop()).then(() => scene.scene.resume());
    }
  }

  // ============================================================
  //  FieldScene(フィールドシーン) — 戦闘エリア。動く敵に接触すると戦闘開始
  // ============================================================
  class FieldScene extends Phaser.Scene {
    constructor() { super("field"); } // このシーンの名前は "field"
    // preload() … create の前に呼ばれ、使う画像を読み込む(あれば)。
    preload() { Assets.load(this); }
    // create() … フィールドに入った最初の1回。地形・敵・プレイヤーを配置する。
    create() {
      const scene = this;
      hero = buildHero(); // このフィールド行きのヒーロー(HP満タン)を用意
      scene.inBattle = false; // 戦闘中フラグ。true の間は探索の動きを止める
      drawGround(scene, 0x8bbf63, 0x7fb457);
      const walls = makeWalls(scene);
      borderWalls(scene, walls, 0x5b8f3e);
      // 障害物(木🌳)をまばらに配置。各マスで7%の確率で置く(Math.random()は0〜1の乱数)。
      for (let y = 2; y < ROWS - 2; y++)
        for (let x = 2; x < COLS - 2; x++)
          if (Math.random() < 0.07) {
            walls.add(scene.add.rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE, 0x3f7a34));
            scene.add.text(x * TILE + TILE / 2, y * TILE + TILE / 2, "🌳", { fontSize: "24px" }).setOrigin(0.5);
          }

      // 村へ戻る門(⛩️)。近づくと村シーンへ戻る。
      scene.gate = { x: 2 * TILE + TILE / 2, y: 2 * TILE + TILE / 2 };
      scene.add.text(scene.gate.x, scene.gate.y, "⛩️", { fontSize: "34px" }).setOrigin(0.5).setDepth(1);
      scene.add.text(scene.gate.x, scene.gate.y + 28, "村へ", { fontSize: "12px", color: "#fff" }).setOrigin(0.5).setDepth(1);

      // 敵配置。group=敵のまとまり。forEach で4体を [列, 行, 種類] に従って生成する。
      scene.enemies = scene.physics.add.group();
      [
        { c: 8, r: 4, def: GameData.ENEMIES.slug },
        { c: 13, r: 6, def: GameData.ENEMIES.mold },
        { c: 6, r: 10, def: GameData.ENEMIES.crow },
        { c: 16, r: 11, def: GameData.ENEMIES.boss },
      ].forEach((p) => addEnemy(scene, p.c, p.r, p.def));

      scene.player = addPlayer(scene, 4, 3);
      scene.physics.add.collider(scene.player, walls);   // プレイヤーは壁を通り抜けない
      scene.physics.add.collider(scene.enemies, walls);  // 敵も壁を通り抜けない
      scene.cameras.main.startFollow(scene.player, true, 0.1, 0.1);

      // overlap=「重なった」判定(collider と違い押し返さない)。プレイヤーと敵が重なったら戦闘へ。
      scene.physics.add.overlap(scene.player, scene.enemies, (pl, e) => {
        if (!scene.inBattle) onTouchEnemy(scene, e); // すでに戦闘中でなければ発動
      });

      scene.cursors = scene.input.keyboard.createCursorKeys();
      scene.wasd = scene.input.keyboard.addKeys("W,A,S,D");

      // フィールド内のHP表示(画面左下に固定)
      scene.hpText = scene.add.text(10, H - 10, "", { fontSize: "16px", color: "#fff", backgroundColor: "#0007", padding: { x: 8, y: 4 } })
        .setOrigin(0, 1).setScrollFactor(0).setDepth(200);
      updateHp(scene);

      cbs.refreshHud && cbs.refreshHud();
      toast(scene, `Lv${GameState.profile.level}。赤Lvの敵は追ってくる! 青Lvは逃げる。⛩️で村へ`, 3600);
    }

    // update() … フィールドにいる間、毎フレーム呼ばれる。移動・敵AI・村への帰還を処理。
    update() {
      const scene = this;
      if (scene.inBattle) return; // 戦闘中は探索を止める
      movePlayer(scene);
      const now = scene.time.now, plv = GameState.profile.level; // now=現在時刻, plv=プレイヤーのレベル
      // すべての敵に対してAI(追う/逃げる/うろつく)を実行
      scene.enemies.getChildren().forEach((e) => enemyAI(e, scene.player, plv, now));
      if (dist(scene.player, scene.gate) < 40) scene.scene.start("village"); // 門に近づいたら村へ
    }
  }

  // addEnemy … 敵1体を生成する。c,r=マス目位置, def=敵の定義(絵文字・種類・レベル)。
  function addEnemy(scene, c, r, def) {
    const size = def.kind === "boss" ? 40 : 30; // ボスは大きめ
    const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
    const shadow = addShadow(scene, x, y); // 足元の影
    const e = scene.add.text(x, y, def.emoji, { fontSize: size + "px" }).setOrigin(0.5).setDepth(3);
    scene.physics.add.existing(e); // 物理ボディを付けて動けるようにする
    e.body.setSize(size * 0.8, size * 0.8).setOffset((e.width - size * 0.8) / 2, (e.height - size * 0.8) / 2);
    e.body.setCollideWorldBounds(true);
    e.kind = def.kind; e.level = def.level; // 種類とレベルを敵オブジェクトに覚えさせる
    // 頭上に「Lv◯」のラベルを表示。色でAIの状態(追尾=赤/逃走=青/徘徊=白)を示す。
    e.tag = scene.add.text(e.x, e.y - 24, "Lv" + def.level, { fontSize: "12px", color: "#fff", backgroundColor: "#0007", padding: { x: 3, y: 1 } })
      .setOrigin(0.5).setDepth(4);
    e.nextWander = 0; // 次にうろつく向きを変える時刻(徘徊AIで使う)
    e.shadow = shadow;
    // assets/char/<敵id>.png があればアニメ画像で表示(絵文字は隠す)。無ければ絵文字のまま。
    if (Assets.has(scene, def.id)) { e.setText(""); e.sprite = fitSprite(scene.add.image(x, y, def.id).setDepth(3), size + 10); }
    scene.enemies.add(e);
    return e;
  }

  // enemyAI … 敵1体の行動を決める。プレイヤーとのレベル差で動きが変わる。
  //   ・敵レベル > 自分 … 追いかけてくる(危険!ラベルは赤)
  //   ・敵レベル < 自分 … 逃げる(弱い相手。ラベルは青)
  //   ・同じレベル       … その場をうろつく(徘徊。ラベルは白)
  function enemyAI(e, player, plv, now) {
    // dx,dy=プレイヤーへの向き, d=プレイヤーまでの距離(0で割らないよう最低1にする)
    const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1;
    const CHASE = 78, FLEE = 100, WANDER = 45; // それぞれ 追尾/逃走/徘徊 の速度
    if (e.level > plv) {
      // 追尾:プレイヤー方向(dx/d, dy/d は向きの単位ベクトル)へCHASEの速さで進む
      e.body.setVelocity((dx / d) * CHASE, (dy / d) * CHASE);
      e.tag.setColor("#ff9d9d"); // ラベルを赤に
    } else if (e.level < plv) {
      // 逃走:プレイヤーが近い(200px以内)ときだけ、逆方向(マイナス)へ逃げる。遠ければ徘徊。
      if (d < 200) e.body.setVelocity((-dx / d) * FLEE, (-dy / d) * FLEE);
      else wander(e, now, WANDER);
      e.tag.setColor("#9dd0ff"); // ラベルを青に
    } else {
      // 同格:うろつくだけ
      wander(e, now, WANDER);
      e.tag.setColor("#ffffff"); // ラベルを白に
    }
    e.tag.setPosition(e.x, e.y - 24); // ラベルを敵の頭上に追従させる
    if (e.shadow) e.shadow.setPosition(e.x, e.y + 14); // 影を追従
    if (e.sprite) e.sprite.setPosition(e.x, e.y + Math.sin(now / 250 + e.x) * 2); // 画像を上下に揺らす(敵ごとに位相をずらす)
  }
  // wander … 一定時間ごとにランダムな方向へ歩き出す「徘徊」の動き。
  function wander(e, now, spd) {
    if (now > e.nextWander) { // 前回決めた時刻を過ぎたら向きを変える
      const a = Math.random() * Math.PI * 2; // 0〜360度(ラジアン)のランダムな角度
      // cos/sin で角度を x,y の速度に変換して進ませる
      e.body.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
      e.nextWander = now + 1200 + Math.random() * 1400; // 次に向きを変える時刻(1.2〜2.6秒後)
    }
  }

  // updateHp … 画面左下のHP表示を最新の値に更新する。
  function updateHp(scene) { if (scene.hpText) scene.hpText.setText(`🐧 HP ${hero.hp}/${hero.maxHp}`); }

  // onTouchEnemy … 敵に触れたときの一連の流れ。戦闘 → 結果処理 → 探索へ復帰。
  // async は「途中で待てる関数」の印。中で await を使い、戦闘が終わるまで待つ。
  async function onTouchEnemy(scene, enemy) {
    scene.inBattle = true;      // 戦闘中フラグを立てる(update の動きを止める)
    scene.physics.pause();      // 物理を止めて全員をその場に固定
    scene.player.body.setVelocity(0, 0);

    // Battle.start で戦闘を開始。await で「戦闘が終わって onEnd が呼ばれるまで」ここで待つ。
    // new Promise((res)=>...) は「res が呼ばれたら完了」という待ち合わせの箱。結果を result に受け取る。
    const result = await new Promise((res) =>
      Battle.start({ hero, enemies: GameData.encounter(enemy.kind), onEnd: res }));

    if (result === "lose") {
      // 負けた場合:onDefeat で復活するか聞く(await で選択を待つ)
      const choice = cbs.onDefeat ? await cbs.onDefeat() : "quit";
      if (choice !== "revive") { scene.scene.start("village"); return; } // 復活しないなら村へ戻って終了
      hero.hp = hero.maxHp; // 復活(全回復)
    } else {
      // 勝った場合:経験値・ベリーを獲得。レベルアップしたら最大HPを増やして全回復。
      const r = GameState.grantXp(enemy.kind);
      if (r.leveled) {
        hero.maxHp = GameState.maxHp(); hero.hp = hero.maxHp;
        scene.cameras.main.flash(300, 255, 240, 180); // 画面をパッと光らせるレベルアップ演出
        sparkle(scene, scene.player.x, scene.player.y); // ✨を散らす
      }
      toast(scene, `+${r.gained}XP / 🍓+${r.berries}` + (r.leveled ? `  レベルアップ! Lv${GameState.profile.level}` : ""));
      cbs.refreshHud && cbs.refreshHud();
    }

    // 倒した(または復活した)ので、その敵(画像・影・ラベルも一緒に)を画面から消して探索を再開する
    enemy.tag.destroy();
    if (enemy.sprite) enemy.sprite.destroy();
    if (enemy.shadow) enemy.shadow.destroy();
    enemy.destroy();
    updateHp(scene);
    scene.inBattle = false;  // 戦闘中フラグを下ろす
    scene.physics.resume();  // 物理を再開して再び動けるようにする
  }

  // 外部へ公開するのは launch と destroy の2つだけ(他は内部で隠れている)
  return { launch, destroy };
})();
