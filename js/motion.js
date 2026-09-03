/* ============================================================================
   动效系统 v3

   为什么 v2 的滚动揭示"看不见"（实测诊断）：
     位移 8px  → 小于半个行距，视觉上等于没动
     时长 .4s  → 短时长 + 小位移 = 只剩闪烁
     ease power2.out → 减速尾巴太短，读不出"落位"感
     **没有遮罩** → 这是最关键的一条。没遮罩的 opacity+y 永远只是淡入；
                    有遮罩之后同样的位移会产生"从边缘后面升起来"的物理感。
   ========================================================================== */
(function () {
  'use strict';

  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsap = window.gsap;
  if (typeof gsap === 'undefined') { document.body.classList.add('no-motion'); return; }
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
  const hasSplit = typeof window.SplitText !== 'undefined';
  if (hasSplit) gsap.registerPlugin(window.SplitText);

  // 缓动体系：强 out 才有"落位"感
  const E_RISE = 'power4.out';   // 文字升起
  const E_WIPE = 'expo.out';     // 擦出类
  const E_NUM  = 'power2.out';   // 数字计数：稳、可信

  if (REDUCE) {
    document.querySelectorAll('.rv,.rv-line,.rv-img,.w').forEach(el => {
      el.style.opacity = 1; el.style.clipPath = 'none';
    });
    document.querySelectorAll('[data-count]').forEach(el => {
      el.textContent = el.getAttribute('data-count');
    });
    return;
  }

  /* ── 1. 标题：按行遮罩揭示（最高级的一档） ────────────────────────
        中文注意：逐字 stagger 在 50+ 字的正文里显得廉价且拖沓，
        只对 4–10 字的短标题用逐字；长标题一律按行。 */
  function revealLines(el, opts) {
    opts = opts || {};
    const run = (targets) => gsap.from(targets, {
      yPercent: 118, duration: 1.05, ease: E_RISE, stagger: 0.085,
      scrollTrigger: { trigger: el, start: opts.start || 'top 84%', once: true },
    });

    if (hasSplit) {
      try {
        // mask:'lines' 让 SplitText 自动给每行套一层 overflow:hidden 的父容器，
        // 这正是"遮罩"的来源，不用自己写 wrapper。
        const st = new window.SplitText(el, {
          type: 'lines', mask: 'lines', linesClass: 'ln++',
          // 中文没有空格，按空格切词会把整段当一个词；按字符边界切才分得开行
          wordDelimiter: { delimiter: '', replaceWith: '' },
        });
        if (st.lines && st.lines.length) { run(st.lines); return; }
      } catch (e) { /* 落到下面的回退 */ }
    }
    // 回退：整块套遮罩升起
    const wrap = document.createElement('span');
    wrap.className = 'ln-mask';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    run(el);
  }

  document.querySelectorAll('.rv-line').forEach((el) => revealLines(el));

  /* ── 2. 配图：clip-path 擦出 + 图片反向位移
        单纯 clip 是"长出来"，配上图片反向走才是"被揭开"。 ── */
  gsap.utils.toArray('.rv-img').forEach((box) => {
    const img = box.querySelector('img');
    const tl = gsap.timeline({
      scrollTrigger: { trigger: box, start: 'top 86%', once: true },
    });
    tl.fromTo(box,
      { clipPath: 'inset(0 0 100% 0)' },
      { clipPath: 'inset(0 0 0% 0)', duration: 1.15, ease: E_WIPE });
    if (img) tl.from(img, { scale: 1.16, yPercent: -7, duration: 1.5, ease: E_WIPE }, 0);
  });

  /* ── 3. 分区动效语汇 ────────────────────────────────────────────
        「AI 味」的机械根因不是文案，是**全站只有一种动效语汇**：
        同一个 easing、同一个时长、同一种入场方向。真人做的站按内容换手法。
        下面每个区用不同的语汇，同页出现 2–3 种 easing。 */

  // (a) 详情正文：位移 + 失焦对焦 + 轻微缩放。
  //     位移必须给到 56px 以上 —— 8px 低于人眼动效感知阈值，等于没做。
  gsap.utils.toArray('.detail .rv').forEach((el) => {
    gsap.fromTo(el,
      { opacity: 0, y: 58, filter: 'blur(9px)', scale: .985 },
      {
        opacity: 1, y: 0, filter: 'blur(0px)', scale: 1,
        duration: 1.15, ease: E_RISE,
        // 整齐划一是机器感的来源，给每个元素一点随机延迟
        delay: gsap.utils.random(0, 0.1),
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
  });

  // (b) 关于区：**刻意不做位移**，只做失焦→对焦。留白，形成节奏差
  gsap.utils.toArray('.about .rv').forEach((el) => {
    gsap.fromTo(el,
      { opacity: 0, filter: 'blur(13px)' },
      {
        opacity: 1, filter: 'blur(0px)',
        duration: 1.5, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      });
  });

  // (c) 时间线：全站唯一有滚动视差的地方。
  //     scrub 用小数不用 true —— 0.8 会有一点惯性拖尾，比死绑滚动条自然
  gsap.utils.toArray('.tl .row').forEach((row, i) => {
    gsap.fromTo(row, { xPercent: i % 2 ? 2.2 : -2.2, opacity: .55 },
      {
        xPercent: 0, opacity: 1, ease: 'none',
        scrollTrigger: { trigger: row, start: 'top 92%', end: 'top 55%', scrub: 0.8 },
      });
  });

  // (d) 页脚：轻盈收尾，只有缩放没有位移
  gsap.utils.toArray('footer .rv').forEach((el) => {
    gsap.fromTo(el, { opacity: 0, scale: .96 },
      {
        opacity: 1, scale: 1, duration: 1.3, ease: E_WIPE,
        scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      });
  });

  // (e) 其余零散块兜底
  gsap.utils.toArray('.rv').forEach((el) => {
    if (el.closest('.detail,.about,footer')) return;
    gsap.fromTo(el, { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 1.05, ease: E_RISE,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
  });

  /* ── 5. 作品列表：第一屏错峰升起 ── */
  gsap.set('.wl', { opacity: 0, y: 34 });
  gsap.to('.wl', { opacity: 1, y: 0, duration: 1.2, ease: E_RISE,
    stagger: { each: 0.13, from: 'random' }, delay: 0.2 });
  gsap.from('.top', { opacity: 0, duration: 1.1, ease: 'power2.out' });
  gsap.from('.stage .cue', { opacity: 0, duration: .9, delay: 1.0, ease: 'power2.out' });

  /* ── 6. 伪 3D ─────────────────────────────────────────────────
        (a) 鼠标驱动的场景视差：不同层按不同幅度位移 = 伪摄像机
        (b) 作品行的 3D 倾斜 */
  if (window.matchMedia('(hover:hover)').matches) {

    // (a) 场景视差
    const layers = document.querySelectorAll('[data-depth]');
    if (layers.length) {
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
      window.addEventListener('pointermove', (e) => {
        tx = (e.clientX / window.innerWidth - .5);
        ty = (e.clientY / window.innerHeight - .5);
        if (!raf) raf = requestAnimationFrame(tick);
      }, { passive: true });
      function tick() {
        cx += (tx - cx) * .06; cy += (ty - cy) * .06;
        layers.forEach((l) => {
          const d = parseFloat(l.getAttribute('data-depth')) || 0;
          l.style.transform = `translate3d(${-cx * d * 34}px, ${-cy * d * 34}px, 0)`;
        });
        raf = (Math.abs(tx - cx) > .001 || Math.abs(ty - cy) > .001)
          ? requestAnimationFrame(tick) : null;
      }
    }

    // (b) 作品行 3D 倾斜。
    // 绝不在 pointermove 里量正在被旋转的元素——包围盒会随角度变，
    // 拿它归一化会正反馈抖动，且每帧强制同步布局。进入时量一次并缓存。
    document.querySelectorAll('.wl').forEach((row) => {
      const MAX = 5;
      let box = null, raf = null;
      row.addEventListener('pointerenter', () => {
        row.style.transition = 'none';
        row.style.transform = '';
        box = row.getBoundingClientRect();
      });
      row.addEventListener('pointermove', (e) => {
        if (!box) box = row.getBoundingClientRect();
        const px = (e.clientX - box.left) / box.width;
        const py = (e.clientY - box.top) / box.height;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          row.style.transform =
            `perspective(1100px) rotateY(${(px - .5) * MAX * 2}deg) ` +
            `rotateX(${-(py - .5) * MAX * 1.2}deg) translateZ(0)`;
          raf = null;
        });
      });
      row.addEventListener('pointerleave', () => {
        box = null;
        row.style.transition = 'transform .7s cubic-bezier(.22,1,.36,1)';
        row.style.transform = '';
        setTimeout(() => { row.style.transition = ''; }, 720);
      });
    });
  }
})();
