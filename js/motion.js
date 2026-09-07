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

  /* ── 7. 3D 舞台的 HUD：按镜头进度切换文字 ── */
  const stage3d = document.getElementById('stage3d');
  const hud = [...document.querySelectorAll('.hud-item')];
  if (stage3d && hud.length) {
    const n = hud.length;
    const boardEls = [...document.querySelectorAll('.w3-data')];
    const boards = boardEls.length || n;
    // 每个作品的画板数不等（PRD 6 / 数字分身 3 / 墨卦 9），
    // 所以按 data-work 显式归属，不能再用 boards/n 均分——均分会让 HUD 和画面错位。
    const workOf = boardEls.map(el => Number(el.dataset.work));
    const hasWork = workOf.length && workOf.every(v => Number.isFinite(v));
    const perWork = Math.max(1, Math.round(boards / n));
    const upd = () => {
      const r = stage3d.getBoundingClientRect();
      const total = stage3d.offsetHeight - innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      // 优先用 3D 场景报告的真实最近画板；没有 3D 时退回按比例分段
      const raw = document.body.dataset.board;
      const idx = raw !== undefined
        ? (hasWork ? Math.min(n - 1, workOf[Number(raw)] ?? 0)
                   : Math.min(n - 1, Math.floor(Number(raw) / perWork)))
        : Math.min(n - 1, Math.floor(p / (1 / (n + 0.15))));
      const inStage = p < 0.97;
      hud.forEach((el, i) => el.classList.toggle('on', inStage && i === idx));
      document.body.classList.toggle('scrolled', p > 0.02);
    };
    addEventListener('scroll', upd, { passive: true });
    addEventListener('board:change', upd);
    addEventListener('load', upd);
    upd(); requestAnimationFrame(upd);   // 布局稳定后再算一次
  }

  /* ── 8. 堆叠幻灯片：出场的那张缩小+压暗，做出"叠在下面"的层次 ── */
  const slides = gsap.utils.toArray('.slide');
  slides.forEach((sl, i) => {
    if (i === slides.length - 1) return;      // 最后一张不需要被压
    // 必须 fromTo 并显式写出起始 filter：
    // 从 filter:none 补间时 GSAP 会把基线当 0，中途出现 brightness(0.08) 这种近乎全黑的值
    gsap.fromTo(sl, { scale: 1, filter: 'brightness(1)' }, {
      scale: 0.93, filter: 'brightness(0.55)', ease: 'none',
      scrollTrigger: {
        trigger: slides[i + 1],
        start: 'top bottom', end: 'top top', scrub: 0.6,
      },
    });
  });
})();

/* ══════════════════════════════════════════════════════════════════════
   特写卡片：跟随 3D 走廊的驻留区间弹出
   数据来自 .w3-data 的 data-* —— 和画板同一个真相源，不另建一份。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const card = document.getElementById('focusCard');
  const stage = document.getElementById('stage3d');
  if (!card || !stage) return;

  const data = [...document.querySelectorAll('.w3-data')].map((el) => ({
    title: el.dataset.title || '', note: el.dataset.note || '',
    href: el.dataset.href || '#', work: Number(el.dataset.work || 0),
  }));
  if (!data.length) return;

  const elNo = document.getElementById('fcNo');
  const elTitle = document.getElementById('fcTitle');
  const elNote = document.getElementById('fcNote');
  const elLink = document.getElementById('fcLink');
  card.querySelector('.fc-no i').textContent = '/ ' + data.length;

  let cur = -1;
  function paint(i) {
    const d = data[i]; if (!d) return;
    elNo.textContent = String(i + 1).padStart(2, '0');
    elTitle.textContent = d.title;
    elNote.textContent = d.note;
    elLink.setAttribute('href', d.href);
    // 现在指向的是真实作品站/仓库，不再是站内锚点 —— 必须开新标签页，
    // 否则用户点一下就离开作品集，回来还得从头滚 3D 走廊。
    const external = /^https?:/i.test(d.href);
    if (external) { elLink.target = '_blank'; elLink.rel = 'noopener'; elLink.textContent = '打开作品 ↗'; }
    else { elLink.removeAttribute('target'); elLink.textContent = '看细节 →'; }
    // 画板 x 在 scene3d 里是 (i%2===0 ? -1 : 1)*3.4：偶数在左，奇数在右。
    // 卡片去对侧，data-side 记的是「画板在哪边」。
    document.body.dataset.side = (i % 2 === 0) ? 'L' : 'R';
    cur = i;
  }
  paint(0);

  addEventListener('board:change', (e) => {
    const i = Number(e.detail);
    if (Number.isFinite(i) && i !== cur) paint(i);
  });

  addEventListener('board:focus', (e) => {
    const f = (e.detail && e.detail.focus) || 0;
    // 阈值要留迟滞，否则在临界点会闪
    const on = document.body.classList.contains('fc-on');
    if (!on && f > 0.42) document.body.classList.add('fc-on');
    else if (on && f < 0.24) document.body.classList.remove('fc-on');
  });

  // 走出 3D 区就收起，避免卡片挂在后面的章节上
  new IntersectionObserver(([en]) => {
    if (!en.isIntersecting) document.body.classList.remove('fc-on');
  }, { threshold: 0 }).observe(stage);
})();

/* ══════════════════════════════════════════════════════════════════════
   堆叠幻灯片的「退场」：下一张升起覆盖时，上一张的内容随覆盖率缩小、
   淡出、轻微失焦并上移，读起来是「第一张退场、第二张呈现」，
   而不是两张硬叠在一起。
   缩放只作用于 .wrap（内容层），.slide 自身保持不变，圆角与背景不变形。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (typeof window.gsap === 'undefined' || !window.ScrollTrigger) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const slides = window.gsap.utils.toArray('.deck .slide');
  if (slides.length < 2) return;

  slides.forEach((slide, i) => {
    const next = slides[i + 1];
    if (!next) return;
    const inner = slide.querySelector('.wrap');
    if (!inner) return;
    window.gsap.fromTo(inner,
      { scale: 1, opacity: 1, filter: 'blur(0px)', y: 0 },
      {
        scale: .86, opacity: .18, filter: 'blur(5px)', y: -34, ease: 'none',
        scrollTrigger: {
          trigger: next,
          start: 'top bottom',   // 下一张刚露头
          end: 'top top',        // 下一张完全覆盖
          scrub: .55,            // 小数而非 true：留一点惯性拖尾，不死绑滚动条
        },
      });
  });
})();
