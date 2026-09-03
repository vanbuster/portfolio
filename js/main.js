/* ============================================================================
   交互层 v2

   设计原则（来自调研结论）：印象派的质感来自**笔触边界的柔和**与**光的层叠**，
   不来自"元素飞进来"。所以揭示用柔和淡入 + 极轻位移，光效用 mix-blend-mode 叠加，
   而不是清一色的 translateY 滑动堆砌。
   ========================================================================== */
(function () {
  'use strict';

  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsap = window.gsap;
  const hasGSAP = typeof gsap !== 'undefined';

  /* ── 平滑滚动。Lenis 必须挂进 GSAP 的 ticker，
        两者各跑各的 rAF 会差一帧，视差会抖。 ── */
  let lenis = null;
  if (!REDUCE && typeof window.Lenis !== 'undefined') {
    lenis = new window.Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: false,   // 注意不是 smoothTouch —— 那是 Lenis v0.x 的旧名，
                          // 1.3.26 里根本没这个键，传进去被静默忽略
    });
    if (hasGSAP) {
      lenis.on('scroll', () => window.ScrollTrigger && window.ScrollTrigger.update());
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  /* ── 锚点走 Lenis，否则和惯性滚动打架 ── */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el, { offset: -20 });
      else el.scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* ── 揭示：柔和淡入 + 8px 位移。
        位移只是给柔边一点"呼吸"，不是主效果。 ── */
  if (hasGSAP && !REDUCE) {
    if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

    gsap.set('.w', { opacity: 0, y: 14 });
    gsap.to('.w', {
      opacity: 1, y: 0, duration: 1.25, ease: 'power3.out',
      stagger: 0.14, delay: 0.18,
    });
    gsap.from('.top', { opacity: 0, duration: 1.2, delay: 0.05, ease: 'power2.out' });
    gsap.from('.stage .cue', { opacity: 0, duration: 1, delay: 0.9, ease: 'power2.out' });

    gsap.utils.toArray('.rv').forEach((el) => {
      gsap.fromTo(el, { opacity: 0, y: 8 }, {
        opacity: 1, y: 0, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });

    // 截图极轻视差。幅度大了像 PPT 转场，这里只取 ±2.5%
    gsap.utils.toArray('.sh img').forEach((img) => {
      gsap.fromTo(img, { yPercent: -2.5 }, {
        yPercent: 2.5, ease: 'none',
        scrollTrigger: { trigger: img, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  } else {
    document.querySelectorAll('.rv, .w').forEach((el) => { el.style.opacity = 1; });
  }

  /* ── 作品列表：光标跟随预览。
        用 transform 移动 fixed 层，不碰 top/left，避免每帧重排。
        位置做阻尼跟随，硬跟手会显得廉价。 ── */
  const peek = document.querySelector('.peek');
  const peekImg = peek && peek.querySelector('img');
  const rows = document.querySelectorAll('.wl');

  if (peek && peekImg && rows.length &&
      !REDUCE && window.matchMedia('(hover:hover)').matches) {
    let tx = 0, ty = 0, cx = 0, cy = 0, on = false, raf = null;
    // 预览必须待在右侧带内。纯跟手会直接盖住它正在预览的那行标题
    // （实测第一版就把 "PRD Copilot" 遮掉了一半）。
    const clampX = (x) => Math.min(
      Math.max(x + 40, window.innerWidth * 0.63),
      window.innerWidth - Math.min(window.innerWidth * 0.30, 380) - 34
    );
    const OFF_Y = -96;

    rows.forEach((r) => {
      r.addEventListener('pointerenter', () => {
        const src = r.getAttribute('data-img');
        if (src && peekImg.getAttribute('src') !== src) peekImg.setAttribute('src', src);
        on = true; peek.classList.add('on');
        if (!raf) raf = requestAnimationFrame(tick);
      });
      r.addEventListener('pointerleave', () => { on = false; peek.classList.remove('on'); });
    });

    window.addEventListener('pointermove', (e) => {
      tx = clampX(e.clientX); ty = e.clientY + OFF_Y;
      if (!cx && !cy) { cx = tx; cy = ty; }      // 首次不要从 (0,0) 飞过来
    }, { passive: true });

    function tick() {
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      peek.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      if (on || Math.abs(tx - cx) > 0.5) raf = requestAnimationFrame(tick);
      else raf = null;
    }
  }

  console.log('%c你打开控制台了。', 'font-size:15px;font-weight:700;color:#8491c7');
  console.log(
    '%c这个站没有框架。背景是手写的域扭曲着色器（约 4KB）——\n' +
    'Three.js 要 650KB，而我只需要一个铺满屏的四边形。\n' +
    '配色不是调出来的，是从莫奈《睡莲》《蓝睡莲》《鲁昂大教堂》采样的：\n' +
    '  #42697d 水面阴影 · #618b7e 水草绿 · #8491c7 蓝紫笔触 · #e0dcc8 暖白\n' +
    '正文用暖白而非纯白，因为印象派里没有纯白。\n\n' +
    '觉得这种较真有意思 → 15679712218@163.com',
    'color:#bdc0cf;line-height:1.75'
  );
})();
