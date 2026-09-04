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

  const DPR = Math.min(devicePixelRatio || 1, innerWidth < 780 ? 1.4 : 1.9);
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
  const loader = new THREE.TextureLoader();
  const boards = [];

  WORKS.forEach((w, i) => {
    const group = new THREE.Group();
    const z = -i * SPACING;
    const x = (i % 2 === 0 ? -1 : 1) * 3.4;
    group.position.set(x, (i % 2 === 0 ? .5 : -.4), z);

    const geo = new THREE.PlaneGeometry(6.0, 4.5, 24, 18);
    const mat = new THREE.MeshBasicMaterial({ color: 0x24404d });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    loader.load(w.img, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.color.set(0x7c93a4);              // 压一档，让它沉进水色而不是贴上去
      mat.needsUpdate = true;
    });

    // 画框：细边，用蓝紫描一圈
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(6.14, 4.64)),
      new THREE.LineBasicMaterial({ color: 0x8491c7, transparent: true, opacity: .5 }));
    group.add(edge);

    scene.add(group);
    boards.push({ group, mesh, baseX: x, i });
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
  let camZ = 10, targetZ = 10, mx = 0, my = 0, tmx = 0, tmy = 0;

  function progress() {
    const r = stage.getBoundingClientRect();
    const total = stage.offsetHeight - innerHeight;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, -r.top / total));
  }
  function onScroll() { targetZ = 10 - progress() * TRAVEL; }
  addEventListener('scroll', onScroll, { passive: true });
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
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const t = clock.getElapsedTime();

    camZ += (targetZ - camZ) * (REDUCE ? 1 : .075);     // 阻尼，硬跟滚动条会顿
    mx   += (tmx - mx) * .05;
    my   += (tmy - my) * .05;

    camera.position.z = camZ;
    camera.position.x = mx * 2.2;                       // 鼠标微幅偏移 = 手持镜头感
    camera.position.y = -my * 1.2;
    camera.lookAt(0, 0, camZ - 12);

    boards.forEach((b) => {
      // 画板随镜头轻微转向，永远略微朝着观众
      const d = b.group.position.z - camZ;
      b.group.rotation.y = THREE.MathUtils.clamp(-b.baseX * .045 + mx * .12, -.5, .5);
      b.group.rotation.x = my * .06;
      b.group.position.y += Math.sin(t * .5 + b.i) * .0012;   // 极缓的浮动
      b.mesh.material.opacity = 1;
    });
    pts.rotation.y = t * .006;

    // 把「当前最近的画板」交给 HUD —— 之前用滚动比例反推分段是猜的，
    // 画板数一变就对不上。这里直接取真实的镜头-画板距离。
    let best = 0, bd = 1e9;
    for (const b of boards) {
      const d = Math.abs(b.group.position.z - camZ);
      if (d < bd) { bd = d; best = b.i; }
    }
    if (document.body.dataset.board !== String(best)) {
      document.body.dataset.board = String(best);
      // 必须主动通知：HUD 只在 scroll 事件里重算，而这个值是渲染循环里
      // 异步变的（镜头有阻尼，滚动停下后才收敛）→ 不发事件 HUD 永远慢一拍
      dispatchEvent(new CustomEvent('board:change', { detail: best }));
    }

    renderer.render(scene, camera);
  });

  document.body.classList.add('has3d');
}
