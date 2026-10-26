'use strict';
// Progressive enhancement for the home page; every page reads and works without this file. It sets classes, starts and
// pauses the page's own videos, and reads no storage, sends nothing and loads nothing else.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const hasIO = 'IntersectionObserver' in window;

  // Reveal on scroll. Only parts that are below the fold when the script runs are hidden, so nothing on screen
  // disappears; with reduced motion, or on a page opened at an #anchor, nothing is hidden.
  const parts = [...document.querySelectorAll('.reveal, .reveal-group')];
  let io = null;
  if (hasIO && !reduce.matches && !location.hash) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.replace('reveal-pending', 'reveal-in');
        io.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    for (const el of parts) {
      if (el.getBoundingClientRect().top <= innerHeight) continue;
      el.classList.add('reveal-pending');
      io.observe(el);
    }
  }
  const showAll = () => {
    if (io) io.disconnect();
    for (const el of parts) el.classList.replace('reveal-pending', 'reveal-in');
  };

  // Hero animation: plays only while it is on screen, in a visible tab, with "Pause animation" off and motion allowed.
  const hero = document.querySelector('.hero-video');
  const still = document.getElementById('still');
  let heroSeen = true;
  const heroSync = () => {
    if (!hero || !hero.currentSrc) return; // reduced motion at load: no source was chosen
    if (heroSeen && !document.hidden && !(still && still.checked) && !reduce.matches) hero.play().catch(() => {});
    else hero.pause();
  };
  if (hero && hasIO) {
    new IntersectionObserver((entries) => {
      heroSeen = entries[entries.length - 1].isIntersecting;
      heroSync();
    }).observe(hero.parentElement);
  }
  if (still) still.addEventListener('change', heroSync);

  // App previews. One marked data-autoplay="inview" plays muted, in a loop, while at least half of it is on screen; it
  // keeps the browser's controls and shows its Pause video button. It plays by itself only once the page and the hero
  // animation have finished loading, so it never shares the connection with them, and never with reduced motion or
  // Save-Data; it starts loading when it comes near the screen, and its first start is at the poster's frame (data-start),
  // so the picture does not jump. A pause by the visitor holds; a play by the visitor hands it back to scrolling, except
  // that with reduced motion nothing starts by itself again. Any preview that is playing pauses when it leaves the screen,
  // and one preview plays at a time.
  const previews = [...document.querySelectorAll('.preview-video')];
  const auto = previews.filter((v) => v.dataset.autoplay === 'inview');
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  const asked = new WeakMap(); // 'play' or 'pause': what this script last asked of the video, until its event comes
  const byHand = new WeakSet(); // paused by the visitor
  const byVisitor = new WeakSet(); // started by the visitor
  const seen = new WeakMap();
  let armed = false; // the page and the hero animation have loaded
  const button = (v) => document.querySelector(`.preview-toggle[aria-controls="${v.id}"]`);
  const label = (v) => {
    const btn = button(v);
    if (!btn) return;
    btn.textContent = v.paused ? 'Play video' : 'Pause video';
    btn.classList.toggle('is-paused', v.paused);
  };
  const started = new WeakSet();
  const run = (v, play) => {
    if (play === !v.paused) return;
    asked.set(v, play ? 'play' : 'pause');
    if (!play) { v.pause(); return; }
    v.loop = true;
    if (!started.has(v)) {
      started.add(v);
      const at = parseFloat(v.dataset.start);
      const seek = () => { if (v.currentTime < 0.5) v.currentTime = at; };
      if (at > 0 && v.currentTime < 0.05) {
        if (v.readyState >= 1) seek(); // HAVE_METADATA: a seek before it is ignored
        else v.addEventListener('loadedmetadata', seek, { once: true });
      }
    }
    v.play().catch(() => { // refused, as in Low Power Mode
      if (asked.get(v) === 'play') asked.delete(v);
      label(v);
    });
  };
  const update = (v) => {
    if (byHand.has(v)) return;
    const want = Boolean(seen.get(v)) && !document.hidden && !previews.some((o) => o !== v && !o.paused);
    if (!want) { run(v, false); return; }
    if (!v.paused || reduce.matches) return; // with reduced motion nothing starts by itself
    if (byVisitor.has(v) || (armed && !saveData)) run(v, true);
  };
  const ours = (v, type) => {
    if (asked.get(v) !== type) return false;
    asked.delete(v);
    return true;
  };
  for (const v of previews) {
    v.addEventListener('play', () => {
      started.add(v);
      if (!ours(v, 'play')) {
        byHand.delete(v);
        byVisitor.add(v);
      }
      for (const o of previews) {
        if (o === v || o.paused) continue;
        byHand.add(o);
        o.pause();
      }
      label(v);
    });
    v.addEventListener('pause', () => {
      if (!ours(v, 'pause')) {
        byHand.add(v);
        byVisitor.delete(v);
      }
      label(v);
    });
  }
  for (const v of auto) {
    const btn = button(v);
    if (!btn) continue;
    btn.addEventListener('click', () => {
      if (!v.paused) { v.pause(); return; }
      v.loop = true;
      v.play().catch(() => label(v));
    });
    label(v);
    btn.hidden = false;
  }
  if (hasIO) {
    const io2 = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target;
        if (auto.includes(v)) {
          seen.set(v, e.intersectionRatio >= 0.5);
          update(v);
        } else if (!e.isIntersecting) run(v, false); // the script's pause, so it does not count as the visitor's
      }
    }, { threshold: [0, 0.5] });
    for (const v of previews) io2.observe(v);
  }
  const arm = () => {
    if (armed) return;
    armed = true;
    if (hasIO && !saveData) {
      const near = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || reduce.matches) continue;
          e.target.preload = 'auto';
          near.unobserve(e.target);
        }
      }, { rootMargin: '100% 0px' });
      for (const v of auto) near.observe(v);
    }
    auto.forEach(update);
  };
  // The hero is done once it is not downloading (all of it is in, or the browser has stopped fetching it) or has no
  // source (reduced motion at load).
  const heroDone = () => {
    if (!hero || hero.networkState !== hero.NETWORK_LOADING) return true;
    const b = hero.buffered;
    return b.length > 0 && hero.duration > 0 && b.end(b.length - 1) >= hero.duration - 0.05;
  };
  const tryArm = () => {
    if (document.readyState === 'complete' && heroDone()) arm();
  };
  if (hero) for (const t of ['progress', 'suspend', 'error', 'abort']) hero.addEventListener(t, tryArm);
  if (document.readyState === 'complete') tryArm();
  else addEventListener('load', tryArm, { once: true });

  document.addEventListener('visibilitychange', () => {
    heroSync();
    auto.forEach(update);
  });
  reduce.addEventListener('change', () => {
    if (reduce.matches) {
      showAll();
      auto.forEach((v) => { byVisitor.delete(v); run(v, false); }); // turning reduced motion on pauses the preview
    }
    else if (hero && !hero.currentSrc) { // reduced motion at load: let the browser pick a source now
      hero.addEventListener('canplay', heroSync, { once: true });
      hero.load();
    }
    heroSync();
    auto.forEach(update);
  });
})();
