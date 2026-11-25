(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smooth = reduce ? 'auto' : 'smooth';
  // Desktop: a fixed frame showing one project at a time. Phones held upright: the same first
  // screen and project view, laid out top to bottom. Phones held sideways: projects stacked.
  const wideMQ = matchMedia('(min-width: 900px)');
  const phoneMQ = matchMedia('(max-width: 899px) and (orientation: portrait)');
  const wide = () => wideMQ.matches;
  const tall = () => !wideMQ.matches && phoneMQ.matches;
  const framed = () => wide() || tall();

  /* ---------- images fade in once loaded ---------- */
  $$('.item img').forEach(img => {
    const done = () => img.classList.add('ld');
    if (img.complete && img.naturalWidth) done();
    else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); }
  });

  const sections = $$('.project');
  const strips = $$('.strip');
  const first = sections[0];
  const stripOf = sec => $('.strip', sec);
  const index = $('.index');
  const workLinks = index ? $$('.works a', index) : [];

  // desktop: the project on screen. On the first screen only its cover shows (cycling, or the
  // hovered title's); it's none while a role's collage is open.
  let current = null;
  let landing = true;    // desktop: the first screen (roles + projects)
  let held = null;       // first screen: the project whose title (or cover) the pointer is on
  let lastShown = null;
  let cycleTimer = 0;
  const CYCLE_MS = 3200; // how long each cover shows while the first screen cycles
  const FADE_MS = 1400;  // first screen: how long one cover takes to dissolve into the next

  /* ---------- strips ---------- */
  const items = s => s._items || (s._items = $$('.item', s));
  const shown = s => items(s).filter(el => el.offsetWidth > 0);   // phones hide the text panel
  const padOf = s => parseFloat(getComputedStyle(s).paddingLeft) || 0;
  const maxScroll = s => s.scrollWidth - s.clientWidth;
  const isStatic = s => s.scrollWidth <= s.clientWidth + 2;
  // scroll position that lines an item up where the row starts (beside the panel on desktop)
  const stopEl = (s, el) => {
    const base = framed() ? items(s)[0].offsetLeft : padOf(s);
    return Math.max(0, Math.min(el.offsetLeft - base, maxScroll(s)));
  };
  const stop = (s, k) => (k && items(s)[k] ? stopEl(s, items(s)[k]) : 0);

  // which way a click at clientX would go: 1 next, -1 previous, 'start' back to the first image, 0 nothing
  const dir = (s, x) => {
    if (framed() && landing) return current && s === stripOf(current) ? 1 : 0;   // the cover opens its project
    if (isStatic(s)) return 0;
    const L = s.scrollLeft;
    if (L >= maxScroll(s) - 2) return 'start';
    const r = s.getBoundingClientRect();
    const x0 = r.left + (framed() ? padOf(s) : 0);
    if (L > 2 && x < x0 + (r.right - x0) * 0.3) return -1;
    return 1;
  };

  const go = (s, d) => {
    const L = s.scrollLeft, W = s.clientWidth, its = shown(s), pad = padOf(s);
    let t;
    if (d === 'start') t = 0;
    else if (d > 0) {
      // bring the first image that isn't fully visible to the start of the row
      const k = its.findIndex((el, i) => i > 0 && el.offsetLeft + el.offsetWidth > L + W + 1);
      if (k < 0) t = maxScroll(s);
      else {
        t = stopEl(s, its[k]);
        if (t <= L + 2) t = k + 1 < its.length ? stopEl(s, its[k + 1]) : maxScroll(s);
      }
    } else {
      // go back about one screen, landing on an image edge
      const goal = L - (W - pad);
      const k = its.findIndex(el => stopEl(s, el) >= goal - 1);
      t = k < 0 ? 0 : stopEl(s, its[k]);
      if (t >= L - 2) {
        const before = its.map(el => stopEl(s, el)).filter(x => x < L - 2);
        t = before.length ? before[before.length - 1] : 0;
      }
    }
    s.scrollTo({ left: t, behavior: smooth });
  };

  // phones: counter under each row (index of the leftmost visible image; the text panel isn't counted)
  const count = s => {
    const el = s._count || (s._count = $('.count .i', s.closest('.project')));
    if (!el || framed()) return;
    const its = $$('.item:not(.text)', s), L = s.scrollLeft, pad = padOf(s);
    const k = L > 0 && L >= maxScroll(s) - 2 ? its.length - 1
      : its.findIndex(it => it.offsetLeft + it.offsetWidth - pad > L + 4);
    el.textContent = Math.max(0, k) + 1;
  };

  /* ---------- video: load when near, play only while visible ---------- */
  const vids = $$('.item video');
  // 1080p on bigger screens, 720p on phones or when the visitor asked to save data
  const saveData = navigator.connection && navigator.connection.saveData;
  const hd = () => innerWidth >= 900 && !saveData;
  const posterBehind = v => {
    const p = v.getAttribute('poster') || v.dataset.poster;
    if (!p) return;
    if (!v.getAttribute('poster')) v.poster = p;
    const fig = v.closest('.item');
    if (fig && !fig.style.backgroundImage) fig.style.backgroundImage = `url("${p}")`;
  };
  $$('.item video').forEach(v => {
    const show = () => v.classList.add('shown');
    v.addEventListener('loadeddata', show, { once: true });
    v.addEventListener('playing', show, { once: true });
    if (v.readyState >= 2) show();
  });
  const load = v => {
    if (v.dataset.loaded) return;
    v.dataset.loaded = '1';
    posterBehind(v);
    v.preload = 'metadata';
    v.src = (hd() && v.dataset.srcHd) || v.dataset.src;
  };
  const near = new Set();
  const loadNear = s => {
    const lim = s.scrollLeft + s.clientWidth * 2;
    $$('video:not([data-loaded])', s).forEach(v => { if (v.parentElement.offsetLeft < lim) load(v); });
  };
  // projects that aren't on screen are display:none on desktop, so these only see the current one
  if ('IntersectionObserver' in window) {
    const stripIO = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { near.add(e.target); loadNear(e.target); } else near.delete(e.target);
    }), { rootMargin: '100% 0px' });
    strips.forEach(s => stripIO.observe(s));

    const playIO = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target;
      if (e.isIntersecting) {
        load(v);
        if (!reduce || v.dataset.user) v.play().catch(() => {});
      } else v.pause();
    }), { threshold: 0.15 });
    vids.forEach(v => playIO.observe(v));
  } else vids.forEach(load);

  // sound toggle (one video with sound at a time)
  $$('.snd').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const v = b.previousElementSibling;
    const on = v.muted;
    vids.forEach(o => {
      if (o !== v && !o.muted) {
        o.muted = true;
        const ob = o.nextElementSibling;
        if (ob) { ob.textContent = 'sound off'; ob.setAttribute('aria-pressed', 'false'); }
      }
    });
    v.muted = !on;
    b.textContent = on ? 'sound on' : 'sound off';
    b.setAttribute('aria-pressed', String(on));
    if (on) { v.dataset.user = '1'; load(v); v.play().catch(() => {}); }
  }));

  /* ---------- desktop: first screen <-> one project ---------- */
  const mark = id => workLinks.forEach(a => a.classList.toggle('on', a.dataset.p === id));

  // start loading a project's first images (e.g. while its title is hovered)
  // an opened project loads all its pictures (and its videos' first frames) straight away, so
  // swiping through it never waits for the next picture to arrive
  const loadAll = sec => {
    if (!sec || sec._all) return;
    sec._all = true;
    $$('.item img', sec).forEach(img => {
      img.loading = 'eager';
      const pre = new Image();
      pre.sizes = img.sizes;
      if (img.srcset) pre.srcset = img.srcset;
      pre.src = img.getAttribute('src');
    });
    $$('.item video', sec).forEach(load);
  };
  const warm = sec => {
    if (!sec || sec._warm) return;
    sec._warm = true;
    $$('.item img', sec).slice(0, 3).forEach(img => { img.loading = 'eager'; });
  };

  // A text panel taller than its row (long descriptions on phones, or a short window) carries on
  // in columns beside it, as many as it needs, so it reads sideways like the images.
  const fitText = t => {
    t.classList.remove('flow');
    t.style.width = t.style.columnCount = '';
    const H = t.clientHeight;
    if (!H || t.scrollHeight <= H + 1) return;
    const W = t.clientWidth;
    t.classList.add('flow');
    const gap = parseFloat(getComputedStyle(t).columnGap) || 14;
    for (let n = 2; n <= 8; n++) {
      t.style.columnCount = n;
      t.style.width = n * W + (n - 1) * gap + 'px';
      if (t.scrollWidth <= t.clientWidth + 1) break;
    }
  };
  const fitTexts = (box = document) => $$('.item.text', box).forEach(fitText);

  // Phones held upright, project view: the images stay exactly as they are on the first screen.
  // The roles sit beside the project list, and the description below the images, where the roles
  // list is on the first screen: in two columns if one is too long for that space. (A description
  // too long even for two columns makes the page scroll: it needs shortening.)
  const fitInfo = sec => {
    const d = $('.pdesc', sec);
    if (!d) return;
    sec.classList.remove('wide');
    if (d.getBoundingClientRect().bottom + scrollY > innerHeight + 1) sec.classList.add('wide');
  };

  // cross-fade from the project on screen (if any) to sec (or to nothing)
  const swapTo = sec => {
    if (sec === current) return false;
    const prev = current;
    if (prev) {
      prev.classList.remove('on');
      prev.classList.add('leaving');
      clearTimeout(prev._t);
      prev._t = setTimeout(() => prev.classList.remove('leaving'), reduce ? 0 : landing ? FADE_MS + 60 : 460);
    }
    if (sec) {
      clearTimeout(sec._t);
      sec.classList.remove('leaving');
      sec.classList.add('on');
      fitTexts(sec);
      if (tall()) fitInfo(sec);
      stripOf(sec).scrollLeft = 0;
    }
    current = sec;
    return true;
  };

  // First screen: the projects' covers take turns from the top, and each title turns grey as if
  // hovered. Hovering a project title stops on that project; moving off the titles carries on from
  // there. With the pointer on the roles (or the collage showing) for over a second, it stops at
  // the first still-picture cover (a video cover carries on to the next still one) until the
  // pointer leaves them. Opening a project stops it.
  const highlight = sec => workLinks.forEach(a => a.classList.toggle('hl', !!sec && a.dataset.p === sec.id));
  const showCover = sec => { swapTo(sec); highlight(sec); if (sec) lastShown = sec; };
  // (on phones a role's collage takes the cover's place, so the covers wait while one is open)
  const cycling = () => framed() && landing && !held && !openPanel && !(tall() && index && index.classList.contains('open'));
  let rolePause = false, rolePauseTimer = 0;
  const LEAVE_MS = 600;   // desktop: how long the collage (and the pause) outlasts the pointer leaving the roles
  const isStill = sec => !!sec && !$('.item.cover video', sec);
  const cycle = (now = false) => {
    clearTimeout(cycleTimer);
    if (!cycling()) return;
    if (now || !current) showCover(current || lastShown || first);
    if (rolePause && isStill(current)) return;
    cycleTimer = setTimeout(function tick() {
      if (!cycling()) return;
      showCover(sections[(sections.indexOf(current) + 1) % sections.length]);
      if (rolePause && isStill(current)) return;   // paused: stop on this still cover
      cycleTimer = setTimeout(tick, CYCLE_MS);
    }, CYCLE_MS);
  };
  // the pointer is (on = true) or isn't on the roles / the collage showing
  const pauseForRoles = on => {
    clearTimeout(rolePauseTimer);
    if (on) {
      if (!rolePause) rolePauseTimer = setTimeout(() => {
        rolePause = true;
        if (isStill(current)) clearTimeout(cycleTimer);
      }, 1000);
    } else if (rolePause) {
      // a moment's grace, to get from a role to its collage's pictures
      rolePauseTimer = setTimeout(() => { rolePause = false; cycle(); }, LEAVE_MS);
    }
  };
  const hold = sec => {        // the pointer is on a project title
    if (!framed() || !landing || !sec) return;
    clearTimeout(cycleTimer);
    held = sec;
    showCover(sec);
  };
  const release = () => {      // the pointer is no longer on a project title
    if (!held) return;
    held = null;
    cycle();
  };

  const open = (id, k = 0, push = true) => {
    const sec = document.getElementById(id);
    if (!sec || !sec.classList.contains('project')) return;
    if (!framed()) { goTo(sec, k); return; }
    hideRole(true);
    clearTimeout(cycleTimer);
    held = null;
    highlight(null);
    const swapped = swapTo(sec);
    landing = false;
    root.classList.add('proj');
    mark(id);
    if (tall()) { fitInfo(sec); scrollTo(0, 0); }
    const s = stripOf(sec);
    s.classList.toggle('static', isStatic(s));
    if (k) s.scrollTo({ left: stop(s, k), behavior: swapped ? 'auto' : smooth });
    else if (s.scrollLeft) s.scrollTo({ left: 0, behavior: smooth });
    loadAll(sec);
    warm(sections[sections.indexOf(sec) + 1]);
    if (push && location.hash !== '#' + id) history.pushState(null, '', '#' + id);
  };

  // back to the first screen: the open project's cover slides back, then the cycling carries on
  const home = (push = true) => {
    landing = true;
    held = null;
    hideRole(true);
    root.classList.remove('proj');
    mark(null);
    if (current) stripOf(current).scrollLeft = 0;
    if (tall()) { scrollTo(0, 0); measure(); }
    cycle(true);
    if (push && location.hash) history.pushState(null, '', location.pathname + location.search);
  };

  // phones: jump to the project's row
  const goTo = (sec, k) => {
    loadAll(sec);
    sec.scrollIntoView({ behavior: smooth, block: 'start' });
    const s = stripOf(sec);
    s.scrollTo({ left: stop(s, k), behavior: smooth });
  };

  // desktop: the wheel / trackpad scrolls the open project sideways (there is nothing to scroll down to)
  addEventListener('wheel', e => {
    if (!wide() || openPanel || e.ctrlKey) return;
    e.preventDefault();
    if (landing || !current) return;
    const m = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    const dx = e.deltaX * m, dy = e.deltaY * m;
    stripOf(current).scrollLeft += Math.abs(dx) > Math.abs(dy) ? dx : dy;
  }, { passive: false });

  /* ---------- wiring ---------- */
  strips.forEach(s => {
    let raf = 0;
    s.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; count(s); if (near.has(s)) loadNear(s); });
    }, { passive: true });

    s.addEventListener('click', e => {
      if (e.target.closest('.snd')) return;
      if (framed() && landing) { if (current) open(current.id); return; }
      if (!fine) return;
      const d = dir(s, e.clientX);
      if (d) go(s, d);
    });
  });

  // keys: left/right move through the project, up/down switch projects (desktop), Esc goes back
  const middleStrip = () => {
    let best = null, bd = Infinity;
    strips.forEach(s => {
      const r = s.getBoundingClientRect();
      const d = Math.abs((r.top + r.bottom) / 2 - innerHeight / 2);
      if (r.bottom > 0 && r.top < innerHeight && d < bd) { bd = d; best = s; }
    });
    return best;
  };
  addEventListener('keydown', e => {
    if (openPanel) { if (e.key === 'Escape') show(null); return; }
    if (e.key === 'Escape' && activeRole) { hideRole(true); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (framed()) {
      const i = sections.indexOf(current);
      if (e.key === 'Escape' && !landing) { home(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); open((landing ? current || first : sections[Math.min(i + 1, sections.length - 1)]).id); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (!landing && i > 0) open(sections[i - 1].id); else home(); return; }
      if (landing) { if (e.key === 'ArrowRight') { e.preventDefault(); open(first.id); } return; }
    }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const s = framed() ? stripOf(current)
      : document.activeElement && document.activeElement.classList.contains('strip') ? document.activeElement : middleStrip();
    if (!s || isStatic(s)) return;
    e.preventDefault();
    if (e.key === 'ArrowRight' && s.scrollLeft < maxScroll(s) - 2) go(s, 1);
    if (e.key === 'ArrowLeft' && s.scrollLeft > 2) go(s, -1);
  });

  /* ---------- index: roles show a collage, project titles open the project ---------- */

  // Collage, as in the sketch: equal columns with the same gap across and down, always spanning the
  // full width up to the cover (never a gap beside it); every piece fills its column's width; each
  // column is stacked from the bottom so all columns end level with the cover, and their tops fall
  // wherever their content ends.
  const MIN_A = 0.75, MAX_A = 2;   // very tall / very wide pieces are trimmed to 3:4 / 2:1
  const arrange = (k, W, H, gap, cols) => {
    const cw = (W - gap * (cols - 1)) / cols;
    // put each piece in the shortest column so far, keeping the list order
    const sum = Array(cols).fill(0), cnt = Array(cols).fill(0), colOf = [];
    k.forEach(ki => {
      let c = 0;
      for (let j = 1; j < cols; j++) if (sum[j] + cnt[j] * gap < sum[c] + cnt[c] * gap) c = j;
      colOf.push(c); sum[c] += ki * cw; cnt[c]++;
    });
    // a column that is too tall for the space has its pieces trimmed a little in height (never stretched)
    const squeeze = sum.map((s, c) => (cnt[c] ? Math.min(1, (H - (cnt[c] - 1) * gap) / s) : 1));
    return { cols, cw, colOf, squeeze, worst: Math.min(...squeeze) };
  };
  const layout = set => {
    const box = set.parentElement;
    const W = box.clientWidth;
    const H = framed() ? box.clientHeight : Math.min(innerWidth * 0.78, 340);
    const tiles = $$('.tile', set);
    if (!W || !H || !tiles.length) return;
    const gap = parseFloat(getComputedStyle(root).getPropertyValue('--g')) || 14;
    // height of each piece per pixel of width
    const k = tiles.map(t => 1 / Math.min(MAX_A, Math.max(MIN_A, +t.dataset.a || 1)));
    // three columns as in the sketch (fewer if there are fewer pieces); on a wide, short space where
    // three columns would need a lot of trimming, four shorter columns are used instead
    let best = arrange(k, W, H, gap, Math.min(3, tiles.length));
    if (best.worst < (tall() ? 0.6 : 0.8) && tiles.length > 4) {   // phones: three columns, as in the sketch, unless that trims a lot
      const four = arrange(k, W, H, gap, 4);
      if (four.worst > best.worst) best = four;
    }
    const { cw, colOf, squeeze } = best;
    // desktop: the columns end level with the bottom of the cover. Phones: the collage sits in the
    // middle of its space, where the cover was.
    let bottom = H;
    if (tall()) {
      const colH = Array(best.cols).fill(-gap);
      k.forEach((ki, i) => { colH[colOf[i]] += cw * ki * squeeze[colOf[i]] + gap; });
      bottom = H - Math.max(0, (H - Math.max(...colH)) / 2);
    }
    const y = Array(best.cols).fill(bottom);
    for (let i = tiles.length - 1; i >= 0; i--) {
      const c = colOf[i], h = cw * k[i] * squeeze[c];
      y[c] -= h;
      Object.assign(tiles[i].style, {
        width: cw + 'px', height: h + 'px',
        transform: `translate(${c * (cw + gap)}px, ${y[c]}px)`
      });
      y[c] -= gap;
    }
  };
  const fill = (set, withVideo) => {
    $$('img[data-src]', set).forEach(img => {
      img.srcset = img.dataset.srcset; img.src = img.dataset.src;
      img.removeAttribute('data-src'); img.removeAttribute('data-srcset');
    });
    if (withVideo) $$('video[data-src]', set).forEach(v => {
      v.poster = v.dataset.poster; v.src = v.dataset.src; v.removeAttribute('data-src');
    });
  };

  let activeRole = null, hideTimer = 0;
  const roleBtns = index ? $$('.roles button', index) : [];
  const sets = index ? $$('.set', index) : [];
  function showRole(rid) {
    clearTimeout(hideTimer);
    if (!index || activeRole === rid) return;
    if (framed() && !landing) return;   // the roles only show on the first screen
    activeRole = rid;
    roleBtns.forEach(b => b.classList.toggle('on', b.dataset.role === rid));
    // a role without pictures (yet) opens nothing, and on phones the covers carry on
    const has = sets.some(set => set.dataset.role === rid && set.querySelector('.tile'));
    index.classList.toggle('open', has);
    if (tall()) { if (has) { clearTimeout(cycleTimer); highlight(null); } else cycle(true); }   // phones: the collage replaces the cover
    sets.forEach(set => {
      const on = set.dataset.role === rid;
      set.classList.toggle('on', on);
      $$('video', set).forEach(v => { if (!on) v.pause(); });
      if (on) {
        fill(set, true);
        layout(set);
        if (!reduce) $$('video', set).forEach(v => v.play().catch(() => {}));
      }
    });
  }
  function hideRole(now) {
    clearTimeout(hideTimer);
    const done = () => {
      activeRole = null;
      roleBtns.forEach(b => b.classList.remove('on'));
      if (index) index.classList.remove('open');
      sets.forEach(set => { set.classList.remove('on'); $$('video', set).forEach(v => v.pause()); });
      if (tall() && landing) cycle(true);   // phones: the covers come back
    };
    if (now) done(); else hideTimer = setTimeout(done, LEAVE_MS);
  }

  if (index) {
    roleBtns.forEach(b => {
      b.addEventListener('focus', () => {
        let keyboard = true;
        try { keyboard = b.matches(':focus-visible'); } catch (_) {}
        if (keyboard) showRole(b.dataset.role);
      });
      b.addEventListener('click', () => {
        // desktop: clicking a role opens one of its collage's pictures, picked at random each time
        if (fine && wide()) {
          const set = sets.find(x => x.dataset.role === b.dataset.role);
          const tiles = set ? $$('.tile', set) : [];
          if (tiles.length) {
            const t = tiles[Math.floor(Math.random() * tiles.length)];
            open(t.getAttribute('href').slice(1), +t.dataset.i);
          }
          return;
        }
        if (!fine && activeRole === b.dataset.role) hideRole(true); else showRole(b.dataset.role);
      });
    });
    if (fine) {
      // one page-wide 'mouseover' check of what is under the pointer (behaves the same in Safari,
      // Chrome and Firefox): a project title shows its cover, a role shows its collage, the lists
      // or the open collage keep it, anything else closes it after a short delay
      document.addEventListener('mouseover', e => {
        const t = e.target;
        if (!t || !t.closest) return;
        const w = t.closest('.works a');
        if (w) { const sec = document.getElementById(w.dataset.p); warm(sec); hold(sec); }
        else release();
        // only the role names and the collage's pictures count, not the white space around them
        const onRoles = !!(t.closest('.index .roles button') || t.closest('.index .set.on .tile'));
        pauseForRoles(onRoles);
        const btn = t.closest('.roles button');
        if (btn) { showRole(btn.dataset.role); return; }
        if (!activeRole) return;
        if (onRoles) clearTimeout(hideTimer);
        else hideRole();
      });
      document.documentElement.addEventListener('mouseleave', () => { if (activeRole) hideRole(); release(); pauseForRoles(false); });
    }
    index.addEventListener('focusout', e => { if (!index.contains(e.relatedTarget)) hideRole(); });
    index.addEventListener('click', e => {
      const t = e.target.closest('.tile');
      const w = e.target.closest('.works a');
      if (t) { e.preventDefault(); open(t.getAttribute('href').slice(1), +t.dataset.i); }
      else if (w) {
        e.preventDefault();
        const sec = document.getElementById(w.dataset.p);
        // clicking the open project again goes back to its first image
        if (framed() && !landing && sec === current) stripOf(sec).scrollTo({ left: 0, behavior: smooth });
        else open(w.dataset.p);
      }
    });
    addEventListener('resize', () => { const s = sets.find(x => x.classList.contains('on')); if (s) layout(s); });
    // once the page has loaded, quietly fetch every project's cover (so hovering a title shows it
    // straight away), then the collage thumbnails
    addEventListener('load', () => {
      setTimeout(() => sections.forEach(sec => {
        const img = $('.item.cover img', sec), v = $('.item.cover video', sec);
        if (img) img.loading = 'eager';
        if (v) posterBehind(v);
      }), 200);
      setTimeout(() => sets.forEach(s => fill(s, false)), 1500);
    });
  }

  // the name in the header goes back to the first screen
  const nameLink = $('.top .name');
  if (nameLink) nameLink.addEventListener('click', e => {
    if (!framed()) return;
    e.preventDefault();
    home();
  });

  /* ---------- about page ---------- */
  let openPanel = null;
  const show = (id, update = true) => {
    $$('.panel').forEach(p => { p.hidden = p.id !== id; });
    openPanel = id;
    document.body.classList.toggle('locked', !!id);
    if (id) clearTimeout(cycleTimer); else cycle();   // no cycling behind the about page
    if (update) {
      const back = framed() && !landing ? '#' + current.id : location.pathname + location.search;
      history.replaceState(null, '', id ? '#' + id : back);
    }
    if (id) $('#' + id).scrollTop = 0;
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-panel]');
    if (a) { e.preventDefault(); show(a.dataset.panel === openPanel ? null : a.dataset.panel); return; }
    if (e.target.closest('[data-close]')) { e.preventDefault(); show(null); }
  });

  /* ---------- address bar: #project opens that project (and back/forward work) ---------- */
  const route = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id === 'about' || id === 'contact') { show('about', false); return; }   // #contact: the old contact page
    if (openPanel) show(null, false);
    if (!framed()) return;   // phones: the browser scrolls to #project itself
    const sec = id && document.getElementById(id);
    if (sec && sec.classList.contains('project')) open(id, 0, false); else home(false);
  };
  addEventListener('popstate', route);
  addEventListener('hashchange', route);

  /* ---------- sizes ---------- */
  const measure = () => {
    const head = $('.top');
    if (head) root.style.setProperty('--top', head.offsetHeight + 'px');
    const aboutLink = head && $('.end', head);
    if (aboutLink) root.style.setProperty('--about-x', aboutLink.getBoundingClientRect().left + 'px');
    const list = index && $('.works', index);
    if (list && wide()) {
      const g = parseFloat(getComputedStyle(root).getPropertyValue('--g')) || 20;
      root.style.setProperty('--panel', Math.ceil(list.offsetWidth + 3 * g) + 'px');
      // where the list ends on the first screen (the cover never starts left of it)
      root.style.setProperty('--list-end', Math.ceil(index.getBoundingClientRect().left + list.offsetLeft + list.offsetWidth) + 'px');
    }
    if (tall()) measurePhone();
    fitTexts();
    strips.forEach(s => s.classList.toggle('static', isStatic(s)));
  };
  // Phones held upright, first screen: the project list at the top, the roles at the bottom and the
  // cover (or a role's collage) in the room between them. The cover is cropped to the same shape as
  // on desktop, as wide as the screen if there is room, and keeps that size in the project view.
  let phoneW = 0;
  const LIST_LINES = 12;   // phones: room kept for this many project titles above the pictures
  const measurePhone = () => {
    // in the project view the page can scroll; the browser's toolbar sliding away as it does
    // shouldn't resize the images
    if (!landing && innerWidth === phoneW) return;
    phoneW = innerWidth;
    const main = $('main'), roles = index && $('.roles', index);
    if (!main) return;
    const cs = getComputedStyle(root);
    const g = parseFloat(cs.getPropertyValue('--g')) || 14;
    const shape = parseFloat(cs.getPropertyValue('--cover-a')) || 1.2;
    const top = main.getBoundingClientRect().top + scrollY;          // just below the project list
    const works = index && $('.works', index);
    const worksTop = works ? works.getBoundingClientRect().top + scrollY : top;
    if (works) root.style.setProperty('--list-h', top - worksTop + 'px');
    // Likewise the space for the project list is kept for at least twelve projects, so removing
    // one doesn't move the pictures either (a thirteenth makes them a line smaller).
    const listLine = works && works.firstElementChild ? works.firstElementChild.offsetHeight : 15;
    const listEnd = Math.max(top, worksTop + LIST_LINES * listLine);
    const full = (root.clientWidth - 2 * g) / shape;                  // a cover as wide as the screen
    let room, gap, avail;
    // The space below the cover is kept for ten lines of text (the roles list on the first screen,
    // a project's description in the project view), however many roles there are, so adding or
    // removing a role never changes the size or place of the pictures.
    const line = roles && roles.firstElementChild ? roles.firstElementChild.offsetHeight : 15;
    const below = () => Math.max(roles ? roles.offsetHeight : 0, (root.classList.contains('tight') ? 5 : 10) * line);
    const fit = () => {
      room = innerHeight - g - below() - listEnd;
      gap = room > 360 ? 28 : 16;
      avail = room - 2 * gap;
    };
    // short screens: the roles go into two columns to leave the cover more room
    root.classList.remove('tight');
    fit();
    if (avail < full * 0.6) { root.classList.add('tight'); fit(); }
    const h = Math.max(120, Math.min(full, avail));
    root.style.setProperty('--ph-h', h + 'px');
    root.style.setProperty('--land-gap', listEnd - top + gap + Math.max(0, (avail - h) / 2) + 'px');
    root.style.setProperty('--mid-top', listEnd + gap + 'px');
    root.style.setProperty('--mid-h', Math.max(h, avail) + 'px');
    if (current) fitInfo(current);
  };
  const onLayoutChange = () => {
    phoneW = 0;
    measure();
    if (framed()) { scrollTo(0, 0); mark(landing || !current ? null : current.id); cycle(true); }
    else clearTimeout(cycleTimer);
  };
  if (wideMQ.addEventListener) {
    wideMQ.addEventListener('change', onLayoutChange);
    phoneMQ.addEventListener('change', onLayoutChange);
  }

  measure();
  route();
  strips.forEach(count);
  addEventListener('resize', () => { measure(); strips.forEach(count); });
  addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
})();
