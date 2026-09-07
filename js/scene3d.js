/* ============================================================================
   滚动驱动的 3D 镜头推进

   概念：三个作品是悬浮在水中的三块「画板」，沿 Z 轴依次排开。
   滚动 = 镜头向前推进，依次穿过它们。莫奈的雾气负责纵深与消隐。

   为什么不是 CSS 3D：CSS 的 perspective 没有真正的景深、雾和 Z 排序，
   做不出"穿过去"的感觉。这里要的是镜头在空间里移动，必须上真 3D。
   ========================================================================== */
import * as THREE from 'three';

const host = document.getElementById('scene3d');
const stage = document.getElementById('stage3d');
if (host && stage) init();

function init() {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WORKS = [...document.querySelectorAll('.w3-data')].map((el) => ({
    img: el.dataset.img, href: el.dataset.href,
  }));
  if (!WORKS.length) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: host, antialias: true, alpha: false });
  } catch (e) { document.body.classList.add('no3d'); return; }
  if (!renderer.getContext()) { document.body.classList.add('no3d'); return; }

  const DPR = Math.min(devicePixelRatio || 1, innerWidth < 780 ? 1.3 : 1.6);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight);

  const scene = new THREE.Scene();
  const BG = 0x0a1c24;                       // --abyss
  scene.background = new THREE.Color(BG);
  // 雾是纵深的来源：远处的画板自然溶进底色，不需要手动淡出
  scene.fog = new THREE.FogExp2(BG, 0.052);

  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 0, 10);

  scene.add(new THREE.AmbientLight(0x8fa6c4, 1.5));
  const key = new THREE.DirectionalLight(0xc9dbe1, 1.15);
  key.position.set(4, 6, 10); scene.add(key);
  const rim = new THREE.PointLight(0x8491c7, 24, 60);   // 蓝紫补光 = 睡莲倒影
  rim.position.set(-6, 2, -14); scene.add(rim);

  /* ── 作品画板：沿 Z 轴排开，左右交错 ── */
  const SPACING = 17;
  const PLANE_W = 6.0, PLANE_H = 4.5;      // 画板框；纹理按真实比例装进这个框
  const loader = new THREE.TextureLoader();
  const boards = [];

  WORKS.forEach((w, i) => {
    const group = new THREE.Group();
    const z = -i * SPACING;
    const x = (i % 2 === 0 ? -1 : 1) * 3.4;
    group.position.set(x, (i % 2 === 0 ? .5 : -.4), z);

    const geo = new THREE.PlaneGeometry(PLANE_W, PLANE_H, 24, 18);
    const mat = new THREE.MeshBasicMaterial({ color: 0x24404d });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    // 画框：细边，用蓝紫描一圈。必须在 loader 回调之前建好——回调里要按纹理比例缩它。
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(PLANE_W + .14, PLANE_H + .14)),
      new THREE.LineBasicMaterial({ color: 0x8491c7, transparent: true, opacity: .5 }));
    group.add(edge);

    loader.load(w.img, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      mat.map = tex;
      mat.color.set(0x7c93a4);              // 压一档，让它沉进水色而不是贴上去
      mat.needsUpdate = true;

      /* 按纹理真实比例校正。画板是固定 6.0×4.5（4:3），而截图什么比例都有，
         直接贴上去必然被拉伸——正是「内容扭曲」的来源。
         这里把网格缩到与图同比例并整体装进画板框内，短边留空而不是拉长。 */
      const iw = tex.image && tex.image.width, ih = tex.image && tex.image.height;
      if (iw && ih) {
        const A = iw / ih, PA = PLANE_W / PLANE_H;
        const sx = A >= PA ? 1 : (PLANE_H * A) / PLANE_W;
        const sy = A >= PA ? (PLANE_W / A) / PLANE_H : 1;
        mesh.scale.set(sx, sy, 1);
        edge.scale.set(sx, sy, 1);
      }
    });

    scene.add(group);
    boards.push({ group, mesh, edge, baseX: x, i });
  });

  /* ── 悬浮微粒：给空间一点"水里有东西"的实感 ── */
  const N = 900;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3]     = (Math.random() - .5) * 46;
    pos[i * 3 + 1] = (Math.random() - .5) * 26;
    pos[i * 3 + 2] = -Math.random() * (WORKS.length * SPACING + 30) + 12;
  }
  const pts = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
    new THREE.PointsMaterial({ color: 0xbdc0cf, size: .055, transparent: true, opacity: .5 }));
  scene.add(pts);

  /* ── 滚动 → 镜头 Z ── */
  const TRAVEL = (WORKS.length - 1) * SPACING + 20;

  /* 滚动行程必须跟着画板数走。CSS 里那个 height 是按 6 块写死的，
     加到 18 块后镜头会在 30% 处就冲到最后一块、HUD 直接熄灭。
     这里按每块 ~72vh 推导，以后再加图也不会脱节。 */
  stage.style.height = Math.round(WORKS.length * 86 + 90) + 'vh';
  let camZ = 10, targetZ = 10, mx = 0, my = 0, tmx = 0, tmy = 0;

  /* ── 分段驻留：每块画板有一个「特写区间」，镜头在它正前方近乎停住 ──
     原来是 progress 线性映射到 z，画板匀速掠过，根本来不及看清内容。
     现在把每一段滚动拆成「平台—过渡—平台」：前后各 DWELL/2 的输入范围
     不产生位移（镜头驻留），中间那段才走完整段距离。 */
  const NB = WORKS.length;
  const VIEW = 7.6;                                  // 停在画板前方多远最好看
  const DWELL = 0.54;                                // 每段里驻留占的比例
  const idealZ = (i) => -i * SPACING + VIEW;
  const smooth = (x) => x * x * (3 - 2 * x);

  function camZAt(p) {
    if (NB === 1) return idealZ(0);
    const u = p * (NB - 1);
    const i = Math.min(NB - 2, Math.floor(u));
    const f = u - i;
    const h = DWELL / 2;
    let g;
    if (f <= h) g = 0;
    else if (f >= 1 - h) g = 1;
    else g = smooth((f - h) / (1 - DWELL));
    return idealZ(i) + (idealZ(i + 1) - idealZ(i)) * g;
  }

  function progress() {
    const r = stage.getBoundingClientRect();
    const total = stage.offsetHeight - innerHeight;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, -r.top / total));
  }
  function onScroll() { targetZ = camZAt(progress()); lastScrollAt = performance.now(); }
  addEventListener('scroll', onScroll, { passive: true });

  /* ── 回落吸附：停止滚动后落到最近的驻留中心 ──
     必须走 Lenis，自己调 scrollTo 会和惯性互相拉扯。
     两个护栏：① 只在用户真的停下来（IDLE_MS）后才动手，避免还在滚时被拽回；
     ② 已经很接近目标就不动，否则会有一次多余的微跳。 */
  const IDLE_MS = 260;
  let lastScrollAt = performance.now();
  let snapped = false;

  function snapToNearest() {
    const total = stage.offsetHeight - innerHeight;
    if (total <= 0 || NB < 2) return;
    const i = Math.round(progress() * (NB - 1));
    const stageTop = stage.getBoundingClientRect().top + scrollY;
    const y = stageTop + (i / (NB - 1)) * total;
    if (Math.abs(y - scrollY) < 8) { snapped = true; return; }
    snapped = true;
    const lenis = window.__lenis;
    if (lenis && typeof lenis.scrollTo === 'function') {
      lenis.scrollTo(y, { duration: .85, easing: (t) => 1 - Math.pow(1 - t, 3) });
    } else {
      scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  onScroll();

  addEventListener('pointermove', (e) => {
    tmx = (e.clientX / innerWidth - .5);
    tmy = (e.clientY / innerHeight - .5);
  }, { passive: true });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    onScroll();
  });

  // 只在 3D 区可见时渲染 —— 观察的是随页面滚动的容器，不是 fixed 的 canvas。
  // 观察 fixed 元素会恒为 isIntersecting=true，"滚走就停"永远不触发。
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 })
    .observe(stage);

  const clock = new THREE.Clock();
  let lastFocusQ = -1;
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const t = clock.getElapsedTime();

    camZ += (targetZ - camZ) * (REDUCE ? 1 : .075);     // 阻尼，硬跟滚动条会顿
    mx   += (tmx - mx) * .05;
    my   += (tmy - my) * .05;

    /* 停止滚动后回落到最近驻留中心；用户一动就重新解锁 */
    const idle = performance.now() - lastScrollAt;
    if (!REDUCE && visible) {
      if (idle > IDLE_MS && !snapped) snapToNearest();
      if (idle < IDLE_MS) snapped = false;
    }

    /* 静止微浮：只在吸附完成且确实闲置时开，滚动中开会和阻尼叠成抖动 */
    const settle = REDUCE ? 0 : Math.min(1, Math.max(0, (idle - 700) / 600));
    const bob = Math.sin(t * .55) * .085 * settle;

    camera.position.z = camZ;
    camera.position.x = mx * 2.2;                       // 鼠标微幅偏移 = 手持镜头感
    camera.position.y = -my * 1.2 + bob;
    camera.lookAt(0, 0, camZ - 12);

    // 先找出最近的画板与它的「聚焦度」：1 = 正处在特写机位，0 = 远离
    let best = 0, bd = 1e9;
    for (const b of boards) {
      const d = Math.abs(idealZ(b.i) - camZ);
      if (d < bd) { bd = d; best = b.i; }
    }
    const focus = smooth(Math.min(1, Math.max(0, 1 - bd / (SPACING * .46))));

    boards.forEach((b) => {
      // 画板随镜头轻微转向，永远略微朝着观众
      b.group.rotation.y = THREE.MathUtils.clamp(-b.baseX * .045 + mx * .12, -.5, .5);
      b.group.rotation.x = my * .06;
      b.group.position.y += Math.sin(t * .5 + b.i) * .0012 + (b.i === best ? bob * .012 : 0);

      /* 聚焦的那块恢复全亮度并微微推近：原来所有画板都压到 0x7c93a4
         「沉进水色」，好看但正是用户说的看不清。只在特写区间还原。 */
      const k = (b.i === best) ? focus : 0;
      const g = 0x7c / 255 + (1 - 0x7c / 255) * k;
      const gg = 0x93 / 255 + (1 - 0x93 / 255) * k;
      const gb = 0xa4 / 255 + (1 - 0xa4 / 255) * k;
      if (b.mesh.material.map) b.mesh.material.color.setRGB(g, gg, gb);
      const s = 1 + .085 * k;
      b.group.scale.set(s, s, 1);
      if (b.edge) b.edge.material.opacity = .5 + .38 * k;
    });
    pts.rotation.y = t * .006;

    if (document.body.dataset.board !== String(best)) {
      document.body.dataset.board = String(best);
      // 必须主动通知：HUD 只在 scroll 事件里重算，而这个值是渲染循环里
      // 异步变的（镜头有阻尼，滚动停下后才收敛）→ 不发事件 HUD 永远慢一拍
      dispatchEvent(new CustomEvent('board:change', { detail: best }));
    }
    // 卡片要跟着聚焦度连续变化，不能只在换板时通知一次
    const fq = Math.round(focus * 20) / 20;
    if (fq !== lastFocusQ) {
      lastFocusQ = fq;
      document.documentElement.style.setProperty('--board-focus', String(fq));
      dispatchEvent(new CustomEvent('board:focus', { detail: { index: best, focus: fq } }));
    }

    renderer.render(scene, camera);
  });

  document.body.classList.add('has3d');
}
