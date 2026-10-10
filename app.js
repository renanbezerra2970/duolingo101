/* Duolingo 101 – lições em formato de história (diálogo + perguntas). Sem build, sem servidor. */
(() => {
  "use strict";

  const $app = document.getElementById("app");
  const $tip = document.getElementById("tooltip");
  const WORD_RE = /[A-Za-zÀ-ÿ]+(?:'[A-Za-zÀ-ÿ]+)?/g;
  const DEFAULT_VOICE = "en-US-JennyNeural";
  const SPEAKER = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  const state = { units: [], unitData: {}, glossary: {}, manifest: {} };

  /* ---------- Progresso (fica salvo neste navegador) ---------- */
  const KEY = "d101.progress.v1";
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  }
  let progress = Object.assign({ lessons: {}, xp: 0, streak: 0, lastDay: null, autoplay: true }, loadProgress());

  function today() { return new Date().toISOString().slice(0, 10); }
  function registerStudy(lessonId, accuracy) {
    const prev = progress.lessons[lessonId];
    progress.lessons[lessonId] = { done: true, best: Math.max(accuracy, prev?.best || 0), at: today() };
    progress.xp += prev ? 5 : 15;
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
      const a = new Audio("audio/" + file);
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
  const playSentence = (voice, text, btn) => play(`${voice}|${text}`, text, btn);
  const playWord = (w) => play(`word|${w.toLowerCase()}`, w);

  /* ---------- Texto em inglês com palavras clicáveis ---------- */
  function esc(s) { return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function wordsHTML(text) {
    let out = "", i = 0;
    for (const m of text.matchAll(WORD_RE)) {
      out += esc(text.slice(i, m.index)) + `<span class="w" data-w="${esc(m[0])}">${esc(m[0])}</span>`;
      i = m.index + m[0].length;
    }
    return out + esc(text.slice(i));
  }
  function speakBtn(voice, text) {
    return `<button class="speak" data-voice="${esc(voice)}" data-text="${esc(text)}" aria-label="Ouvir">${SPEAKER}</button>`;
  }

  let tipTimer;
  document.addEventListener("click", (e) => {
    const w = e.target.closest(".w");
    if (w) {
      e.stopPropagation();
      playWord(w.dataset.w);
      const g = state.glossary[w.dataset.w.toLowerCase()];
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
    if (s) { playSentence(s.dataset.voice, s.dataset.text, s); return; }
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
    const [u, g, m] = await Promise.all([
      getJSON("data/units.json"),
      getJSON("data/glossary.json").catch(() => ({})),
      getJSON("audio/manifest.json").catch(() => ({})),
    ]);
    state.units = u.units; state.glossary = g; state.manifest = m;
    const datas = await Promise.all(state.units.map(x => getJSON(x.file)));
    datas.forEach(d => { state.unitData[d.unit] = d; });
  }
  function findLesson(id) {
    for (const u of state.units) {
      const d = state.unitData[u.id];
      const i = d.lessons.findIndex(l => l.id === id);
      if (i >= 0) return { unit: u, data: d, lesson: d.lessons[i], index: i };
    }
    return null;
  }

  /* ---------- Telas ---------- */
  function renderHome() {
    stopAudio();
    const zig = [0, 60, 90, 60, 0, -60, -90, -60];
    let html = `<header class="topbar"><div class="brand">🦉 duolingo 101</div>
      <div class="stats"><span class="fire" title="Dias seguidos">🔥 ${progress.streak}</span><span class="xp" title="XP">⚡ ${progress.xp} XP</span></div></header>`;
    for (const u of state.units) {
      const d = state.unitData[u.id];
      html += `<section class="unit" style="--unit-color:${u.color}">
        <div class="unit-banner" style="background:${u.color}">
          <div><h2>${esc(u.title)}</h2><p>${esc(u.subtitle)}</p></div>
          <button class="guide-btn" data-guide="${u.id}">📖 GUIA</button>
        </div><div class="path">`;
      d.lessons.forEach((l, i) => {
        const done = progress.lessons[l.id]?.done;
        html += `<button class="node ${done ? "done" : ""}" data-lesson="${l.id}" style="transform:translateX(${zig[i % zig.length]}px)">
          <span class="circle">${l.emoji}</span>
          <span class="label"><b>${esc(l.title)}</b>${esc(l.titlePt)}</span></button>`;
      });
      html += `</div></section>`;
    }
    html += `<p style="text-align:center;color:var(--muted);padding:30px 0 40px;font-weight:600">Mais unidades em breve ✨</p>`;
    $app.innerHTML = html;
    $app.querySelectorAll("[data-lesson]").forEach(b => b.onclick = () => go(`#/lesson/${b.dataset.lesson}`));
    $app.querySelectorAll("[data-guide]").forEach(b => b.onclick = () => go(`#/guide/${b.dataset.guide}`));
  }

  function renderGuide(id) {
    const u = state.units.find(x => String(x.id) === String(id));
    if (!u) return go("#/");
    let html = `<button class="back">← Voltar</button>
      <div class="guide-head"><div class="big">${u.emoji}</div><div><h1>Guia da ${esc(u.title)}</h1><p>${esc(u.subtitle)}. Toque nas palavras para ouvir e ver a tradução.</p></div></div>
      <div class="section-title">FRASES IMPORTANTES</div>`;
    for (const [en, pt] of u.phrases) {
      html += `<div class="phrase">${speakBtn(DEFAULT_VOICE, en)}<div><div class="en">${wordsHTML(en)}</div><div class="pt">${esc(pt)}</div></div></div>`;
    }
    $app.innerHTML = html;
    $app.querySelector(".back").onclick = () => go("#/");
  }

  function renderLesson(id) {
    const found = findLesson(id);
    if (!found) return go("#/");
    const { data, lesson, unit } = found;
    const cast = data.cast;
    const steps = lesson.steps;
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
        </div>
      </div>
    </div>
    <div class="footer"><div class="footer-inner"><span class="feedback"></span><button class="btn">Começar</button></div></div>`;

    const $feed = $app.querySelector(".feed");
    const $bar = $app.querySelector(".bar > div");
    const $btn = $app.querySelector(".btn");
    const $footer = $app.querySelector(".footer");
    const $fb = $app.querySelector(".feedback");
    $app.querySelector(".close").onclick = () => { if (pos < 0 || confirm("Sair da lição? O progresso desta história será perdido.")) go("#/"); };
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
        <div class="bubble">${speakBtn(c.voice, en)}<div class="content">
          <div class="en">${wordsHTML(en)}</div>
          <div class="trans" hidden>${esc(pt)}</div>
          <button class="pt-toggle">VER TRADUÇÃO</button>
        </div></div>`;
      $feed.appendChild(el);
      scrollDown(el);
      if (progress.autoplay) playSentence(c.voice, en, el.querySelector(".speak"));
    }

    function addQuestion(q) {
      waiting = true;
      $btn.disabled = true;
      stopAudio();
      const el = document.createElement("div");
      el.className = "question";
      const isEn = q.lang === "en";
      // embaralha as opções para a resposta certa não ficar sempre no mesmo lugar
      const order = q.o.map((_, i) => i).sort(() => Math.random() - 0.5);
      el.innerHTML = `<h3>${esc(q.q)}</h3>` + order.map((i, n) =>
        `<button class="opt" data-i="${i}" data-n="${n}"><span class="box">${n + 1}</span><span class="${isEn ? "en" : ""}">${esc(q.o[i])}</span></button>`).join("");
      $feed.appendChild(el);
      scrollDown(el);
      let erred = false;
      el.querySelectorAll(".opt").forEach(b => b.onclick = () => {
        const i = +b.dataset.i;
        if (isEn) playSentence(DEFAULT_VOICE, q.o[i]);
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
      const repeat = !!progress.lessons[lesson.id];
      registerStudy(lesson.id, acc);
      const all = state.units.flatMap(u => state.unitData[u.id].lessons.map(l => l.id));
      const nextId = all[all.indexOf(lesson.id) + 1];
      $app.innerHTML = `<div class="end">
        <div class="big">${acc === 100 ? "🏆" : "🎉"}</div>
        <h1>História concluída!</h1>
        <p style="color:var(--muted);margin:0">${esc(lesson.title)} — ${esc(lesson.titlePt)}</p>
        <div class="cards">
          <div class="card"><div class="k">XP</div><div class="v">⚡ ${repeat ? 5 : 15}</div></div>
          <div class="card green"><div class="k">PRECISÃO</div><div class="v">🎯 ${acc}%</div></div>
        </div></div>
        <div class="footer"><div class="footer-inner">
          <button class="btn ghost" id="again">Repetir</button>
          <button class="btn" id="cont">${nextId ? "Próxima história" : "Continuar"}</button>
        </div></div>`;
      document.getElementById("again").onclick = () => renderLesson(lesson.id);
      document.getElementById("cont").onclick = () => go(nextId ? `#/lesson/${nextId}` : "#/");
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
    const [, page, arg] = location.hash.split("/");
    if (page === "lesson") renderLesson(arg);
    else if (page === "guide") renderGuide(arg);
    else renderHome();
  }
  addEventListener("hashchange", route);

  if ("speechSynthesis" in window) speechSynthesis.getVoices();
  loadAll().then(route).catch((err) => {
    $app.innerHTML = `<p style="padding:40px 0">Não consegui carregar as lições 😕<br><small style="color:var(--muted)">${esc(String(err))}</small><br><br>
      Se abriu o arquivo direto (file://), use o <b>ABRIR_LOCAL.bat</b>.</p>`;
  });
})();
