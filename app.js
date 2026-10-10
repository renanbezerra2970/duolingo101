/* Duolingo 101 – lições em formato de história (diálogo + perguntas). Sem build, sem servidor. */
(() => {
  "use strict";

  const $app = document.getElementById("app");
  const $tip = document.getElementById("tooltip");
  const WORD_RE = /[A-Za-zÀ-ÿ]+(?:'[A-Za-zÀ-ÿ]+)?/g;
  const DEFAULT_VOICE = "en-US-JennyNeural";
  const SPEAKER = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  const state = { units: [], unitData: {}, levels: [], levelData: {}, glossary: {}, manifest: {} };

  /* ---------- Progresso (fica salvo neste navegador) ---------- */
  const KEY = "d101.progress.v1";
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  }
  let progress = Object.assign({ lessons: {}, unitLevel: {}, xp: 0, streak: 0, lastDay: null, autoplay: true }, loadProgress());
  progress.unitLevel ||= {};

  // nível 1 usa a chave antiga ("u1l1"), os outros "u1l1@3"
  const pkey = (id, level) => (level > 1 ? `${id}@${level}` : id);
  const unitLevel = (unitId) => progress.unitLevel[unitId] || 1;
  const levelInfo = (n) => state.levels.find(l => l.n === n) || { n, name: "", rate: "-5%" };
  const xpFor = (level, repeat) => (repeat ? 5 : 10 + 5 * level);

  function today() { return new Date().toISOString().slice(0, 10); }
  function registerStudy(key, accuracy, level) {
    const prev = progress.lessons[key];
    progress.lessons[key] = { done: true, best: Math.max(accuracy, prev?.best || 0), at: today() };
    progress.xp += xpFor(level, !!prev);
    const t = today();
    if (progress.lastDay !== t) {
      const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      progress.streak = progress.lastDay === y ? progress.streak + 1 : 1;
      progress.lastDay = t;
    }
    saveProgress(progress);
  }

  /* ---------- Áudio: MP3 pré-gerado (edge-tts) ou voz do navegador como reserva ---------- */
  let current = null, lastKey = null, lastAt = 0;
  function stopAudio() {
    if (current) { current.pause(); current = null; }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    document.querySelectorAll(".speak.playing").forEach(b => b.classList.remove("playing"));
  }
  function play(key, text, btn) {
    stopAudio();
    // clicar duas vezes seguidas no mesmo áudio toca mais devagar (como a tartaruga do Duolingo)
    const slow = key === lastKey && Date.now() - lastAt < 4000;
    lastKey = key; lastAt = Date.now();
    btn?.classList.add("playing");
    const done = () => btn?.classList.remove("playing");
    const file = state.manifest[key];
    if (file) {
      const a = new Audio("/audio/" + file);
      a.playbackRate = slow ? 0.7 : 1;
      a.onended = a.onerror = done;
      current = a;
      a.play().catch(() => { done(); speakFallback(text, slow, done); });
    } else {
      speakFallback(text, slow, done);
    }
  }
  function speakFallback(text, slow, done) {
    if (!("speechSynthesis" in window)) return done();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = slow ? 0.6 : 0.9;
    const v = speechSynthesis.getVoices().find(v => /en[-_]US/i.test(v.lang) && /natural|google|aria|jenny/i.test(v.name))
      || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang));
    if (v) u.voice = v;
    u.onend = u.onerror = done;
    speechSynthesis.speak(u);
  }
  // mesma chave do tools/gerar_audio.py: a velocidade -5% (níveis 1–2) não entra na chave
  const sentenceKey = (voice, text, rate = "-5%") => (rate === "-5%" ? `${voice}|${text}` : `${voice}|${text}|${rate}`);
  const playSentence = (voice, text, btn, rate) => play(sentenceKey(voice, text, rate), text, btn);
  const playWord = (w) => play(`word|${w.toLowerCase()}`, w);

  /* ---------- Texto em inglês com palavras clicáveis ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function wordsHTML(text) {
    let out = "", i = 0;
    for (const m of text.matchAll(WORD_RE)) {
      out += esc(text.slice(i, m.index)) + `<span class="w" data-w="${esc(m[0])}">${esc(m[0])}</span>`;
      i = m.index + m[0].length;
    }
    return out + esc(text.slice(i));
  }
  function speakBtn(voice, text, rate = "-5%") {
    return `<button class="speak" data-voice="${esc(voice)}" data-text="${esc(text)}" data-rate="${rate}" aria-label="Ouvir">${SPEAKER}</button>`;
  }

  // procura a palavra no glossário; se não achar, tenta a forma base (plural, passado, -ing, possessivo...)
  function glossFor(word) {
    const w = word.toLowerCase().replace(/’/g, "'");
    const g = state.glossary;
    if (g[w]) return g[w];
    const tries = [
      [/'s$/, ""], [/s'$/, "s"], [/ies$/, "y"], [/ied$/, "y"], [/es$/, ""], [/s$/, ""],
      [/([^aeiou])\1ed$/, "$1"], [/ed$/, "e"], [/ed$/, ""], [/d$/, ""],
      [/([^aeiou])\1ing$/, "$1"], [/ing$/, "e"], [/ing$/, ""], [/ily$/, "y"], [/ly$/, ""],
      [/er$/, ""], [/est$/, ""],
    ];
    for (const [re, rep] of tries) {
      if (!re.test(w)) continue;
      const base = w.replace(re, rep);
      if (base.length > 1 && g[base]) return `${g[base]} (${base})`;
    }
    return null;
  }

  let tipTimer;
  document.addEventListener("click", (e) => {
    const w = e.target.closest(".w");
    if (w) {
      e.stopPropagation();
      playWord(w.dataset.w);
      const g = glossFor(w.dataset.w);
      document.querySelectorAll(".w.active").forEach(x => x.classList.remove("active"));
      w.classList.add("active");
      if (g) {
        $tip.textContent = g;
        $tip.hidden = false;
        const r = w.getBoundingClientRect();
        const tw = $tip.offsetWidth;
        $tip.style.left = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + "px";
        $tip.style.top = (r.top - $tip.offsetHeight - 8 < 8 ? r.bottom + 8 : r.top - $tip.offsetHeight - 8) + "px";
      }
      clearTimeout(tipTimer);
      tipTimer = setTimeout(hideTip, 2200);
      return;
    }
    const s = e.target.closest(".speak");
    if (s) { playSentence(s.dataset.voice, s.dataset.text, s, s.dataset.rate); return; }
    const t = e.target.closest(".pt-toggle");
    if (t) {
      const tr = t.parentElement.querySelector(".trans");
      tr.hidden = !tr.hidden;
      t.textContent = tr.hidden ? "VER TRADUÇÃO" : "ESCONDER";
      return;
    }
    hideTip();
  });
  function hideTip() { $tip.hidden = true; document.querySelectorAll(".w.active").forEach(x => x.classList.remove("active")); }
  addEventListener("scroll", hideTip, { passive: true });

  /* ---------- Dados ---------- */
  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(url + " → " + r.status);
    return r.json();
  }
  async function loadAll() {
    const [u, lv, g, m] = await Promise.all([
      getJSON("/data/units.json"),
      getJSON("/data/levels.json"),
      getJSON("/data/glossary.json").catch(() => ({})),
      getJSON("/audio/manifest.json").catch(() => ({})),
    ]);
    state.units = u.units; state.pro = u.pro || []; state.levels = lv.levels; state.glossary = g; state.manifest = m;
    const all = [...state.units, ...state.pro];
    const datas = await Promise.all(all.map(x => getJSON("/" + x.file)));
    datas.forEach((d, i) => { state.unitData[all[i].id] = d; });
  }
  // "stories" = unidades do curso; "pro" = trilhas profissionais
  const sectionOf = (u) => (state.pro.includes(u) ? "pro" : "stories");
  const groupsOf = (section) => (section === "pro" ? state.pro : state.units);
  const homeHash = (section) => (section === "pro" ? "#/pro" : "#/");
  function findGroup(id) {
    return [...state.units, ...state.pro].find(x => String(x.id) === String(id));
  }
  function findLesson(id) {
    for (const u of [...state.units, ...state.pro]) {
      const d = state.unitData[u.id];
      const i = d.lessons.findIndex(l => l.id === id);
      if (i >= 0) return { unit: u, data: d, lesson: d.lessons[i], index: i, section: sectionOf(u) };
    }
    return null;
  }
  // falas de uma lição num nível: o nível 1 está no arquivo da unidade; os outros em data/levels/uN-L.json
  async function getSteps(found, level) {
    if (level === 1) return { steps: found.lesson.steps, cast: found.data.cast };
    const k = `${found.unit.id}-${level}`;
    if (!state.levelData[k]) state.levelData[k] = await getJSON(`/data/levels/u${k}.json`).catch(() => ({ lessons: {} }));
    const d = state.levelData[k];
    const steps = d.lessons[found.lesson.id];
    return steps ? { steps, cast: { ...found.data.cast, ...(d.cast || {}) } } : null;
  }

  /* ---------- Telas ---------- */
  function renderHome(section = "stories") {
    stopAudio();
    const zig = [0, 60, 90, 60, 0, -60, -90, -60];
    const pro = section === "pro";
    let html = `<header class="topbar"><div class="brand"><img src="/icons/icon.svg" alt="">duolingo 101</div>
      <div class="stats">${installPrompt ? `<button class="install" id="install">⬇ Instalar</button>` : ""}<span class="fire" title="Dias seguidos">🔥 ${progress.streak}</span><span class="xp" title="XP">⚡ ${progress.xp} XP</span></div></header>
      <nav class="tabs" role="tablist">
        <a href="#/" class="tab ${pro ? "" : "on"}" role="tab" aria-selected="${!pro}">📚 Histórias</a>
        <a href="#/pro" class="tab ${pro ? "on" : ""}" role="tab" aria-selected="${pro}">💼 Pro</a>
      </nav>
      ${pro ? `<p class="pro-intro">Conversas da vida profissional, do primeiro atendimento ao inglês de quem trabalha na área. Escolha a trilha e o nível.</p>` : ""}`;
    for (const u of groupsOf(section)) {
      const d = state.unitData[u.id];
      const lvl = unitLevel(u.id);
      const info = levelInfo(lvl);
      html += `<section class="unit" style="--unit-color:${u.color}">
        <div class="unit-banner" style="background:${u.color}">
          <div><h2>${esc(u.title)}</h2><p>${esc(u.subtitle)}</p></div>
          <button class="guide-btn" data-guide="${u.id}">📖 GUIA</button>
        </div>
        <div class="levels" role="tablist" aria-label="Nível de dificuldade">
          ${state.levels.map(l => {
            const done = d.lessons.filter(x => progress.lessons[pkey(x.id, l.n)]?.done).length;
            return `<button class="lv ${l.n === lvl ? "on" : ""} ${done === d.lessons.length ? "full" : ""}" data-unit="${u.id}" data-level="${l.n}" role="tab" aria-selected="${l.n === lvl}">
              <b>${l.n}</b><small>${esc(l.name)}</small></button>`;
          }).join("")}
        </div>
        <p class="lv-desc"><b>Nível ${lvl} · ${esc(info.name)}</b> <span class="cefr">${esc(info.cefr || "")}</span> — ${esc(info.desc || "")}</p>
        <div class="path">`;
      d.lessons.forEach((l, i) => {
        const done = progress.lessons[pkey(l.id, lvl)]?.done;
        const crowns = state.levels.filter(x => progress.lessons[pkey(l.id, x.n)]?.done).length;
        html += `<button class="node ${done ? "done" : ""}" data-lesson="${l.id}" data-level="${lvl}" style="transform:translateX(${zig[i % zig.length]}px)">
          <span class="circle">${l.emoji}${crowns ? `<span class="crowns" title="Níveis concluídos">👑${crowns}</span>` : ""}</span>
          <span class="label"><b>${esc(l.title)}</b>${esc(l.titlePt)}</span></button>`;
      });
      html += `</div></section>`;
    }
    html += `<p style="text-align:center;color:var(--muted);padding:30px 0 40px;font-weight:600">${pro ? "Mais áreas em breve ✨" : "Mais unidades em breve ✨"}</p>`;
    $app.innerHTML = html;
    $app.querySelectorAll(".node").forEach(b => b.onclick = () => go(`#/lesson/${b.dataset.lesson}/${b.dataset.level}`));
    $app.querySelectorAll("[data-guide]").forEach(b => b.onclick = () => go(`#/guide/${b.dataset.guide}`));
    $app.querySelectorAll(".lv").forEach(b => b.onclick = () => {
      progress.unitLevel[b.dataset.unit] = +b.dataset.level;
      saveProgress(progress);
      const y = scrollY;
      renderHome(section);
      scrollTo(0, y);
    });
    const $inst = document.getElementById("install");
    if ($inst) $inst.onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $inst.remove(); };
    document.title = pro ? "Pro – Duolingo 101" : "Duolingo 101 – Histórias";
  }

  function renderGuide(id) {
    const u = findGroup(id);
    if (!u) return go("#/");
    const pro = sectionOf(u) === "pro";
    let html = `<button class="back">← Voltar</button>
      <div class="guide-head"><div class="big">${u.emoji}</div><div><h1>${pro ? "Guia: " : "Guia da "}${esc(u.title)}</h1><p>${esc(u.subtitle)}. Toque nas palavras para ouvir e ver a tradução.</p></div></div>
      <div class="section-title">${pro ? "FRASES-CHAVE DA PROFISSÃO" : "FRASES IMPORTANTES"}</div>`;
    for (const [en, pt] of u.phrases) {
      html += `<div class="phrase">${speakBtn(DEFAULT_VOICE, en)}<div><div class="en">${wordsHTML(en)}</div><div class="pt">${esc(pt)}</div></div></div>`;
    }
    $app.innerHTML = html;
    $app.querySelector(".back").onclick = () => go(homeHash(sectionOf(u)));
    document.title = `Guia: ${u.title} – Duolingo 101`;
  }

  async function renderLesson(id, level) {
    const found = findLesson(id);
    if (!found) return go("#/");
    const { lesson, unit, section } = found;
    const home = homeHash(section);
    const info = levelInfo(level);
    const rate = info.rate;
    const content = await getSteps(found, level);
    if (!content) {
      $app.innerHTML = `<button class="back">← Voltar</button><p style="padding:20px 0">O nível ${level} desta história ainda não foi criado. 🚧</p>`;
      $app.querySelector(".back").onclick = () => go(home);
      return;
    }
    const { steps, cast } = content;
    const enQuestions = level >= 3; // a partir do nível 3, perguntas e opções em inglês
    document.title = `${lesson.title} (nível ${level}) – Duolingo 101`;
    let pos = -1, mistakes = 0, answered = 0, waiting = false;

    $app.innerHTML = `<div class="lesson">
      <div class="lesson-top">
        <button class="close" aria-label="Sair">✕</button>
        <div class="bar"><div></div></div>
        <button class="autoplay ${progress.autoplay ? "on" : ""}" title="Tocar o áudio automaticamente">🔊 auto</button>
      </div>
      <div class="feed">
        <div class="story-head">
          <div class="art">${lesson.emoji}</div>
          <div class="title">${speakBtn(DEFAULT_VOICE, lesson.title)}<span class="en">${wordsHTML(lesson.title)}</span></div>
          <div class="sub">${esc(lesson.titlePt)} · ${esc(unit.title)}</div>
          <div class="lv-badge lv-${level}">Nível ${level} · ${esc(info.name)} <span>${esc(info.cefr || "")}</span></div>
        </div>
      </div>
    </div>
    <div class="footer"><div class="footer-inner"><span class="feedback"></span><button class="btn">Começar</button></div></div>`;

    const $feed = $app.querySelector(".feed");
    const $bar = $app.querySelector(".bar > div");
    const $btn = $app.querySelector(".btn");
    const $footer = $app.querySelector(".footer");
    const $fb = $app.querySelector(".feedback");
    $app.querySelector(".close").onclick = () => { if (pos < 0 || confirm("Sair da lição? O progresso desta história será perdido.")) go(home); };
    const $auto = $app.querySelector(".autoplay");
    $auto.onclick = () => { progress.autoplay = !progress.autoplay; saveProgress(progress); $auto.classList.toggle("on", progress.autoplay); };

    function scrollDown(el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    }

    function next() {
      if (waiting) return;
      pos++;
      $bar.style.width = (pos / steps.length) * 100 + "%";
      $footer.classList.remove("ok"); $fb.textContent = "";
      if (pos >= steps.length) return finish();
      const step = steps[pos];
      $btn.textContent = "Continuar";
      if (Array.isArray(step)) addLine(step);
      else addQuestion(step);
    }

    function addLine([who, en, pt]) {
      const c = cast[who] || { name: who, avatar: "🙂", voice: DEFAULT_VOICE };
      const narr = who === "nar";
      const el = document.createElement("div");
      el.className = "line" + (narr ? " narr" : "");
      el.innerHTML = `${narr ? "" : `<div class="avatar">${c.avatar}<small>${esc(c.name)}</small></div>`}
        <div class="bubble">${speakBtn(c.voice, en, rate)}<div class="content">
          <div class="en">${wordsHTML(en)}</div>
          <div class="trans" hidden>${esc(pt)}</div>
          <button class="pt-toggle">VER TRADUÇÃO</button>
        </div></div>`;
      $feed.appendChild(el);
      scrollDown(el);
      if (progress.autoplay) playSentence(c.voice, en, el.querySelector(".speak"), rate);
    }

    function addQuestion(q) {
      waiting = true;
      $btn.disabled = true;
      stopAudio();
      const el = document.createElement("div");
      el.className = "question";
      const isEn = enQuestions || q.lang === "en";
      // embaralha as opções para a resposta certa não ficar sempre no mesmo lugar
      const order = q.o.map((_, i) => i).sort(() => Math.random() - 0.5);
      const title = enQuestions
        ? `<h3 class="q-en">${speakBtn(DEFAULT_VOICE, q.q, rate)}<span class="en">${wordsHTML(q.q)}</span></h3>`
        : `<h3>${esc(q.q)}</h3>`;
      el.innerHTML = title + order.map((i, n) =>
        `<button class="opt" data-i="${i}" data-n="${n}"><span class="box">${n + 1}</span><span class="${isEn ? "en" : ""}">${esc(q.o[i])}</span></button>`).join("");
      $feed.appendChild(el);
      scrollDown(el);
      if (enQuestions && progress.autoplay) playSentence(DEFAULT_VOICE, q.q, el.querySelector(".speak"), rate);
      let erred = false;
      el.querySelectorAll(".opt").forEach(b => b.onclick = () => {
        const i = +b.dataset.i;
        if (isEn) playSentence(DEFAULT_VOICE, q.o[i], null, enQuestions ? rate : "-5%");
        if (i === q.a) {
          b.classList.add("right"); b.querySelector(".box").textContent = "✓";
          el.querySelectorAll(".opt").forEach(x => x.disabled = true);
          answered++; if (erred) mistakes++;
          waiting = false; $btn.disabled = false;
          $footer.classList.add("ok");
          $fb.textContent = erred ? "Isso! 👍" : ["Excelente! 🎉", "Muito bem! ✨", "Perfeito! 💪", "Mandou bem! 🙌"][Math.floor(Math.random() * 4)];
          $btn.focus();
        } else {
          erred = true;
          b.classList.remove("wrong"); void b.offsetWidth; b.classList.add("wrong");
          b.querySelector(".box").textContent = "✕";
          b.disabled = true;
        }
      });
      el._choose = (n) => el.querySelector(`.opt[data-n="${n}"]:not(:disabled)`)?.click();
    }

    function finish() {
      stopAudio();
      const acc = answered ? Math.round(((answered - mistakes) / answered) * 100) : 100;
      const key = pkey(lesson.id, level);
      const repeat = !!progress.lessons[key];
      registerStudy(key, acc, level);
      const all = groupsOf(section).flatMap(u => state.unitData[u.id].lessons.map(l => l.id));
      const nextId = all[all.indexOf(lesson.id) + 1];
      const canLevelUp = level < 5;
      $app.innerHTML = `<div class="end">
        <div class="big">${acc === 100 ? "🏆" : "🎉"}</div>
        <h1>História concluída!</h1>
        <p style="color:var(--muted);margin:0">${esc(lesson.title)} — nível ${level} · ${esc(info.name)}</p>
        <div class="cards">
          <div class="card"><div class="k">XP</div><div class="v">⚡ ${xpFor(level, repeat)}</div></div>
          <div class="card green"><div class="k">PRECISÃO</div><div class="v">🎯 ${acc}%</div></div>
        </div>
        ${canLevelUp ? `<button class="btn ghost up" id="up">⬆ Mesma história no nível ${level + 1}</button>` : ""}
        </div>
        <div class="footer"><div class="footer-inner">
          <button class="btn ghost" id="again">Repetir</button>
          <button class="btn" id="cont">${nextId ? "Próxima história" : "Continuar"}</button>
        </div></div>`;
      document.getElementById("again").onclick = () => renderLesson(lesson.id, level);
      document.getElementById("up")?.addEventListener("click", () => go(`#/lesson/${lesson.id}/${level + 1}`));
      document.getElementById("cont").onclick = () => go(nextId ? `#/lesson/${nextId}/${level}` : home);
      document.getElementById("cont").focus();
    }

    $btn.onclick = next;
    $btn.focus();
    keyHandler = (e) => {
      if (e.target.closest("button") && e.key === " ") return; // espaço já clica no botão focado
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!$btn.disabled) $btn.click(); }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) $feed.lastElementChild?._choose?.(n - 1);
    };
  }

  /* ---------- Rotas ---------- */
  let keyHandler = null;
  document.addEventListener("keydown", (e) => keyHandler?.(e));
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    keyHandler = null; hideTip(); stopAudio(); scrollTo(0, 0);
    const [, page, arg, lv] = location.hash.split("/");
    if (page === "lesson") renderLesson(arg, Math.min(5, Math.max(1, parseInt(lv, 10) || 1)));
    else if (page === "guide") renderGuide(arg);
    else if (page === "pro") renderHome("pro");
    else renderHome();
  }
  addEventListener("hashchange", route);

  /* ---------- App instalável / offline ---------- */
  let installPrompt = null;
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    if (state.units.length && (!location.hash || location.hash === "#/" || location.hash === "#/pro")) renderHome(location.hash === "#/pro" ? "pro" : "stories");
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});

  if ("speechSynthesis" in window) speechSynthesis.getVoices();
  loadAll().then(route).catch((err) => {
    $app.innerHTML = `<p style="padding:40px 0">Não consegui carregar as lições 😕<br><small style="color:var(--muted)">${esc(String(err))}</small><br><br>
      Se abriu o arquivo direto (file://), use o <b>ABRIR_LOCAL.bat</b>.</p>`;
  });
})();
