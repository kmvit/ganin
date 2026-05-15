/* ============================================
   Стройдеталь-2 — interactions
   ============================================ */

(() => {
  'use strict';

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -------------------------------------------
     Theme picker — swap accent colour (orange ↔ red)
     Persists choice in localStorage. UI is injected
     into .header-actions so HTML doesn't need touching.
  ------------------------------------------- */
  (() => {
    const STORAGE_KEY = 'ganin:accent';
    const stored = (() => {
      try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
    })();
    if (stored === 'red') {
      document.documentElement.setAttribute('data-accent', 'red');
    }

    const actions = $('.header-actions');
    if (!actions) return;

    const picker = document.createElement('div');
    picker.className = 'theme-picker';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Цвет акцента');
    picker.innerHTML = `
      <button type="button" class="theme-picker__dot theme-picker__dot--orange"
              data-accent="orange" aria-label="Оранжевый акцент"></button>
      <button type="button" class="theme-picker__dot theme-picker__dot--red"
              data-accent="red" aria-label="Красный акцент"></button>
    `;
    // Insert before the phone link (or as first child)
    const phone = actions.querySelector('.phone-link');
    if (phone) actions.insertBefore(picker, phone);
    else actions.prepend(picker);

    const dots = picker.querySelectorAll('[data-accent]');
    const setPressed = (value) => {
      dots.forEach(d => d.setAttribute('aria-pressed', String(d.dataset.accent === value)));
    };
    setPressed(stored === 'red' ? 'red' : 'orange');

    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const val = dot.dataset.accent;
        if (val === 'red') {
          document.documentElement.setAttribute('data-accent', 'red');
        } else {
          document.documentElement.removeAttribute('data-accent');
        }
        try { localStorage.setItem(STORAGE_KEY, val); } catch {}
        setPressed(val);
      });
    });
  })();

  /* -------------------------------------------
     Year stamp
  ------------------------------------------- */
  const yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* -------------------------------------------
     Header: blur on scroll + mobile menu
  ------------------------------------------- */
  const header = $('[data-header]');
  const burger = $('[data-burger]');

  if (header) {
    const updateHeader = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  if (burger && header) {
    burger.addEventListener('click', () => {
      const open = header.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    });

    header.addEventListener('click', (e) => {
      if (e.target instanceof HTMLAnchorElement && header.classList.contains('is-open')) {
        header.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* -------------------------------------------
     Reveal-on-scroll
  ------------------------------------------- */
  const reveals = $$('.reveal');
  if (reveals.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      reveals.forEach(el => el.classList.add('is-in'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });

      reveals.forEach(el => io.observe(el));
    }
  }

  /* -------------------------------------------
     Hero scroll-scrub video (image sequence)
     - Loads ./assets/hero-frames/frame-XXX.webp
     - Decodes in background, draws to canvas
     - Maps window scroll over hero section to frame index
  ------------------------------------------- */
  const FRAME_COUNT = 68;           // matches ffmpeg fps=15 × 4.55s (trimmed before fade)
  const FRAME_DIR   = 'assets/hero-frames/';
  const FRAME_FMT   = (i) => `${FRAME_DIR}frame-${String(i + 1).padStart(3, '0')}.webp`;

  const hero    = $('[data-hero]');
  const canvas  = $('[data-hero-canvas]');
  const fallbackImg = $('[data-hero-fallback]');

  if (hero && canvas) {
    const ctx2d = canvas.getContext('2d', { alpha: false });
    const frames = new Array(FRAME_COUNT);
    let firstFrameReady = false;
    let lastDrawnIdx = -1;
    let videoAspect = 1280 / 720;

    // Use the canvas's own CSS-rendered size for the internal pixel
    // buffer. Earlier we used window.innerHeight, but on some browsers
    // (and in DevTools device emulation) innerHeight can desync from
    // the actual layout viewport — making the canvas grossly oversized
    // and breaking the scroll-progress math too.
    const visibleVh = () =>
      document.documentElement.clientHeight || window.innerHeight;

    const sizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth  || hero.clientWidth;
      const h = canvas.clientHeight || visibleVh();
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      // Let CSS (inset: 0 inside .hero__sticky) drive the on-page size;
      // we only set the internal pixel buffer here.
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Force redraw on resize
      if (lastDrawnIdx >= 0) drawFrame(lastDrawnIdx, true);
    };

    const drawFrame = (idx, force = false) => {
      idx = Math.max(0, Math.min(FRAME_COUNT - 1, idx | 0));
      if (!force && idx === lastDrawnIdx) return;

      const img = frames[idx];
      if (!img || !img.complete || img.naturalWidth === 0) {
        // Frame not loaded yet — try nearest loaded frame in either direction
        for (let r = 1; r < FRAME_COUNT; r++) {
          const back = frames[idx - r];
          if (back && back.complete && back.naturalWidth) {
            drawImageCover(back);
            return;
          }
          const fwd = frames[idx + r];
          if (fwd && fwd.complete && fwd.naturalWidth) {
            drawImageCover(fwd);
            return;
          }
        }
        // Nothing loaded yet — fall back to the static poster image.
        if (fallbackImg && fallbackImg.complete && fallbackImg.naturalWidth) {
          drawImageCover(fallbackImg);
        }
        return;
      }

      drawImageCover(img);
      lastDrawnIdx = idx;
    };

    const drawImageCover = (img) => {
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const ir = img.naturalWidth / img.naturalHeight;
      const cr = cw / ch;

      let dw, dh, dx, dy;
      if (cr > ir) {
        dw = cw;
        dh = cw / ir;
        dx = 0;
        dy = (ch - dh) / 2;
      } else {
        dh = ch;
        dw = ch * ir;
        dy = 0;
        dx = (cw - dw) / 2;
      }
      ctx2d.drawImage(img, dx, dy, dw, dh);
    };

    // Preload frames in priority chunks
    const preload = () => {
      const queue = [];
      const stride = 4;
      // First pass: every 4th frame for quick rough preview
      for (let i = 0; i < FRAME_COUNT; i += stride) queue.push(i);
      // Then fill in the gaps
      for (let i = 1; i < FRAME_COUNT; i++) {
        if (i % stride !== 0) queue.push(i);
      }

      let inflight = 0;
      const MAX_PARALLEL = 20;   // HTTP/2 multiplexing — saturate the pipe
      let cursor = 0;

      const next = () => {
        while (inflight < MAX_PARALLEL && cursor < queue.length) {
          const idx = queue[cursor++];
          inflight++;
          const img = new Image();
          img.decoding = 'async';
          if ('fetchPriority' in img) img.fetchPriority = 'high';
          img.src = FRAME_FMT(idx);
          img.onload = img.onerror = () => {
            inflight--;
            frames[idx] = img;
            if (idx === 0 && !firstFrameReady && img.naturalWidth) {
              firstFrameReady = true;
              videoAspect = img.naturalWidth / img.naturalHeight;
              if (fallbackImg) fallbackImg.style.opacity = '0';
            }
            // After ANY frame arrives, repaint at the current scroll position
            // so newly-loaded frames take over the fallback/older neighbours.
            onScroll();
            next();
          };
        }
      };
      next();
    };

    // Compute current frame index from scroll position.
    // Use absolute scrollY + hero.offsetTop/offsetHeight — these stay
    // consistent regardless of browser quirks with rect.top during
    // sticky-pinning or URL-bar resize.
    const computeIdx = () => {
      let heroTop = 0;
      for (let el = hero; el; el = el.offsetParent) heroTop += el.offsetTop;
      const scrollPos = window.pageYOffset || document.documentElement.scrollTop || 0;
      const scrolled = scrollPos - heroTop;
      const total = hero.offsetHeight - visibleVh();
      const progress = total > 0 ? Math.max(0, Math.min(1, scrolled / total)) : 0;
      return Math.round(progress * (FRAME_COUNT - 1));
    };
    const onScroll = () => drawFrame(computeIdx());

    // Continuous rAF loop. Start it immediately and let it run while
    // the hero is anywhere near the viewport. Some Android browsers
    // throttle scroll events during sticky-pinning + URL-bar collapse,
    // so a self-perpetuating rAF is the only reliable way to keep
    // the canvas in sync with scroll position.
    let rafId = null;
    let running = false;
    const tick = () => {
      drawFrame(computeIdx());
      rafId = running ? requestAnimationFrame(tick) : null;
    };
    const startTick = () => {
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    };
    const stopTick = () => {
      running = false;
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    };
    // Start immediately, pause only when hero is far away.
    startTick();
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.target === hero) {
            if (e.isIntersecting) startTick();
            else stopTick();
          }
        }
      }, { threshold: 0, rootMargin: '200px 0px' });
      io.observe(hero);
    }

    sizeCanvas();

    // Paint the poster frame into the canvas RIGHT AWAY so users
    // never see a black canvas before frames have loaded — especially
    // important on mobile where the first scroll can fire before any
    // frame finishes downloading.
    const paintPoster = () => {
      if (fallbackImg && fallbackImg.complete && fallbackImg.naturalWidth) {
        drawImageCover(fallbackImg);
      }
    };
    if (fallbackImg) {
      if (fallbackImg.complete) paintPoster();
      else fallbackImg.addEventListener('load', paintPoster, { once: true });
    }

    preload();
    window.addEventListener('scroll', onScroll, { passive: true });
    // Use orientationchange + a debounced resize so iOS Safari's address-bar
    // resize during scroll doesn't constantly thrash the canvas.
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sizeCanvas, 150);
    });
    onScroll();
  }
})();
