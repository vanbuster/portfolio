/* ============================================================================
   莫奈水面：域扭曲（domain warping）+ 笔触噪声

   为什么是域扭曲：印象派水面的视觉特征是"形状被光扰动、边缘互相渗透"。
   域扭曲正是这个的数学对应 —— 用噪声去偏移另一层噪声的采样坐标，
   得到的纹理天然有"流动感"和"互相渗透的色块"，而不是规则的渐变。
   （Inigo Quilez 的经典技法：fbm(p + fbm(p + fbm(p))) ）

   为什么不用 Three.js / OGL：这里只需要一个铺满屏的四边形 + 片元着色器。
   Three.js 650KB；OGL 是源码型 ESM（入口 src/index.js），CDN 引入要拉几十个文件。
   手写这一份约 4KB。
   ========================================================================== */
(function () {
  'use strict';

  const cv = document.getElementById('glcanvas');
  if (!cv) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = !reduce && (cv.getContext('webgl', { antialias: false, alpha: false })
                      || cv.getContext('experimental-webgl'));

  if (!gl) {
    // 降级：用静态多层径向渐变模拟同一套配色，内容完全不受影响
    cv.style.background =
      'radial-gradient(1200px 800px at 25% 20%, #3E6E8E 0%, transparent 58%),' +
      'radial-gradient(1000px 700px at 78% 40%, #6B7FA8 0%, transparent 60%),' +
      'radial-gradient(900px 700px at 50% 88%, #4E7C6E 0%, transparent 62%),' +
      'linear-gradient(180deg, #16293B 0%, #1B3448 100%)';
    return;
  }

  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  const FRAG = `
    precision highp float;
    uniform vec2  u_res;
    uniform float u_t;
    uniform vec2  u_mouse;

    vec2 hash(vec2 p){
      p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)));
      return -1.0 + 2.0*fract(sin(p)*43758.5453123);
    }
    float noise(vec2 p){
      vec2 i=floor(p), f=fract(p);
      vec2 u=f*f*(3.0-2.0*f);
      return mix(mix(dot(hash(i+vec2(0,0)),f-vec2(0,0)),
                     dot(hash(i+vec2(1,0)),f-vec2(1,0)),u.x),
                 mix(dot(hash(i+vec2(0,1)),f-vec2(0,1)),
                     dot(hash(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);
    }
    // 噪声以 0 为中心，取色前必须映射到 [0,1]，否则整屏死黑（v1 踩过）
    float fbm(vec2 p){
      float v=0.0, a=0.5;
      for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; }
      return v*0.5+0.5;
    }


    // ── 笔触量化：印象派的关键不是"更好的渐变"，是**离散的笔触** ──
    // 连续噪声场无论怎么调都像生成式渐变（用户说的"AI 痕迹"就是这个）。
    // 真画的特征是：一笔之内颜色近似恒定，笔与笔之间有可辨认的边界，
    // 且笔触沿同一股"运笔方向"成簇。下面按这三点构造。
    vec2 rot(vec2 v, vec2 d){ return vec2(dot(v,d), dot(v, vec2(-d.y,d.x))); }

    // 返回：xy=该笔触的采样中心（用于取色），z=笔内软边权重，w=沿笔方向的位置
    vec4 strokeCell(vec2 q, vec2 dir, float scale, float aspect, float seed){
      vec2 t = rot(q, dir) * scale;
      t.x /= aspect;                       // 沿运笔方向拉长 → 笔是扁的，不是方块
      vec2 cell = floor(t);
      vec2 f    = fract(t) - 0.5;
      // 抖动笔触中心，避免网格感
      vec2 j = hash(cell + seed) * 0.34;
      vec2 d = f - j;
      // 椭圆软边：笔触有边界但不是硬切
      float e = length(vec2(d.x*aspect, d.y));
      float w = 1.0 - smoothstep(0.28, 0.62, e);
      vec2 center = (cell + 0.5 + j);
      center.x *= aspect;
      center = rot(center / scale, vec2(dir.x, -dir.y));
      return vec4(center, w, d.x);
    }

    // 只取笔触高度，用于有限差分求梯度。
    // WebGL1 的 dFdx/dFdy 要 OES_standard_derivatives 扩展，不能默认可用，
    // 这里自己采三次做差分，代价可控且到处都跑得起来。
    float strokeH(vec2 q, vec2 dir){
      return strokeCell(q, dir,  5.6, 3.2, 0.0).z * 0.62
           + strokeCell(q, dir, 13.0, 3.8, 7.3).z * 0.38;
    }

    void main(){
      vec2 uv = gl_FragCoord.xy/u_res.xy;
      vec2 q  = uv; q.x *= u_res.x/u_res.y;
      float t = u_t*0.028;                       // 慢 —— 水面不该像屏保
      vec2  m = (u_mouse-0.5)*0.16;

      // ── 域扭曲三层。三层用**不同频率**，否则色块尺度雷同、画面发闷 ──
      vec2 o1 = vec2(fbm(q*0.9 + vec2(0.0,  t)),
                     fbm(q*0.9 + vec2(5.2, -t*0.8)));
      vec2 o2 = vec2(fbm(q*1.7 + 2.1*o1 + vec2(1.7, t*0.6) + m),
                     fbm(q*1.7 + 2.1*o1 + vec2(8.3,-t*0.5) + m));
      float f = fbm(q*1.3 + 2.4*o2);

      // ── 莫奈冷色：全部取自真实画作采样，不是凭印象调的 ──
      // 关键是**低彩度**。饱和度一高立刻变成"科技蓝"，油画感全失。
      vec3 deep    = vec3(0.063,0.141,0.180);    // #10242E 深水（睡莲水面阴影降 L*）
      vec3 water    = vec3(0.259,0.412,0.490);   // #42697D 采样·1906 睡莲水面阴影
      vec3 sage     = vec3(0.380,0.545,0.494);   // #618B7E 采样·蓝睡莲水草绿
      vec3 lavender = vec3(0.518,0.569,0.780);   // #8491C7 采样·蓝睡莲最亮蓝紫笔触
      vec3 sky      = vec3(0.659,0.678,0.776);   // #A8ADC6 采样·日本桥蓝紫天光

      // 印象派的"并置笔触"要的是**一块块可辨认的色斑**，不是搅匀的蓝雾。
      // 两个关键点，都踩过坑：
      // ① 驱动各色的噪声场必须**互相独立**。用 o1/o2/f 这种彼此派生的量当权重，
      //    它们高度相关 → 各色出现在同一批位置 → 实测色相跨度只有 13°。
      //    这里给每色一个**独立偏移的噪声场**。
      // ② 不能用链式 mix()。mix 会把已有颜色不断拉向新色，四次之后收敛成平均值；
      //    改为**归一化加权**，让局部有单色主导。
      // 漫射日光：《撑阳伞的女人》一侧的浅色系，作为"光"而不是底色引入
      vec3 cream  = vec3(0.910,0.886,0.812);   // 奶油米白
      vec3 mistBl = vec3(0.741,0.796,0.847);   // 薄雾浅蓝
      vec3 sageLt = vec3(0.706,0.741,0.678);   // 雾灰绿

      // 取色不再逐像素连续采样，而是**按笔触取一次**：一笔之内颜色恒定。
      // ⚠️ 运笔方向必须在**笔触尺度上稳定**。
      // 用 normalize(o2-o1) 是逐像素变化的 → 栅格本身每像素都在抖，
      // 笔触被打碎成噪点，看起来就只是"颗粒"。改用低频角度场：
      // 它在一大片区域内近似恒定，笔触才立得住、才成簇。
      float angS = fbm(q*0.55 + vec2(3.7, t*0.12)) * 6.2831853;
      vec2  dirS = vec2(cos(angS), sin(angS));
      vec4 c1 = strokeCell(q, dirS, 5.6,  3.2, 0.0);    // 底层大笔（铺底）
      vec4 c2 = strokeCell(q, dirS, 13.0, 3.8, 7.3);    // 上层小笔（点厾）
      vec2 s1 = c1.xy, s2 = c2.xy;

      float wWater = smoothstep(0.42,0.70, fbm(s1*1.10 + vec2( 19.3,  t*0.9)));
      float wSage  = smoothstep(0.40,0.66, fbm(s1*1.45 + vec2(-41.7, -t*0.6)));
      float wLav   = smoothstep(0.40,0.68, fbm(s1*1.25 + vec2( 63.1,  t*0.4)));
      float wSky   = smoothstep(0.58,0.84, fbm(s1*2.10 + vec2(-88.5,  t*1.3)));

      float sum = wWater + wSage + wLav + wSky + 0.0001;
      vec3 mixed = (water*wWater + sage*wSage + lavender*wLav + sky*wSky) / sum;

      // 上层小笔：只在局部押上一笔浅色日光，密度低才像"点"而不是"雾"
      float wLight = smoothstep(0.62, 0.88, fbm(s2*1.9 + vec2(-12.4, t*0.7)));
      vec3  lightC = mix(mistBl, mix(cream, sageLt, fbm(s2*0.8+31.0)), 0.55);
      mixed = mix(mixed, lightC, wLight * c2.z * 0.42);

      // ── broken color：这一步才是"看起来像画"的关键 ──
      // 只做笔触量化还不够：相邻两笔的权重是连续场取样，颜色几乎一样，
      // 边界依然看不出来，整体读作大理石纹。印象派是**相邻笔触有可辨色差**，
      // 所以给每一笔一个由 cell 决定的常量微偏：明度 ±、色相轻转。
      vec2 jt1 = hash(s1*13.7);
      vec2 jt2 = hash(s2*29.1);
      mixed *= 1.0 + jt1.x*0.24;                       // 每笔明度差
      mixed  = mix(mixed, mixed.gbr, 0.06 + jt1.y*0.11);  // 每笔色相轻转
      mixed += (jt2.x) * 0.034;                          // 小笔再叠一层碎差

      // 笔与笔之间露出一点"画布压暗"，边界才立得住
      float gap = (1.0 - c1.z) * (1.0 - c2.z);
      mixed *= 1.0 - gap*0.24;
      // 只让色彩**透出来一部分**。这层是氛围不是主体 —— 作品才是主体。
      // 满强度时实测平均亮度 118/255，正文放上去必然不可读。
      vec3 col = mix(deep, mixed, clamp(sum*0.42, 0.0, 1.0));

      // ── impasto：颜料的厚薄。这是"像油画"与"像渐变"的分水岭 ──
      // 由笔触软边权重构造一个高度场，取其梯度当法线，用固定光位打一次，
      // 于是每一笔的迎光缘发亮、背光缘压暗 —— 就是颜料堆起来的边。
      float eps = 1.6 / u_res.y;             // 一个像素量级的步长
      float h0 = strokeH(q, dirS);
      float hx = strokeH(q + vec2(eps, 0.0), dirS) - h0;
      float hy = strokeH(q + vec2(0.0, eps), dirS) - h0;
      vec2  lightDir = normalize(vec2(-0.55, 0.83));
      float lambert  = (hx*lightDir.x + hy*lightDir.y) / eps;
      col += clamp(lambert, -1.0, 1.0) * 0.016;   // 是"厚薄"不是"浮雕"，幅度必须小
      col += (c1.z - 0.5) * 0.020;                // 笔身极轻的明暗差

      // 光在水面的碎点（不是高光，是"光的颤动"）
      float sparkle = smoothstep(0.86,1.0, fbm(q*3.2 + o2*2.0 + vec2(t*1.4,0.0)));
      col += sky*sparkle*0.16;

      // 边缘柔化压暗：印象派没有黑轮廓，用暗部收边而不是描边
      float vig = smoothstep(1.30,0.10, length(uv-vec2(0.5,0.48)));
      col *= 0.40 + vig*0.58;

      // 画布织理：经纬两向的细密条纹，比白噪声更像亚麻布
      vec2 w2 = gl_FragCoord.xy * 0.86;
      float weave = (sin(w2.x)*0.5+0.5)*(sin(w2.y)*0.5+0.5);
      col *= 0.985 + weave*0.030;
      float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);
      col += (g-0.5)*0.020;

      gl_FragColor = vec4(col,1.0);
    }`;

  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[monet-gl] 编译失败:', gl.getShaderInfoLog(s)); return null;
    }
    return s;
  }
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  const pr = gl.createProgram();
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
    console.warn('[monet-gl] link 失败:', gl.getProgramInfoLog(pr)); return;
  }
  gl.useProgram(pr);

  const bf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bf);
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const lp = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(lp);
  gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(pr,'u_res');
  const uT   = gl.getUniformLocation(pr,'u_t');
  const uM   = gl.getUniformLocation(pr,'u_mouse');

  const DPR = Math.min(window.devicePixelRatio||1, window.innerWidth<780 ? 1.25 : 1.75);
  function resize(){
    cv.width  = Math.floor(cv.clientWidth  * DPR);
    cv.height = Math.floor(cv.clientHeight * DPR);
    gl.viewport(0,0,cv.width,cv.height);
    gl.uniform2f(uRes, cv.width, cv.height);
  }
  window.addEventListener('resize', resize); resize();

  let mx=.5,my=.5,tx=.5,ty=.5;
  window.addEventListener('pointermove', e=>{
    tx=e.clientX/window.innerWidth; ty=1-e.clientY/window.innerHeight;
  }, {passive:true});

  // 滚出视口就停 —— 观察的是 canvas 的容器（随页面滚动），不是 fixed 的 canvas 本身。
  // 观察 fixed 元素会恒定 isIntersecting=true，"滚走就停"永远不触发。
  let visible = true;
  const host = cv.closest('.gl-host') || cv.parentElement;
  if (host && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e])=>{ visible = e.isIntersecting; }, {threshold:0}).observe(host);
  }

  const t0 = performance.now();
  (function loop(now){
    requestAnimationFrame(loop);
    if (!visible) return;
    mx += (tx-mx)*0.035; my += (ty-my)*0.035;
    gl.uniform1f(uT, (now-t0)/1000);
    gl.uniform2f(uM, mx, my);
    gl.drawArrays(gl.TRIANGLES,0,6);
  })(t0);
})();
