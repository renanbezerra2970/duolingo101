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
  let progress = Object.assign({ lessons: {}, unitLevel: {}, xp: 0, streak: 0, lastDay: null, autoplay: true, modes: {} }, loadProgress());
  progress.unitLevel ||= {};
  progress.modes ||= {};

  // as 4 faces da língua: cada lição (em cada nível) tem um círculo dividido nelas
  const FACES = [
    { id: "read", icon: "📖", name: "Leitura", color: "#1cb0f6" },
    { id: "listen", icon: "🎧", name: "Escuta", color: "#ce82ff" },
    { id: "speak", icon: "🎤", name: "Fala", color: "#ff9600" },
    { id: "write", icon: "✍️", name: "Escrita", color: "#58cc02" },
  ];
  const PASS_RATE = 0.8; // fala e escrita contam no círculo com 80% de acertos ou mais
  const facesOf = (key) => {
    const r = progress.lessons[key];
    return { read: !!r?.done, ...(r?.faces || {}) };
  };

  // nível 1 usa a chave antiga ("u1l1"), os outros "u1l1@3"
  const pkey = (id, level) => (level > 1 ? `${id}@${level}` : id);
  const unitLevel = (unitId) => progress.unitLevel[unitId] || 1;
  const levelInfo = (n) => state.levels.find(l => l.n === n) || { n, name: "", rate: "-5%" };
  const xpFor = (level, repeat) => (repeat ? 5 : 10 + 5 * level);

  function today() { return new Date().toISOString().slice(0, 10); }
  // devolve as faces conquistadas pela primeira vez nesta rodada
  function registerStudy(key, accuracy, level, earned = {}) {
    const prev = progress.lessons[key];
    const before = facesOf(key);
    const faces = { ...(prev?.faces || {}), read: true };
    for (const f of ["listen", "speak", "write"]) if (earned[f]) faces[f] = true;
    const fresh = FACES.filter(f => faces[f.id] && !before[f.id] && f.id !== "read").map(f => f.id);
    progress.lessons[key] = { done: true, best: Math.max(accuracy, prev?.best || 0), at: today(), faces };
    progress.xp += xpFor(level, !!prev) + 5 * fresh.length;
    const t = today();
    if (progress.lastDay !== t) {
      const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      progress.streak = progress.lastDay === y ? progress.streak + 1 : 1;
      progress.lastDay = t;
    }
    saveProgress(progress);
    return fresh;
  }

  /* ---------- Áudio: MP3 pré-gerado (edge-tts) ou voz do navegador como reserva ---------- */
  let current = null, lastKey = null, lastAt = 0;
  function stopAudio() {
    if (current) { current.pause(); current = null; }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    document.querySelectorAll(".speak.playing").forEach(b => b.classList.remove("playing"));
  }
  function play(key, text, btn, onEnd) {
    stopAudio();
    // clicar duas vezes seguidas no mesmo áudio toca mais devagar (como a tartaruga do Duolingo)
    const slow = key === lastKey && Date.now() - lastAt < 4000;
    lastKey = key; lastAt = Date.now();
    btn?.classList.add("playing");
    let ended = false;
    const done = () => { btn?.classList.remove("playing"); if (!ended) { ended = true; onEnd?.(); } };
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
  const playSentence = (voice, text, btn, rate, onEnd) => play(sentenceKey(voice, text, rate), text, btn, onEnd);
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

  /* ---------- Círculo das 4 faces ---------- */
  function arcPath(cx, cy, r, a0, a1) {
    const p = (a) => [cx + r * Math.cos((a - 90) * Math.PI / 180), cy + r * Math.sin((a - 90) * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  function ringSVG(faces) {
    const gap = 14;
    const arcs = FACES.map((f, i) => {
      const a0 = i * 90 + gap / 2, a1 = (i + 1) * 90 - gap / 2;
      return `<path d="${arcPath(50, 50, 46, a0, a1)}" style="stroke:${faces[f.id] ? f.color : "var(--ring-off)"}"><title>${f.name}${faces[f.id] ? " ✓" : ""}</title></path>`;
    }).join("");
    return `<svg class="ring" viewBox="0 0 100 100" aria-hidden="true">${arcs}</svg>`;
  }
  // círculo com o ícone de cada face no meio da sua parte (leitura em cima à direita, depois sentido horário)
  function ringWithIcons(faces) {
    const icons = FACES.map((f, i) => `<span class="ring-ic ic-${i} ${faces[f.id] ? "got" : ""}" style="--c:${f.color}" title="${f.name}${faces[f.id] ? " ✓" : ""}">${f.icon}</span>`).join("");
    return ringSVG(faces) + icons;
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
        <div class="path">`;
      d.lessons.forEach((l, i) => {
        const done = progress.lessons[pkey(l.id, lvl)]?.done;
        html += `<button class="node ${done ? "done" : ""}" data-lesson="${l.id}" data-level="${lvl}" style="transform:translateX(${zig[i % zig.length]}px)">
          <span class="circle">${ringWithIcons(facesOf(pkey(l.id, lvl)))}${l.emoji}</span>
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

  /* ---------- Modos Fala e Escrita ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const M = window.D101Match;
  const STOP = new Set("a an the to of and or but is are am was were be been i you he she it we they me him her us them my your his its our their in on at for with this that these those so do does did not no yes oh ok okay just very can will would".split(" "));
  // exercícios de escrita, do mais fácil ao mais difícil: começa com 1 palavra, depois 2, depois a frase inteira
  const WRITE_PLAN = {
    1: ["fill1", "fill1", "fill2", "fill2", "copy"],
    2: ["fill1", "fill2", "fill2", "copy", "dictation"],
    3: ["fill1", "fill2", "dictation", "dictation", "translate"],
    4: ["fill2", "dictation", "dictation", "translate"],
    5: ["fill2", "dictation", "translate", "translate"],
  };
  const MAX_WORDS = { 1: 6, 2: 9, 3: 12, 4: 16, 5: 20 };
  const THRESHOLD = { copy: 0.9, dictation: 0.8, translate: 0.65, speak: 0.75 };
  const WRITE_TITLE = {
    fill1: "✍️ Complete a palavra que falta", fill2: "✍️ Complete as palavras que faltam",
    copy: "✍️ Copie a frase em inglês", dictation: "✍️ Escreva o que você ouve", translate: "✍️ Traduza para o inglês",
  };

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("out"), 3200);
    setTimeout(() => t.remove(), 3700);
  }
  const wordCount = (s) => (s.match(WORD_RE) || []).length;
  // dica: primeira letra de cada palavra ("Coffee, please." → "C_____, p_____.")
  const hintOf = (s) => s.replace(WORD_RE, (w) => w[0] + w.slice(1).replace(/[A-Za-zÀ-ÿ]/g, "_"));
  // texto com as palavras divergentes marcadas por um "!" discreto (laranja = pequena diferença, vermelho = faltou/não bateu)
  function markedHTML(text, marks) {
    return M.annotate(text, marks).map(p =>
      !p.status || p.status === "ok" ? esc(p.text)
        : `<span class="mk ${p.status}" title="${p.status === "close" ? "Pequena diferença" : "Faltou ou não bateu"}">${esc(p.text)}<sup>!</sup></span>`).join("");
  }
  const hasMarks = (marks) => marks.some(m => m !== "ok");
  let cleanup = null; // encerra microfone/áudio ao sair da lição

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
    const dialogueTotal = steps.filter(s => Array.isArray(s) && s[0] !== "nar").length;
    document.title = `${lesson.title} (nível ${level}) – Duolingo 101`;

    let pos = -1, mistakes = 0, answered = 0, waitingQuestion = false;
    let blocker = null; // exercício de fala/escrita em andamento: segura o "Continuar"
    const mode = { listen: !!progress.autoplay, speak: !!progress.modes.speak && !!SR, write: !!progress.modes.write };
    const eligible = { ...mode }; // um modo só conta no círculo se ficou ligado do começo ao fim
    const stats = { speakOk: 0, writeOk: 0, writeTotal: 0 };
    const shown = []; // falas já exibidas
    let sinceWrite = 0, writeGap = 2 + Math.round(Math.random()), writeIdx = 0;
    let activeRec = null;

    $app.innerHTML = `<div class="lesson">
      <div class="lesson-head">
        <div class="lesson-top">
          <button class="close" aria-label="Sair">✕</button>
          <div class="bar"><div></div></div>
        </div>
        <div class="modes" role="group" aria-label="Modos de estudo">
          <button class="mode" data-mode="listen" title="Tocar o áudio de cada fala automaticamente">🎧 Escuta</button>
          <button class="mode" data-mode="speak" title="Repetir cada fala em voz alta">🎤 Fala</button>
          <button class="mode" data-mode="write" title="Exercícios de escrita a cada 2 ou 3 falas">✍️ Escrita</button>
        </div>
      </div>
      <div class="feed">
        <div class="story-head">
          <div class="art">${lesson.emoji}</div>
          <div class="title">${speakBtn(DEFAULT_VOICE, lesson.title)}<span class="en">${wordsHTML(lesson.title)}</span></div>
          <div class="sub">${esc(lesson.titlePt)} · ${esc(unit.title)}</div>
          <div class="lv-badge lv-${level}">Nível ${level} · ${esc(info.name)} <span>${esc(info.cefr || "")}</span></div>
          <div class="start-ring">${ringSVG(facesOf(pkey(lesson.id, level)))}</div>
          <p class="mode-hint">Escolha os modos <b>antes de começar</b> para completar o círculo: 📖 leitura (sempre), 🎧 escuta (áudio ligado), 🎤 fala e ✍️ escrita (80% de acertos).</p>
        </div>
      </div>
    </div>
    <div class="footer"><div class="footer-inner"><span class="feedback"></span><button class="btn ghost skip" hidden>Pular</button><button class="btn main">Começar</button></div></div>`;

    const $feed = $app.querySelector(".feed");
    const $bar = $app.querySelector(".bar > div");
    const $btn = $app.querySelector(".btn.main");
    const $skip = $app.querySelector(".btn.skip");
    const $footer = $app.querySelector(".footer");
    const $fb = $app.querySelector(".feedback");

    function setFooter({ label = "Continuar", disabled = false, skip = false, ok = false, bad = false, fb = "" } = {}) {
      $btn.textContent = label;
      $btn.disabled = disabled;
      $skip.hidden = !skip;
      $footer.classList.toggle("ok", ok);
      $footer.classList.toggle("bad", bad);
      $fb.textContent = fb;
    }
    const stopRec = () => { try { activeRec?.abort(); } catch {} activeRec = null; };
    cleanup = () => { stopRec(); stopAudio(); };

    /* modos */
    const $modes = $app.querySelectorAll(".mode");
    function paintModes() {
      $modes.forEach(b => {
        b.classList.toggle("on", mode[b.dataset.mode]);
        b.setAttribute("aria-pressed", mode[b.dataset.mode]);
        if (b.dataset.mode === "speak" && !SR) b.classList.add("unavailable");
      });
    }
    $modes.forEach(b => b.onclick = () => {
      const m = b.dataset.mode;
      const label = b.textContent.trim();
      if (m === "speak" && !SR) {
        toast("Este navegador não reconhece voz. Use o Chrome (Android/PC) ou o Safari (iPhone).");
        return;
      }
      mode[m] = !mode[m];
      if (m === "listen") progress.autoplay = mode.listen; else progress.modes[m] = mode[m];
      saveProgress(progress);
      if (!mode[m]) {
        eligible[m] = false;
        if (m === "listen") stopAudio();
        if (blocker?.kind === m) blocker.cancel();
      } else if (pos >= 0) {
        eligible[m] = false;
        toast(`${label} ligado. Para contar no círculo, ele precisa estar ativo desde o início da lição.`);
      } else {
        eligible[m] = true;
      }
      paintModes();
    });
    paintModes();

    $app.querySelector(".close").onclick = () => { if (pos < 0 || confirm("Sair da lição? O progresso desta história será perdido.")) go(home); };

    function scrollDown(el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    }

    function next() {
      if (waitingQuestion) return;
      // Escrita: a cada 2 ou 3 falas, um exercício antes de seguir em frente
      if (mode.write && pos >= 0 && sinceWrite >= writeGap && shown.length && startWrite()) return;
      pos++;
      $bar.style.width = (pos / steps.length) * 100 + "%";
      setFooter();
      if (pos >= steps.length) return finish();
      const step = steps[pos];
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
      shown.push({ who, en, pt, voice: c.voice });
      sinceWrite++;
      const sp = mode.speak && !narr ? startSpeak(en) : null;
      scrollDown(sp ? sp.box : el);
      if (mode.listen) playSentence(c.voice, en, el.querySelector(".speak"), rate, () => sp?.autoStart(250));
      else sp?.autoStart(700);
    }

    /* ---------- Fala: repetir cada fala do diálogo ---------- */
    function startSpeak(expected) {
      const box = document.createElement("div");
      box.className = "practice speak-box";
      box.innerHTML = `<div class="pr-head">🎤 Agora repita a frase em voz alta</div>
        <div class="pr-said" aria-live="polite"></div>
        <div class="pr-row"><button class="mic" aria-label="Falar">🎤</button><span class="pr-msg"></span></div>`;
      $feed.appendChild(box);
      const $said = box.querySelector(".pr-said"), $mic = box.querySelector(".mic"), $msg = box.querySelector(".pr-msg");
      let alts = [], listening = false, finished = false, phase = "confirm";
      const showSaid = (fin, interim = "") => {
        $said.innerHTML = fin || interim
          ? `${esc(fin)}${interim ? ` <i>${esc(interim)}</i>` : ""}`
          : `<span class="ph">${listening ? "Ouvindo… fale agora" : "Toque no microfone e fale"}</span>`;
      };
      showSaid("");
      setFooter({ label: "Confirmar", disabled: true, skip: true });

      function listen() {
        if (finished) return;
        stopAudio();
        stopRec();
        const rec = new SR();
        activeRec = rec;
        rec.lang = "en-US";
        rec.interimResults = true;
        rec.maxAlternatives = 3;
        rec.continuous = false;
        alts = [];
        phase = "confirm";
        listening = true;
        box.classList.remove("ok", "bad");
        $mic.classList.add("on");
        $msg.textContent = "";
        showSaid("");
        setFooter({ label: "Confirmar", disabled: true, skip: true });
        rec.onresult = (e) => {
          const res = Array.from(e.results);
          const fin = res.filter(r => r.isFinal);
          const finText = fin.map(r => r[0].transcript).join(" ").trim();
          const interim = res.filter(r => !r.isFinal).map(r => r[0].transcript).join(" ");
          alts = fin.length === 1 ? Array.from(fin[0]).map(a => a.transcript.trim()) : finText ? [finText] : [];
          showSaid(finText, interim);
        };
        rec.onerror = (e) => {
          const msgs = {
            "not-allowed": "Permita o uso do microfone no navegador para usar o modo Fala.",
            "service-not-allowed": "Permita o uso do microfone no navegador para usar o modo Fala.",
            "no-speech": "Não ouvi nada. Toque no 🎤 e tente de novo.",
            "audio-capture": "Nenhum microfone encontrado.",
            network: "O reconhecimento de voz precisa de internet.",
          };
          if (e.error !== "aborted") $msg.textContent = msgs[e.error] || "Não deu para ouvir. Toque no 🎤 e tente de novo.";
        };
        rec.onend = () => {
          if (activeRec === rec) activeRec = null;
          listening = false;
          $mic.classList.remove("on");
          if (finished) return;
          if (alts.length) setFooter({ label: "Confirmar", disabled: false, skip: true });
          else {
            showSaid("");
            if (!$msg.textContent) $msg.textContent = "Não captei nada. Toque no 🎤 e tente de novo.";
          }
        };
        try { rec.start(); } catch { listening = false; $mic.classList.remove("on"); }
      }

      function confirmSaid() {
        if (phase === "retry") return listen();
        if (!alts.length) return;
        const best = alts.map(a => ({ said: a, ...M.score(expected, a, "recall") })).sort((a, b) => b.score - a.score)[0];
        // marca na frase captada o que não bateu, e mostra a frase original marcada logo abaixo
        $said.innerHTML = markedHTML(best.said, best.gmarks);
        const original = hasMarks(best.marks) ? `<div class="diff"><small>Original:</small> ${markedHTML(expected, best.marks)}</div>` : "";
        if (best.score >= THRESHOLD.speak) {
          finished = true;
          stats.speakOk++;
          box.classList.add("ok");
          $msg.innerHTML = best.exact ? "Perfeito! 🎉" : `Muito bem! 👍 Repare no que está marcado com <b class="mk-legend">!</b>${original}`;
          blocker = null;
          setFooter({ ok: true, fb: best.exact ? "Perfeito!" : "Boa pronúncia!" });
        } else {
          box.classList.add("bad");
          $msg.innerHTML = `Quase! Repare no que está marcado com <b class="mk-legend">!</b><div class="diff"><small>Original:</small> ${markedHTML(expected, best.marks)}</div>`;
          phase = "retry";
          setFooter({ label: "Tentar de novo", skip: true, bad: true });
        }
      }
      function finishSkip(text) {
        finished = true;
        stopRec();
        box.classList.add("skipped");
        $msg.textContent = text;
        blocker = null;
        setFooter();
      }
      $mic.onclick = listen;
      blocker = { kind: "speak", primary: confirmSaid, skip: () => finishSkip("Pulado."), cancel: () => finishSkip("Modo Fala desligado.") };
      return {
        box,
        autoStart(delay) { setTimeout(() => { if (!finished && !listening && blocker?.kind === "speak") listen(); }, delay); },
      };
    }

    /* ---------- Escrita: completar, copiar, ditado ou tradução ---------- */
    function blankCandidates(text) {
      const words = [...text.matchAll(WORD_RE)];
      let c = words.filter(m => m[0].length >= 3 && !STOP.has(m[0].toLowerCase()) && glossFor(m[0]));
      if (!c.length) c = words.filter(m => m[0].length >= 2 && !STOP.has(m[0].toLowerCase()));
      if (level >= 3) c = c.sort((a, b) => b[0].length - a[0].length).slice(0, Math.max(2, Math.ceil(c.length / 2)));
      return c;
    }
    function pickBlanks(text, n) {
      const c = blankCandidates(text).sort(() => Math.random() - 0.5).slice(0, n);
      return c.length === n ? c.sort((a, b) => a.index - b.index) : null;
    }

    // devolve false se não houver frase adequada (aí a lição segue normalmente)
    function startWrite() {
      const plan = WRITE_PLAN[level] || WRITE_PLAN[3];
      // depois de percorrer o plano, alterna entre os dois exercícios mais difíceis
      const over = writeIdx - plan.length;
      let type = over < 0 ? plan[writeIdx] : plan[plan.length - 1 - (over % 2)];
      const recent = shown.slice(-3).reverse().sort((a, b) => (a.who === "nar") - (b.who === "nar"));
      let line = null, blanks = null;
      if (type !== "fill1" && type !== "fill2") {
        const max = type === "translate" ? Math.min(MAX_WORDS[level], 12) : MAX_WORDS[level];
        line = recent.find(l => wordCount(l.en) >= 2 && wordCount(l.en) <= max);
        if (!line) type = "fill2";
      }
      if (type === "fill1" || type === "fill2") {
        const n = type === "fill1" ? 1 : 2;
        for (const l of recent) { blanks = pickBlanks(l.en, n) || (n === 2 ? pickBlanks(l.en, 1) : null); if (blanks) { line = l; break; } }
        if (!line) return false;
        if (blanks.length === 1) type = "fill1";
      }
      sinceWrite = 0;
      writeGap = 2 + Math.round(Math.random());
      writeIdx++;
      stats.writeTotal++;
      stopAudio();

      const { en, pt, voice } = line;
      const showPt = level <= 3;
      const box = document.createElement("div");
      box.className = "practice write-box";
      let body = "";
      if (blanks) {
        let s = "", i = 0;
        for (const m of blanks) {
          const w = m[0];
          const ph = level <= 2 ? w[0] + "…" : "";
          s += esc(en.slice(i, m.index)) + `<input class="blank" data-ans="${esc(w)}" style="width:${Math.max(4, w.length + 2)}ch" placeholder="${esc(ph)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">`;
          i = m.index + w.length;
        }
        body = `<div class="pr-src en">${s}${esc(en.slice(i))}</div>${showPt ? `<div class="pr-pt">${esc(pt)}</div>` : ""}`;
      } else {
        const src = type === "copy" ? `<div class="pr-src en">${esc(en)}</div>`
          : type === "translate" ? `<div class="pr-src pt-src">${esc(pt)}</div>`
          : (showPt ? `<div class="pr-pt">${esc(pt)}</div>` : "");
        body = `${src}<textarea class="pr-input" rows="2" placeholder="Digite em inglês…" autocomplete="off" autocapitalize="sentences" autocorrect="off" spellcheck="false" enterkeyhint="done"></textarea>`;
      }
      const canHint = type === "dictation" || type === "translate";
      box.innerHTML = `<div class="pr-head">${WRITE_TITLE[type]}</div>
        <div class="pr-tools">${type !== "translate" ? speakBtn(voice, en, rate) : ""}${canHint ? `<button class="hint">💡 Dica</button>` : ""}</div>
        ${body}
        <div class="pr-hint" hidden>${esc(hintOf(en))}</div>
        <div class="pr-msg"></div>`;
      $feed.appendChild(box);
      $feed.classList.add("quiz"); // esconde o texto das falas para a resposta não ficar à vista
      // com o teclado aberto, a caixa do exercício precisa ficar no topo da tela, logo abaixo dos modos
      const pin = () => {
        if (!box.isConnected || !$feed.classList.contains("quiz")) return;
        const head = $app.querySelector(".lesson-head");
        const top = box.getBoundingClientRect().top + scrollY - (head?.offsetHeight || 0) - 10;
        scrollTo({ top: Math.max(0, top), behavior: "instant" });
      };
      const repin = () => { pin(); setTimeout(pin, 150); setTimeout(pin, 450); };
      window.visualViewport?.addEventListener("resize", repin);
      const unpin = () => window.visualViewport?.removeEventListener("resize", repin);
      setTimeout(pin, 0);

      const inputs = [...box.querySelectorAll(".blank, .pr-input")];
      const $msg = box.querySelector(".pr-msg");
      box.querySelector(".hint")?.addEventListener("click", (e) => { box.querySelector(".pr-hint").hidden = false; e.target.remove(); });
      inputs.forEach(x => x.addEventListener("focus", repin));
      const refresh = () => setFooter({ label: "Verificar", disabled: !inputs.some(x => x.value.trim()), skip: true });
      inputs.forEach(x => x.addEventListener("input", refresh));
      refresh();
      setTimeout(() => inputs[0]?.focus({ preventScroll: true }), 350);
      if (type === "dictation") playSentence(voice, en, box.querySelector(".speak"), rate);

      function check() {
        let ok, exact;
        if (blanks) {
          const res = inputs.map(x => M.wordOk(x.dataset.ans, x.value));
          ok = res.every(r => r.ok);
          exact = res.every(r => r.exact);
          inputs.forEach((x, k) => {
            x.classList.add(res[k].ok ? (res[k].exact ? "right" : "near") : "wrong");
            if (!res[k].exact) x.insertAdjacentHTML("afterend", `<sup class="fix ${res[k].ok ? "near" : ""}">${res[k].ok ? "! " : ""}${esc(x.dataset.ans)}</sup>`);
          });
          $msg.innerHTML = ok ? (exact ? "Correto! 🎉" : `Correto, com um pequeno erro de digitação. A forma certa está ao lado da palavra marcada com <b class="mk-legend">!</b>`) : "Confira as palavras certas acima.";
        } else {
          const typed = inputs[0].value;
          const r = M.score(en, typed, "f1");
          ok = r.score >= THRESHOLD[type];
          exact = r.exact;
          const yours = `<div class="diff"><small>Você escreveu:</small> ${markedHTML(typed, r.gmarks)}</div>`;
          const right = `<div class="diff"><small>Forma certa:</small> ${markedHTML(en, r.marks)}</div>`;
          $msg.innerHTML = ok
            ? (exact ? "Correto! 🎉" : `Correto, com pequenas diferenças marcadas com <b class="mk-legend">!</b>${yours}${right}`)
            : `Não foi dessa vez. Repare no que está marcado com <b class="mk-legend">!</b>${yours}${right}`;
        }
        inputs.forEach(x => (x.disabled = true));
        document.activeElement?.blur(); // fecha o teclado para mostrar o resultado e o "Continuar"
        $feed.classList.remove("quiz");
        unpin();
        scrollDown(box);
        if (ok) stats.writeOk++;
        box.classList.add(ok ? "ok" : "bad");
        blocker = null;
        setFooter({ ok, bad: !ok, fb: ok ? "Correto!" : "Não foi dessa vez" });
        $btn.focus({ preventScroll: true });
      }
      function stop(text) {
        inputs.forEach(x => (x.disabled = true));
        document.activeElement?.blur();
        $feed.classList.remove("quiz");
        unpin();
        scrollDown(box);
        box.classList.add("skipped");
        $msg.innerHTML = `${text} Resposta:<div class="diff">${esc(en)}</div>`;
        blocker = null;
        setFooter();
      }
      blocker = { kind: "write", primary: check, skip: () => stop("Pulado."), cancel: () => stop("Modo Escrita desligado.") };
      return true;
    }

    /* ---------- Perguntas de múltipla escolha (como antes) ---------- */
    function addQuestion(q) {
      waitingQuestion = true;
      setFooter({ disabled: true });
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
      if (enQuestions && mode.listen) playSentence(DEFAULT_VOICE, q.q, el.querySelector(".speak"), rate);
      let erred = false;
      el.querySelectorAll(".opt").forEach(b => b.onclick = () => {
        const i = +b.dataset.i;
        if (isEn) playSentence(DEFAULT_VOICE, q.o[i], null, enQuestions ? rate : "-5%");
        if (i === q.a) {
          b.classList.add("right"); b.querySelector(".box").textContent = "✓";
          el.querySelectorAll(".opt").forEach(x => x.disabled = true);
          answered++; if (erred) mistakes++;
          waitingQuestion = false;
          setFooter({ ok: true, fb: erred ? "Isso! 👍" : ["Excelente! 🎉", "Muito bem! ✨", "Perfeito! 💪", "Mandou bem! 🙌"][Math.floor(Math.random() * 4)] });
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
      cleanup();
      const acc = answered ? Math.round(((answered - mistakes) / answered) * 100) : 100;
      const key = pkey(lesson.id, level);
      const repeat = !!progress.lessons[key];
      const speakRate = dialogueTotal ? stats.speakOk / dialogueTotal : 0;
      const writeRate = stats.writeTotal ? stats.writeOk / stats.writeTotal : 0;
      const earned = {
        listen: eligible.listen && mode.listen,
        speak: eligible.speak && mode.speak && speakRate >= PASS_RATE,
        write: eligible.write && mode.write && stats.writeTotal > 0 && writeRate >= PASS_RATE,
      };
      const fresh = registerStudy(key, acc, level, earned);
      const faces = facesOf(key);
      const all = groupsOf(section).flatMap(u => state.unitData[u.id].lessons.map(l => l.id));
      const nextId = all[all.indexOf(lesson.id) + 1];
      const canLevelUp = level < 5;
      const pct = (r) => Math.round(r * 100) + "%";
      const why = {
        read: "História concluída",
        listen: earned.listen ? "Áudio ligado do início ao fim" : "Faça com 🎧 Escuta ligada do início ao fim",
        speak: eligible.speak && mode.speak ? `${stats.speakOk}/${dialogueTotal} falas repetidas (${pct(speakRate)}; precisa de 80%)` : "Ligue 🎤 Fala antes de começar",
        write: eligible.write && mode.write ? `${stats.writeOk}/${stats.writeTotal} exercícios certos (${pct(writeRate)}; precisa de 80%)` : "Ligue ✍️ Escrita antes de começar",
      };
      $app.innerHTML = `<div class="end">
        <div class="end-ring">${ringWithIcons(faces)}<span>${acc === 100 ? "🏆" : "🎉"}</span></div>
        <h1>História concluída!</h1>
        <p style="color:var(--muted);margin:0">${esc(lesson.title)} — nível ${level} · ${esc(info.name)}</p>
        <div class="cards">
          <div class="card"><div class="k">XP</div><div class="v">⚡ ${xpFor(level, repeat) + 5 * fresh.length}</div></div>
          <div class="card green"><div class="k">PRECISÃO</div><div class="v">🎯 ${acc}%</div></div>
        </div>
        <ul class="face-list">
          ${FACES.map(f => `<li class="${faces[f.id] ? "got" : ""}"><span class="dot" style="background:${faces[f.id] ? f.color : "var(--ring-off)"}"></span>
            <b>${f.icon} ${f.name}</b><small>${fresh.includes(f.id) ? "<em>Nova! +5 XP</em> · " : ""}${esc(faces[f.id] && !earned[f.id] && f.id !== "read" ? "Já conquistada antes" : why[f.id])}</small></li>`).join("")}
        </ul>
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
      keyHandler = null;
    }

    $btn.onclick = () => (blocker ? blocker.primary() : next());
    $skip.onclick = () => blocker?.skip();
    $btn.focus();
    keyHandler = (e) => {
      if (e.target.matches?.("input, textarea")) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const blanks = [...$feed.querySelectorAll(".blank:not(:disabled)")];
          const k = blanks.indexOf(e.target);
          if (k >= 0 && k < blanks.length - 1) blanks[k + 1].focus();
          else if (!$btn.disabled) $btn.click();
        }
        return;
      }
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
    keyHandler = null; hideTip(); cleanup?.(); cleanup = null; stopAudio(); scrollTo(0, 0);
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
