/* Prolingo – lições em formato de história (diálogo + perguntas). Sem build, sem servidor. */
(() => {
  "use strict";

  const $app = document.getElementById("app");
  const $tip = document.getElementById("tooltip");
  const WORD_RE = /[A-Za-zÀ-ÿ]+(?:'[A-Za-zÀ-ÿ]+)?/g;
  const DEFAULT_VOICE = "en-US-JennyNeural";
  const SPEAKER = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  const state = { units: [], pro: [], unitData: {}, zero: {}, levels: [], levelData: {}, glossary: {}, manifest: {}, wordfreq: {} };

  /* ---------- Progresso (fica salvo neste navegador) ---------- */
  const KEY = "d101.progress.v1";
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  }

  /* ---------- Mudança de endereço: os endereços antigos mandam o progresso para o novo ---------- */
  // o progresso fica salvo por endereço; por isso o endereço antigo o envia junto (no #, que não vai para o servidor)
  const HOME_HOST = "prolingo101.vercel.app";
  const OLD_HOSTS = ["duolingo101.vercel.app", "prolingo-br.vercel.app"];
  if (OLD_HOSTS.includes(location.hostname)) {
    let data = null;
    try { data = localStorage.getItem(KEY); } catch {}
    const pack = data ? "#import=" + encodeURIComponent(btoa(unescape(encodeURIComponent(data)))) : "";
    location.replace(`https://${HOME_HOST}/${pack}`);
    return;
  }
  function mergeProgress(a, b) {
    const out = { ...b, ...a, lessons: { ...(b.lessons || {}) } };
    for (const [k, v] of Object.entries(a.lessons || {})) {
      const w = out.lessons[k];
      out.lessons[k] = !w ? v : {
        done: v.done || w.done, best: Math.max(v.best || 0, w.best || 0), at: v.at > w.at ? v.at : w.at,
        faces: { ...(w.faces || {}), ...Object.fromEntries(Object.entries(v.faces || {}).filter(([, x]) => x)) },
      };
    }
    out.xp = Math.max(a.xp || 0, b.xp || 0);
    out.streak = Math.max(a.streak || 0, b.streak || 0);
    out.lastDay = (a.lastDay || "") > (b.lastDay || "") ? a.lastDay : b.lastDay;
    return out;
  }
  if (location.hash.startsWith("#import=")) {
    try {
      const incoming = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(location.hash.slice(8))))));
      saveProgress(mergeProgress(loadProgress(), incoming));
    } catch {}
    history.replaceState(null, "", location.pathname + "#/");
  }

  let progress = Object.assign({ lessons: {}, unitLevel: {}, xp: 0, streak: 0, lastDay: null, autoplay: true, modes: {} }, loadProgress());
  progress.unitLevel ||= {};
  progress.modes ||= {};
  progress.tours ||= {}; // tours de primeira utilização já vistos

  /* ---------- Tours de primeira utilização ---------- */
  function homeTour() {
    Spotlight.spotlight([
      { icon: "👋", title: "Bem-vindo ao Prolingo!",
        text: "Aqui você aprende inglês com <b>histórias</b>: diálogos com áudio em cada frase, perguntas sobre o que aconteceu e desafios de fala e escrita. Vamos ver como tudo funciona?" },
      { target: ".tabs", title: "Histórias e Pro",
        text: "<b>📚 Histórias</b> acompanha o seu curso, unidade por unidade. <b>💼 Pro</b> traz conversas da vida profissional, com <b>busca</b> para achar a sua profissão." },
      { target: ".unit.open .unit-banner", title: "Unidades recolhíveis",
        text: "Toque no título de uma unidade para <b>abrir ou recolher</b>. A unidade em que você está estudando fica aberta. O botão <b>📖 GUIA</b> traz as frases-chave com áudio." },
      { target: ".unit.open .levels", title: "5 níveis de dificuldade",
        text: "A mesma história em 5 versões: do <b>1 · Básico</b> ao <b>5 · Nativo</b>, com gírias e subentendidos. Você escolhe o nível livremente. Se o nível 1 estiver difícil, o <b>0 · Palavras</b> treina as palavras da unidade com exercícios curtos." },
      { target: ".unit.open .node .circle", round: true, pad: 24, title: "O círculo de cada lição",
        text: "Ele tem 4 partes: 📖 <b>leitura</b>, 🎧 <b>escuta</b>, 🎤 <b>fala</b> e ✍️ <b>escrita</b>. Cada uma acende quando você completa a lição daquele jeito. O ✓ embaixo indica lição concluída no nível escolhido." },
      { target: ".stats .fire", title: "Sequência e XP",
        text: "🔥 são os <b>dias seguidos</b> de estudo e ⚡ o seu <b>XP</b>. Cada lição e cada parte nova do círculo rendem pontos." },
      { target: "#install", title: "Instale o app",
        text: "Coloque o Prolingo na tela inicial do celular para abrir como um aplicativo, em tela cheia." },
      { target: "#help", round: true, title: "Rever este tour",
        text: "Toque no <b>?</b> quando quiser ver estas dicas de novo." },
      { target: ".unit.open .node", title: "Pronto para começar!",
        text: "Toque na primeira lição. Lá dentro eu mostro os modos de estudo." },
    ], { doneLabel: "Vamos lá!", onDone: () => { progress.tours.home = true; saveProgress(progress); } });
  }

  function lessonTour() {
    Spotlight.spotlight([
      { icon: "📖", title: "Sua primeira história",
        text: "Cada lição é um <b>diálogo</b> que avança quando você toca em <b>Continuar</b>. A cada 4 ou 5 falas aparece uma pergunta sobre o que aconteceu." },
      { target: ".story-head .title .en", title: "Toque nas palavras",
        text: "Toque em qualquer palavra em inglês para <b>ouvir</b> e ver a <b>tradução</b>. Em cada fala, <b>Ver tradução</b> mostra a frase inteira. Tocar duas vezes no 🔊 repete mais devagar." },
      { target: ".new-words", title: "✨ Palavras novas",
        text: "Cada história apresenta só algumas palavras novas. Elas aparecem <b>destacadas em roxo</b> no diálogo e, logo depois, eu confiro se você entendeu o significado. No fim, você vê a lista do que aprendeu." },
      { target: ".mode[data-mode='listen']", title: "🎧 Escuta",
        text: "Toca o áudio de cada fala automaticamente, com vozes nativas de vários sotaques." },
      { target: ".mode[data-mode='speak']", title: "🎤 Fala",
        text: "Você <b>repete cada fala</b> em voz alta. O app escreve o que entendeu, você confere e confirma. Ele aceita pequenas diferenças e marca com <b>!</b> o que pode melhorar. O navegador vai pedir permissão para usar o microfone." },
      { target: ".mode[data-mode='write']", title: "✍️ Escrita",
        text: "A cada 2 ou 3 falas, um exercício: primeiro completar <b>palavras</b>, depois escrever a <b>frase inteira</b> (copiar, ditado ou tradução). Pequenos erros de digitação são aceitos." },
      { target: ".start-ring", round: true, pad: 16, title: "Complete o círculo",
        text: "Ligue os modos <b>antes de começar</b> para eles contarem no círculo. 📖 Leitura conta sempre; 🎤 Fala e ✍️ Escrita contam com <b>80% de acertos</b>. Há sempre um botão <b>Pular</b>." },
      { target: ".lesson .close", round: true, title: "Pode sair quando quiser",
        text: "Seu progresso fica <b>salvo</b>. Ao voltar, você continua de onde parou." },
      { target: ".footer .btn.main", title: "Tudo pronto!",
        text: "Escolha os modos e toque em <b>Começar</b>. Bons estudos! 🚀" },
    ], { doneLabel: "Começar a explorar", onDone: () => { progress.tours.lesson = true; saveProgress(progress); } });
  }

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

  // nível 1 usa a chave antiga ("u1l1"), os outros "u1l1@3" (o nível 0, de vocabulário, "u1z1@0")
  const pkey = (id, level) => (level === 1 ? id : `${id}@${level}`);
  const unitLevel = (unitId) => progress.unitLevel[unitId] ?? 1;
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
    // clicar duas vezes seguidas no mesmo áudio toca mais devagar
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
  function wordsHTML(text, mark) {
    let out = "", i = 0;
    for (const m of text.matchAll(WORD_RE)) {
      out += esc(text.slice(i, m.index)) + `<span class="w${mark ? mark(m[0]) : ""}" data-w="${esc(m[0])}">${esc(m[0])}</span>`;
      i = m.index + m[0].length;
    }
    return out + esc(text.slice(i));
  }
  function speakBtn(voice, text, rate = "-5%") {
    return `<button class="speak" data-voice="${esc(voice)}" data-text="${esc(text)}" data-rate="${rate}" aria-label="Ouvir">${SPEAKER}</button>`;
  }

  // procura a palavra no glossário; se não achar, tenta a forma base (plural, passado, -ing, possessivo...)
  const LEMMA_RULES = [
    [/'s$/, ""], [/s'$/, "s"], [/ies$/, "y"], [/ied$/, "y"], [/es$/, ""], [/s$/, ""],
    [/([^aeiou])\1ed$/, "$1"], [/ed$/, "e"], [/ed$/, ""], [/d$/, ""],
    [/([^aeiou])\1ing$/, "$1"], [/ing$/, "e"], [/ing$/, ""], [/ily$/, "y"], [/ly$/, ""],
    [/er$/, ""], [/est$/, ""],
  ];
  // forma base da palavra que está no glossário (ou null)
  function lemmaOf(word) {
    const w = word.toLowerCase().replace(/’/g, "'");
    const g = state.glossary;
    if (g[w]) return w;
    for (const [re, rep] of LEMMA_RULES) {
      if (!re.test(w)) continue;
      const base = w.replace(re, rep);
      if (base.length > 1 && g[base]) return base;
    }
    return null;
  }
  function glossFor(word) {
    const base = lemmaOf(word);
    if (!base) return null;
    return base === word.toLowerCase().replace(/’/g, "'") ? state.glossary[base] : `${state.glossary[base]} (${base})`;
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
    const nw = e.target.closest(".nw-play");
    if (nw) { playWord(nw.dataset.w); return; }
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
    const [u, lv, g, m, wf] = await Promise.all([
      getJSON("/data/units.json"),
      getJSON("/data/levels.json"),
      getJSON("/data/glossary.json").catch(() => ({})),
      getJSON("/audio/manifest.json").catch(() => ({})),
      getJSON("/data/wordfreq.json").catch(() => ({})),
    ]);
    state.wordfreq = wf;
    state.units = u.units; state.pro = u.pro || []; state.levels = lv.levels; state.glossary = g; state.manifest = m;
    const all = [...state.units, ...state.pro];
    const [datas, zeros] = await Promise.all([
      Promise.all(all.map(x => getJSON("/" + x.file))),
      Promise.all(all.map(x => getJSON(`/data/level0/u${x.id}.json`).catch(() => null))),
    ]);
    datas.forEach((d, i) => { state.unitData[all[i].id] = d; });
    zeros.forEach((d, i) => { if (d) state.zero[all[i].id] = d; });
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
      const z = state.zero[u.id]?.lessons || [];
      const k = z.findIndex(l => l.id === id);
      if (k >= 0) return { unit: u, data: d, lesson: z[k], index: k, section: sectionOf(u), zero: true };
    }
    return null;
  }
  // lições de uma unidade num nível: o nível 0 tem as suas (10, de vocabulário); os outros são as histórias
  const lessonsFor = (unitId, level) => (level === 0 ? state.zero[unitId]?.lessons || [] : state.unitData[unitId].lessons);
  const levelsFor = (unitId) => state.levels.filter(l => l.n > 0 || state.zero[unitId]);
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
  // unidades/profissões abertas nesta sessão (por aba); por padrão, só a última estudada fica aberta
  const openUnits = { stories: null, pro: null };
  let proQuery = "";
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  function defaultOpen(section) {
    const groups = groupsOf(section);
    const last = progress.lastUnit?.[section];
    if (groups.some(u => String(u.id) === String(last))) return String(last);
    // sem histórico: a primeira unidade que ainda tem lição por fazer no nível escolhido
    const pending = groups.find(u => lessonsFor(u.id, unitLevel(u.id)).some(l => !progress.lessons[pkey(l.id, unitLevel(u.id))]?.done));
    return String((pending || groups[0])?.id);
  }

  function renderHome(section = "stories") {
    stopAudio();
    const pro = section === "pro";
    openUnits[section] ||= new Set([defaultOpen(section)]);
    let html = `<header class="topbar"><div class="brand"><img src="/icons/icon.svg" alt="">prolingo</div>
      <div class="stats">${installPrompt ? `<button class="install" id="install">⬇ Instalar</button>` : ""}<button class="help" id="help" aria-label="Como funciona o app" title="Como funciona">?</button><span class="fire" title="Dias seguidos">🔥 ${progress.streak}</span><span class="xp" title="XP">⚡ ${progress.xp} XP</span></div></header>
      <nav class="tabs" role="tablist">
        <a href="#/" class="tab ${pro ? "" : "on"}" role="tab" aria-selected="${!pro}">📚 Histórias</a>
        <a href="#/pro" class="tab ${pro ? "on" : ""}" role="tab" aria-selected="${pro}">💼 Pro</a>
      </nav>`;
    if (pro) {
      const az = [...state.pro].sort((a, b) => a.title.localeCompare(b.title, "pt"));
      html += `<p class="pro-intro">Conversas da vida profissional, do primeiro atendimento ao inglês de quem trabalha na área.</p>
        <div class="pro-find">
          <label class="pro-search"><span aria-hidden="true">🔎</span><input type="search" id="pro-q" placeholder="Buscar profissão…" autocomplete="off" value="${esc(proQuery)}" aria-label="Buscar profissão"></label>
          <select id="pro-pick" aria-label="Escolher profissão da lista">
            <option value="">Lista A–Z</option>
            ${az.map(u => `<option value="${u.id}">${esc(u.title)}</option>`).join("")}
          </select>
        </div>`;
    }
    html += `<div id="units"></div>
      <p style="text-align:center;color:var(--muted);padding:30px 0 40px;font-weight:600">${pro ? "Mais áreas em breve ✨" : "Mais unidades em breve ✨"}</p>`;
    $app.innerHTML = html;
    renderUnits(section);

    if (pro) {
      const $q = document.getElementById("pro-q");
      $q.oninput = () => {
        proQuery = $q.value;
        const hits = matchingPro();
        if (hits.length === 1) openUnits.pro = new Set([String(hits[0].id)]); // achou só uma: já abre
        renderUnits(section);
      };
      document.getElementById("pro-pick").onchange = (e) => {
        const id = e.target.value;
        if (!id) return;
        chooseUnit("pro", id);
        proQuery = "";
        $q.value = "";
        e.target.value = "";
        renderUnits(section);
        document.querySelector(`.unit[data-unit="${id}"]`)?.scrollIntoView({ block: "start", behavior: "instant" });
      };
    }
    const $inst = document.getElementById("install");
    if ($inst) $inst.onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $inst.remove(); };
    document.title = pro ? "Pro – Prolingo" : "Prolingo – Histórias";
    document.getElementById("help").onclick = () => { progress.tours.lesson = false; saveProgress(progress); homeTour(); };
    if (!progress.tours.home && !pro) setTimeout(() => { if (document.getElementById("help")) homeTour(); }, 500);
  }

  // a profissão (ou unidade) escolhida vira a "atual": fica aberta e, na aba Pro, no topo
  function chooseUnit(section, id) {
    progress.lastUnit ||= {};
    progress.lastUnit[section] = String(id);
    saveProgress(progress);
    openUnits[section] = new Set([String(id)]);
  }

  function matchingPro() {
    const q = norm(proQuery.trim());
    return state.pro.filter(u => !q || norm(u.title).includes(q) || norm(u.subtitle).includes(q));
  }

  function renderUnits(section) {
    const pro = section === "pro";
    const zig = [0, 60, 90, 60, 0, -60, -90, -60];
    const open = openUnits[section];
    let groups = groupsOf(section);
    if (pro) {
      const first = progress.lastUnit?.pro;
      groups = matchingPro().sort((a, b) =>
        (String(b.id) === first) - (String(a.id) === first) || a.title.localeCompare(b.title, "pt"));
    }
    let html = "";
    if (pro && !groups.length) html = `<p class="no-results">Nenhuma profissão encontrada para “${esc(proQuery)}”.</p>`;
    for (const u of groups) {
      const d = state.unitData[u.id];
      const lvl = unitLevel(u.id);
      const isOpen = open.has(String(u.id));
      const list = lessonsFor(u.id, lvl);
      const doneHere = list.filter(l => progress.lessons[pkey(l.id, lvl)]?.done).length;
      const paused = list.some(l => progress.inProgress?.[pkey(l.id, lvl)]);
      html += `<section class="unit ${isOpen ? "open" : "collapsed"}" data-unit="${u.id}" style="--unit-color:${u.color}">
        <div class="unit-banner" style="background:${u.color}" role="button" tabindex="0" aria-expanded="${isOpen}" data-toggle="${u.id}">
          <span class="uh-emoji" aria-hidden="true">${u.emoji}</span>
          <div class="uh-text"><h2>${esc(u.title)}</h2><p>${esc(u.subtitle)}</p></div>
          ${isOpen ? `<button class="guide-btn" data-guide="${u.id}">📖 GUIA</button>`
            : `<span class="uh-meta">${paused ? "⏸ " : ""}${doneHere}/${list.length}</span>`}
          <span class="chev" aria-hidden="true">${isOpen ? "▴" : "▾"}</span>
        </div>`;
      if (isOpen) {
        html += `<div class="levels" role="tablist" aria-label="Nível de dificuldade">
          ${levelsFor(u.id).map(l => {
            const ls = lessonsFor(u.id, l.n);
            const done = ls.filter(x => progress.lessons[pkey(x.id, l.n)]?.done).length;
            return `<button class="lv lv${l.n} ${l.n === lvl ? "on" : ""} ${ls.length && done === ls.length ? "full" : ""}" data-unit="${u.id}" data-level="${l.n}" role="tab" aria-selected="${l.n === lvl}">
              <b>${l.n}</b><small>${esc(l.name)}</small></button>`;
          }).join("")}
        </div>
        ${lvl === 0 ? `<p class="zero-note">🔤 <b>Nível 0 · Palavras:</b> exercícios curtos e repetidos para fixar as palavras desta unidade antes das histórias.</p>` : ""}
        <div class="path">`;
        list.forEach((l, i) => {
          const done = progress.lessons[pkey(l.id, lvl)]?.done;
          const ip = progress.inProgress?.[pkey(l.id, lvl)];
          html += `<button class="node ${done ? "done" : ""}" data-lesson="${l.id}" data-level="${lvl}" data-unit="${u.id}" style="transform:translateX(${zig[i % zig.length]}px)">
            <span class="circle">${ringWithIcons(facesOf(pkey(l.id, lvl)))}${l.emoji}</span>
            <span class="label"><b>${esc(l.title)}</b>${esc(l.titlePt)}${ip ? `<em class="resume-tag">⏸ ${ip.pct}%</em>` : ""}</span></button>`;
        });
        html += `</div>`;
      }
      html += `</section>`;
    }
    const $units = document.getElementById("units");
    $units.innerHTML = html;
    $units.querySelectorAll("[data-toggle]").forEach(b => {
      const toggle = () => {
        const id = b.dataset.toggle;
        if (open.has(id)) open.delete(id); else open.add(id);
        renderUnits(section);
        if (open.has(id)) document.querySelector(`.unit[data-unit="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "instant" });
      };
      b.onclick = (e) => { if (!e.target.closest(".guide-btn")) toggle(); };
      b.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
    });
    $units.querySelectorAll(".node").forEach(b => b.onclick = () => {
      chooseUnit(section, b.dataset.unit);
      go(`#/lesson/${b.dataset.lesson}/${b.dataset.level}`);
    });
    $units.querySelectorAll("[data-guide]").forEach(b => b.onclick = (e) => { e.stopPropagation(); go(`#/guide/${b.dataset.guide}`); });
    $units.querySelectorAll(".lv").forEach(b => b.onclick = () => {
      progress.unitLevel[b.dataset.unit] = +b.dataset.level;
      saveProgress(progress);
      const y = scrollY;
      renderUnits(section);
      scrollTo(0, y);
    });
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
    document.title = `Guia: ${u.title} – Prolingo`;
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
  /* ---------- Palavras novas ----------
   * Cada história apresenta poucas palavras novas por vez: um cartão antes de começar, destaque roxo
   * na primeira vez que aparecem, uma checagem rápida do significado logo depois e a lista no final.
   * Uma palavra deixa de ser "nova" quando foi ensinada ou quando já apareceu em 3 histórias concluídas. */
  const NEW_CAP = { 1: 4, 2: 5, 3: 6, 4: 6, 5: 6 };
  const KNOWN_AFTER = 3;
  const shortGloss = (g) => String(g).split(/\s\(|;|,|\//)[0].trim();
  function lemmasOf(steps) {
    const out = [];
    steps.forEach((s, i) => {
      if (!Array.isArray(s)) return;
      for (const m of s[1].matchAll(WORD_RE)) { const l = lemmaOf(m[0]); if (l) out.push({ lemma: l, surface: m[0], i }); }
    });
    return out;
  }
  // palavras gramaticais muito comuns não entram como "novas"
  const BASIC = new Set("what where when who why how which have has had get got go take make there here all any some one two three four five six seven eight nine ten hundred thousand let well yeah like now then than if as by from up out about".split(" "));
  // nos níveis 3 a 5, palavras que aparecem em muitas histórias (data/wordfreq.json) não contam como novidade
  const MAX_FREQ = { 3: 20, 4: 12, 5: 10 };
  const isKnown = (l) => !!progress.words.taught[l] || (progress.words.seen[l] || 0) >= KNOWN_AFTER;
  // primeira vez com este recurso: as palavras das histórias já concluídas contam como conhecidas
  async function ensureWords() {
    if (progress.words) return;
    const words = { taught: {}, seen: {} };
    for (const key of Object.keys(progress.lessons)) {
      if (!progress.lessons[key]?.done) continue;
      const [id, lv] = key.split("@");
      const found = findLesson(id);
      if (found?.zero) { for (const w of found.lesson.words || []) words.taught[w] = 1; continue; }
      const c = found && await getSteps(found, +(lv || 1));
      if (c) for (const { lemma } of lemmasOf(c.steps)) words.taught[lemma] = 1;
    }
    progress.words = words;
    saveProgress(progress);
  }
  function pickNewWords(steps, cast, unit, level) {
    const names = new Set(Object.values(cast).flatMap(c => String(c.name).toLowerCase().split(/[^a-z]+/)));
    const guide = new Set((unit.phrases || []).flatMap(([en]) => [...en.matchAll(WORD_RE)].map(m => lemmaOf(m[0]))));
    const info = new Map();
    for (const o of lemmasOf(steps)) {
      const g = state.glossary[o.lemma];
      // fora: nomes de personagens, nomes próprios (tradução com maiúscula) e contrações
      if (/^\p{Lu}/u.test(g) || o.lemma.includes("'")) continue;
      // nos níveis 3 a 5, as frases do guia (básicas) já não são novidade
      if (level >= 3 && guide.has(o.lemma)) continue;
      if (STOP.has(o.lemma) || BASIC.has(o.lemma) || names.has(o.lemma) || o.lemma.length < 2 || isKnown(o.lemma)) continue;
      const x = info.get(o.lemma) || { ...o, n: 0 };
      x.n++;
      info.set(o.lemma, x);
    }
    let list = [...info.values()];
    const freq = (l) => state.wordfreq[l] || 1;
    if (MAX_FREQ[level]) {
      const rare = list.filter(x => freq(x.lemma) <= MAX_FREQ[level]);
      if (rare.length >= 3) list = rare;
    }
    // prioridade: palavras do guia da unidade, depois as que mais se repetem na história
    // (nos níveis avançados, desempata pela mais rara no conjunto das histórias)
    return list
      .sort((a, b) => guide.has(b.lemma) - guide.has(a.lemma) || b.n - a.n || (level >= 3 ? freq(a.lemma) - freq(b.lemma) : 0) || a.i - b.i)
      .slice(0, NEW_CAP[level] || 6)
      .sort((a, b) => a.i - b.i)
      .map(x => ({ lemma: x.lemma, show: state.manifest[`word|${x.lemma}`] ? x.lemma : x.surface.toLowerCase(), gloss: shortGloss(state.glossary[x.lemma]) }));
  }
  function wordListHTML(list) {
    return `<ul class="nw-list">${list.map(w => `<li><button class="nw-play" data-w="${esc(w.show)}" aria-label="Ouvir ${esc(w.show)}">${SPEAKER}<b>${esc(w.show)}</b></button><span>${esc(w.gloss)}</span></li>`).join("")}</ul>`;
  }
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
  // janela de confirmação do próprio app (no lugar do aviso do navegador)
  function confirmDialog({ title, text, ok, cancel }) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "dialog-wrap";
      wrap.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
          <div class="dialog-icon"><img src="/icons/icon.svg" alt=""></div>
          <h2 id="dlg-t">${esc(title)}</h2>
          <p>${esc(text)}</p>
          <button class="btn" data-r="0">${esc(cancel)}</button>
          <button class="btn ghost danger" data-r="1">${esc(ok)}</button>
        </div>`;
      const close = (r) => { wrap.remove(); removeEventListener("keydown", onKey, true); resolve(r); };
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(false); } };
      wrap.addEventListener("click", (e) => {
        if (e.target === wrap) return close(false);
        const b = e.target.closest("[data-r]");
        if (b) close(b.dataset.r === "1");
      });
      addEventListener("keydown", onKey, true);
      document.body.appendChild(wrap);
      wrap.querySelector('[data-r="0"]').focus();
    });
  }

  let cleanup = null; // encerra microfone/áudio ao sair da lição

  /* ---------- Fala (reconhecimento de voz) ----------
   * Falas com várias orações são capturadas uma oração por vez: o reconhecimento do navegador
   * para sozinho numa pausa, e frases longas acabavam cortadas no meio. */
  let activeRec = null;
  const stopRec = () => { try { activeRec?.abort(); } catch {} activeRec = null; };
  const wordsIn = (s) => (s.match(WORD_RE) || []).length;
  function splitClauses(text) {
    if (wordsIn(text) <= 7) return [text];
    let parts = text.match(/[^.!?…]+(?:[.!?…]+["'”’)]*|$)\s*/g) || [text];
    if (parts.join("") !== text) return [text];
    // uma oração muito longa: corta também em vírgula, ponto e vírgula, dois-pontos ou travessão
    parts = parts.flatMap(p => {
      if (wordsIn(p) <= 12) return [p];
      const bits = p.match(/[^,;:—]+(?:[,;:—]+|$)\s*/g) || [p];
      if (bits.join("") !== p) return [p];
      const out = [];
      for (const b of bits) {
        if (out.length && wordsIn(out[out.length - 1]) < 6) out[out.length - 1] += b; else out.push(b);
      }
      return out;
    });
    // pedaços curtinhos ("Hi!", "Ha!", "Mr.") se juntam ao vizinho
    const merged = [];
    for (const p of parts) {
      if (merged.length && wordsIn(merged[merged.length - 1]) < 3) merged[merged.length - 1] += p;
      else merged.push(p);
    }
    if (merged.length > 1 && wordsIn(merged[merged.length - 1]) < 3) { const last = merged.pop(); merged[merged.length - 1] += last; }
    return merged.map(s => s.trim()).filter(Boolean);
  }

  // caixa de "repita em voz alta"; ctx liga a caixa à tela (rodapé, bloqueio do Continuar, acerto)
  function createSpeak(expected, { mount, setFooter, setBlocker, isActive, onOk }) {
    const parts = splitClauses(expected);
    const multi = parts.length > 1;
    let k = 0; // oração da vez
    const box = document.createElement("div");
    box.className = "practice speak-box";
    box.innerHTML = `<div class="pr-head">${multi ? "🎤 Repita em voz alta, <b>uma parte de cada vez</b>" : "🎤 Agora repita a frase em voz alta"}</div>
      ${multi ? `<div class="pr-parts">${parts.map((p, i) => `<span class="pp" data-i="${i}">${esc(p)}</span>`).join(" ")}</div>` : ""}
      <div class="pr-said" aria-live="polite"></div>
      <div class="pr-row"><button class="mic" aria-label="Falar">🎤</button><span class="pr-msg"></span></div>`;
    mount(box);
    const $said = box.querySelector(".pr-said"), $mic = box.querySelector(".mic"), $msg = box.querySelector(".pr-msg");
    let alts = [], listening = false, finished = false, phase = "confirm";
    const paintParts = () => box.querySelectorAll(".pp").forEach(el => {
      const i = +el.dataset.i;
      el.classList.toggle("done", i < k);
      el.classList.toggle("cur", i === k && !finished);
    });
    const showSaid = (fin, interim = "") => {
      $said.innerHTML = fin || interim
        ? `${esc(fin)}${interim ? ` <i>${esc(interim)}</i>` : ""}`
        : `<span class="ph">${listening ? (multi ? `Ouvindo… fale a parte ${k + 1} de ${parts.length}` : "Ouvindo… fale agora") : (multi ? `Toque no microfone e fale a parte ${k + 1} de ${parts.length}` : "Toque no microfone e fale")}</span>`;
    };
    paintParts();
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
      const expectedNow = parts[k];
      const best = alts.map(a => ({ said: a, ...M.score(expectedNow, a, "recall") })).sort((a, b) => b.score - a.score)[0];
      // marca na frase captada o que não bateu, e mostra a frase original marcada logo abaixo
      $said.innerHTML = markedHTML(best.said, best.gmarks);
      const original = hasMarks(best.marks) ? `<div class="diff"><small>Original:</small> ${markedHTML(expectedNow, best.marks)}</div>` : "";
      if (best.score < THRESHOLD.speak) {
        box.classList.add("bad");
        $msg.innerHTML = `Quase! Repare no que está marcado com <b class="mk-legend">!</b><div class="diff"><small>Original:</small> ${markedHTML(expectedNow, best.marks)}</div>`;
        phase = "retry";
        setFooter({ label: "Tentar de novo", skip: true, bad: true });
        return;
      }
      if (k < parts.length - 1) {
        // parte certa: segue para a próxima oração, já ouvindo
        k++;
        paintParts();
        box.classList.add("ok");
        $msg.innerHTML = `${best.exact ? "Isso! 👍" : `Boa! Repare no <b class="mk-legend">!</b>${original}`} Agora a parte ${k + 1} de ${parts.length}.`;
        alts = [];
        setFooter({ label: "Confirmar", disabled: true, skip: true });
        setTimeout(() => { if (!finished && !listening && isActive()) listen(); }, best.exact ? 700 : 1600);
        return;
      }
      finished = true;
      k = parts.length;
      paintParts();
      onOk();
      box.classList.add("ok");
      $msg.innerHTML = best.exact ? "Perfeito! 🎉" : `Muito bem! 👍 Repare no que está marcado com <b class="mk-legend">!</b>${original}`;
      setBlocker(null);
      setFooter({ ok: true, fb: best.exact ? "Perfeito!" : "Boa pronúncia!" });
    }
    function finishSkip(text) {
      finished = true;
      stopRec();
      box.classList.add("skipped");
      $msg.textContent = text;
      setBlocker(null);
      setFooter();
    }
    $mic.onclick = listen;
    setBlocker({ kind: "speak", primary: confirmSaid, skip: () => finishSkip("Pulado."), cancel: () => finishSkip("Modo Fala desligado.") });
    return {
      box,
      autoStart(delay) { setTimeout(() => { if (!finished && !listening && isActive()) listen(); }, delay); },
    };
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
    await ensureWords();
    const newWords = pickNewWords(steps, cast, unit, level);
    const newByLemma = new Map(newWords.map(w => [w.lemma, w]));
    const introduced = new Set(); // palavras novas que já apareceram no diálogo
    const wordQuiz = []; // checagens rápidas aguardando a vez
    const enQuestions = level >= 3; // a partir do nível 3, perguntas e opções em inglês
    const dialogueTotal = steps.filter(s => Array.isArray(s) && s[0] !== "nar").length;
    document.title = `${lesson.title} (nível ${level}) – Prolingo`;

    let pos = -1, mistakes = 0, answered = 0, waitingQuestion = false;
    let blocker = null; // exercício de fala/escrita em andamento: segura o "Continuar"
    const mode = { listen: !!progress.autoplay, speak: !!progress.modes.speak && !!SR, write: !!progress.modes.write };
    const eligible = { ...mode }; // um modo só conta no círculo se ficou ligado do começo ao fim
    const stats = { speakOk: 0, writeOk: 0, writeTotal: 0 };
    const shown = []; // falas já exibidas
    let sinceWrite = 0, writeGap = 2 + Math.round(Math.random()), writeIdx = 0;

    // progresso salvo da lição (cada nível tem o seu); salvo a cada passo concluído
    const lkey = pkey(lesson.id, level);
    progress.inProgress ||= {};
    const saved = progress.inProgress[lkey]?.pos >= 0 && progress.inProgress[lkey].pos < steps.length - 1 ? progress.inProgress[lkey] : null;
    const snapshot = () => {
      progress.inProgress[lkey] = {
        pos, mistakes, answered, stats: { ...stats }, eligible: { ...eligible }, sinceWrite, writeGap, writeIdx,
        pct: Math.round(((pos + 1) / steps.length) * 100), at: today(),
      };
      saveProgress(progress);
    };
    const clearSnapshot = () => { if (progress.inProgress[lkey]) { delete progress.inProgress[lkey]; saveProgress(progress); } };

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
          ${newWords.length ? `<div class="new-words"><div class="nw-title">✨ Palavras novas nesta história</div>
            ${wordListHTML(newWords)}<p class="nw-note">Elas aparecem <span class="nw-sample">destacadas</span> no diálogo, e eu confiro se ficou claro.</p></div>` : ""}
          ${level === 1 && state.zero[unit.id] && pos < 0 ? `<a class="zero-link" href="#/lesson/${(state.zero[unit.id].lessons.find(l => !progress.lessons[pkey(l.id, 0)]?.done) || state.zero[unit.id].lessons[0]).id}/0">🔤 Achou difícil? Treine antes o vocabulário no <b>nível 0</b> →</a>` : ""}
          ${saved ? `<p class="resume-note">⏸ Você parou em <b>${saved.pct}%</b> desta história. Continue de onde parou ou recomece.</p>` : ""}
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

    function setFooter({ label = "Continuar", disabled = false, skip = false, skipLabel = "Pular", ok = false, bad = false, fb = "" } = {}) {
      $btn.textContent = label;
      $btn.disabled = disabled;
      $skip.hidden = !skip;
      $skip.textContent = skipLabel;
      $footer.classList.toggle("ok", ok);
      $footer.classList.toggle("bad", bad);
      $fb.textContent = fb;
    }
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

    $app.querySelector(".close").onclick = async () => {
      if (pos < 0) return go(home);
      const leave = await confirmDialog({
        title: "Sair da lição?",
        text: "Seu progresso fica salvo. Quando voltar, você continua de onde parou.",
        cancel: "Continuar estudando",
        ok: "Sair e continuar depois",
      });
      if (leave) go(home);
    };

    function scrollDown(el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    }

    function next() {
      if (waitingQuestion) return;
      if (pos >= 0) snapshot(); // tudo até aqui está resolvido: ponto seguro para retomar
      if (wordQuiz.length) return addWordQuiz(wordQuiz.shift());
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

    function addLine(step) {
      const { el, c, narr, en } = renderLine(step);
      sinceWrite++;
      const sp = mode.speak && !narr ? startSpeak(en) : null;
      scrollDown(sp ? sp.box : el);
      if (mode.listen) playSentence(c.voice, en, el.querySelector(".speak"), rate, () => sp?.autoStart(250));
      else sp?.autoStart(700);
    }

    // destaca a primeira aparição de cada palavra nova (e agenda a checagem do significado)
    const markNew = (quiet) => (word) => {
      const l = lemmaOf(word);
      if (!l || !newByLemma.has(l) || introduced.has(l)) return "";
      introduced.add(l);
      if (!quiet) wordQuiz.push(newByLemma.get(l));
      return " new";
    };

    function renderLine([who, en, pt], quiet = false) {
      const c = cast[who] || { name: who, avatar: "🙂", voice: DEFAULT_VOICE };
      const narr = who === "nar";
      const el = document.createElement("div");
      el.className = "line" + (narr ? " narr" : "");
      el.innerHTML = `${narr ? "" : `<div class="avatar">${c.avatar}<small>${esc(c.name)}</small></div>`}
        <div class="bubble">${speakBtn(c.voice, en, rate)}<div class="content">
          <div class="en">${wordsHTML(en, markNew(quiet))}</div>
          <div class="trans" hidden>${esc(pt)}</div>
          <button class="pt-toggle">VER TRADUÇÃO</button>
        </div></div>`;
      $feed.appendChild(el);
      shown.push({ who, en, pt, voice: c.voice });
      return { el, c, narr, en };
    }

    // pergunta já respondida (ao retomar uma lição salva)
    function renderAnswered(q) {
      const el = document.createElement("div");
      el.className = "question answered";
      const isEn = enQuestions || q.lang === "en";
      const title = enQuestions ? `<h3 class="q-en"><span class="en">${wordsHTML(q.q)}</span></h3>` : `<h3>${esc(q.q)}</h3>`;
      el.innerHTML = title + `<button class="opt right" disabled><span class="box">✓</span><span class="${isEn ? "en" : ""}">${esc(q.o[q.a])}</span></button>`;
      $feed.appendChild(el);
    }

    // retoma a lição do ponto salvo: refaz o diálogo até ali, sem áudio
    function resume(s) {
      pos = s.pos; mistakes = s.mistakes; answered = s.answered;
      Object.assign(stats, s.stats);
      sinceWrite = s.sinceWrite; writeGap = s.writeGap; writeIdx = s.writeIdx;
      // um modo só segue valendo para o círculo se estava ativo desde o início e continua ligado
      for (const m of ["listen", "speak", "write"]) eligible[m] = !!s.eligible?.[m] && mode[m];
      $feed.querySelector(".resume-note")?.remove();
      for (let i = 0; i <= pos; i++) {
        const st = steps[i];
        if (Array.isArray(st)) renderLine(st, true); else renderAnswered(st);
      }
      $feed.insertAdjacentHTML("beforeend", `<div class="resume-mark">⏸ Você parou aqui</div>`);
      $bar.style.width = ((pos + 1) / steps.length) * 100 + "%";
    }

    /* ---------- Fala: repetir cada fala do diálogo ---------- */
    function startSpeak(expected) {
      return createSpeak(expected, {
        mount: (el) => $feed.appendChild(el),
        setFooter,
        setBlocker: (b) => { blocker = b; },
        isActive: () => blocker?.kind === "speak",
        onOk: () => { stats.speakOk++; },
      });
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
      const fresh = (m) => newByLemma.has(lemmaOf(m[0]) || "");
      const c = blankCandidates(text).sort((a, b) => fresh(b) - fresh(a) || Math.random() - 0.5).slice(0, n);
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

    /* ---------- Palavra nova: o que significa? ---------- */
    function wordOptions(w) {
      const pool = [...new Set([
        ...newWords.filter(x => x !== w).map(x => x.gloss),
        ...lemmasOf(steps).filter(o => !STOP.has(o.lemma)).map(o => shortGloss(state.glossary[o.lemma])),
      ])].sort(() => Math.random() - 0.5);
      const opts = [w.gloss];
      for (const g of pool) {
        if (opts.length === 3) break;
        if (g && !opts.some(o => norm(o) === norm(g))) opts.push(g);
      }
      return opts.sort(() => Math.random() - 0.5);
    }
    function addWordQuiz(w) {
      waitingQuestion = true;
      setFooter({ disabled: true });
      const el = document.createElement("div");
      el.className = "question word-quiz";
      el.innerHTML = `<div class="nw-tag">✨ PALAVRA NOVA</div>
        <h3>O que significa <button class="nw-play big" data-w="${esc(w.show)}" aria-label="Ouvir ${esc(w.show)}">${SPEAKER}<b>${esc(w.show)}</b></button>?</h3>` +
        wordOptions(w).map((o, n) => `<button class="opt" data-ok="${o === w.gloss ? 1 : 0}" data-n="${n}"><span class="box">${n + 1}</span><span>${esc(o)}</span></button>`).join("");
      $feed.appendChild(el);
      scrollDown(el);
      playWord(w.show);
      el.querySelectorAll(".opt").forEach(b => b.onclick = () => {
        if (b.dataset.ok === "1") {
          b.classList.add("right"); b.querySelector(".box").textContent = "✓";
          el.querySelectorAll(".opt").forEach(x => x.disabled = true);
          waitingQuestion = false;
          setFooter({ ok: true, fb: `${w.show} = ${w.gloss}` });
          $btn.focus();
        } else {
          b.classList.remove("wrong"); void b.offsetWidth; b.classList.add("wrong");
          b.querySelector(".box").textContent = "✕";
          b.disabled = true;
        }
      });
      el._choose = (n) => el.querySelector(`.opt[data-n="${n}"]:not(:disabled)`)?.click();
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
      clearSnapshot();
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
      const learned = newWords.filter(w => introduced.has(w.lemma));
      for (const w of learned) progress.words.taught[w.lemma] ||= today();
      if (!repeat) for (const l of new Set(lemmasOf(steps).map(o => o.lemma))) progress.words.seen[l] = (progress.words.seen[l] || 0) + 1;
      saveProgress(progress);
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
        ${learned.length ? `<div class="new-words learned"><div class="nw-title">✨ Palavras que você aprendeu</div>${wordListHTML(learned)}</div>` : ""}
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
    if (!progress.tours.lesson) setTimeout(() => { if (pos < 0 && $btn.isConnected) lessonTour(); }, 500);
    if (saved) {
      // tela inicial com escolha: continuar de onde parou ou recomeçar
      setFooter({ label: "Continuar de onde parei", skip: true, skipLabel: "Recomeçar" });
      blocker = {
        kind: "start",
        primary: () => { blocker = null; resume(saved); next(); },
        skip: () => { blocker = null; clearSnapshot(); $feed.querySelector(".resume-note")?.remove(); next(); },
        cancel: () => {},
      };
    }
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

  /* ---------- Nível 0: vocabulário em ciclo de repetição ----------
   * 20 telas por lição: apresentar a palavra, reconhecer, ouvir, combinar pares, montar e completar
   * frases, falar e escrever. Com ✍️ Escrita ligada, montar frases vira digitar; com 🎤 Fala ligada,
   * as frases são repetidas em voz alta. Errou? A tela volta no fim da lição (uma vez). */
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const tokensOf = (s) => s.match(WORD_RE) || [];
  const sameTokens = (a, b) => tokensOf(a).join(" ").toLowerCase() === tokensOf(b).join(" ").toLowerCase();

  async function renderDrill(id) {
    const found = findLesson(id);
    if (!found?.zero) return go("#/");
    const { lesson, unit, section } = found;
    const home = homeHash(section);
    const level = 0, key = pkey(lesson.id, 0);
    const info = levelInfo(0);
    const screens = lesson.screens;
    await ensureWords();
    document.title = `Vocabulário ${found.index + 1} – ${unit.title} – Prolingo`;

    const mode = { listen: !!progress.autoplay, speak: !!progress.modes.speak && !!SR, write: !!progress.modes.write };
    const eligible = { ...mode };
    const stats = { speakOk: 0, speakTotal: 0, writeOk: 0, writeTotal: 0 };
    let queue = screens.map((_, i) => i), qi = -1, firstOk = 0, scored = 0, retried = [];
    let blocker = null, checker = null, phase = "start", isWrite = false;

    progress.inProgress ||= {};
    const saved = progress.inProgress[key]?.queue ? progress.inProgress[key] : null;
    const snapshot = () => {
      progress.inProgress[key] = { queue, qi, firstOk, scored, retried, stats: { ...stats }, eligible: { ...eligible }, pct: Math.round(((qi + 1) / queue.length) * 100), at: today() };
      saveProgress(progress);
    };
    const clearSnapshot = () => { if (progress.inProgress[key]) { delete progress.inProgress[key]; saveProgress(progress); } };
    const wordsList = lesson.words.map(w => ({ lemma: w, show: w, gloss: screens.find(s => s.w === w && s.pt)?.pt || shortGloss(state.glossary[w] || "") }));

    $app.innerHTML = `<div class="lesson drill-lesson">
      <div class="lesson-head">
        <div class="lesson-top">
          <button class="close" aria-label="Sair">✕</button>
          <div class="bar"><div></div></div>
        </div>
        <div class="modes" role="group" aria-label="Modos de estudo">
          <button class="mode" data-mode="listen" title="Tocar o áudio automaticamente">🎧 Escuta</button>
          <button class="mode" data-mode="speak" title="Repetir as frases em voz alta">🎤 Fala</button>
          <button class="mode" data-mode="write" title="Digitar as frases em vez de montar com blocos">✍️ Escrita</button>
        </div>
      </div>
      <div class="feed drill">
        <div class="story-head">
          <div class="art">${lesson.emoji}</div>
          <div class="title"><span class="en drill-title">${esc(lesson.title)}</span></div>
          <div class="sub">${esc(lesson.titlePt)} · ${esc(unit.title)}</div>
          <div class="lv-badge lv-0">Nível 0 · ${esc(info.name)} <span>${esc(info.cefr || "")}</span></div>
          <div class="start-ring">${ringSVG(facesOf(key))}</div>
          ${wordsList.length ? `<div class="new-words"><div class="nw-title">✨ Palavras desta lição</div>${wordListHTML(wordsList)}</div>`
            : `<p class="mode-hint">Revisão de todas as palavras da unidade.</p>`}
          ${saved ? `<p class="resume-note">⏸ Você parou em <b>${saved.pct}%</b> desta lição. Continue de onde parou ou recomece.</p>` : ""}
          <p class="mode-hint">20 exercícios curtos. Ligue os modos <b>antes de começar</b> para completar o círculo: 🎧 escuta, 🎤 fala (repetir frases) e ✍️ escrita (digitar em vez de montar).</p>
        </div>
      </div>
    </div>
    <div class="footer"><div class="footer-inner"><span class="feedback"></span><button class="btn ghost skip" hidden>Pular</button><button class="btn main">Começar</button></div></div>`;

    const $stage = $app.querySelector(".drill");
    const $bar = $app.querySelector(".bar > div");
    const $btn = $app.querySelector(".btn.main");
    const $skip = $app.querySelector(".btn.skip");
    const $footer = $app.querySelector(".footer");
    const $fb = $app.querySelector(".feedback");
    function setFooter({ label = "Continuar", disabled = false, skip = false, skipLabel = "Pular", ok = false, bad = false, fb = "" } = {}) {
      $btn.textContent = label;
      $btn.disabled = disabled;
      $skip.hidden = !skip;
      $skip.textContent = skipLabel;
      $footer.classList.toggle("ok", ok);
      $footer.classList.toggle("bad", bad);
      $fb.innerHTML = fb;
    }
    cleanup = () => { stopRec(); stopAudio(); };

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
      if (m === "speak" && !SR) return toast("Este navegador não reconhece voz. Use o Chrome (Android/PC) ou o Safari (iPhone).");
      mode[m] = !mode[m];
      if (m === "listen") progress.autoplay = mode.listen; else progress.modes[m] = mode[m];
      saveProgress(progress);
      if (!mode[m]) { eligible[m] = false; if (m === "listen") stopAudio(); if (blocker?.kind === m) blocker.cancel(); }
      else if (phase !== "start") { eligible[m] = false; toast(`${b.textContent.trim()} ligado. Vale a partir da próxima tela; para contar no círculo, precisa estar ativo desde o início.`); }
      else eligible[m] = true;
      paintModes();
    });
    paintModes();

    $app.querySelector(".close").onclick = async () => {
      if (phase === "start") return go(home);
      const leave = await confirmDialog({
        title: "Sair da lição?", text: "Seu progresso fica salvo. Quando voltar, você continua de onde parou.",
        cancel: "Continuar estudando", ok: "Sair e continuar depois",
      });
      if (leave) go(home);
    };

    const say = (w) => playWord(w);
    const sayLine = (sc, btn, onEnd) => playSentence(sc.v, sc.en, btn, "-5%", onEnd);
    const speakerBig = (label = "Ouvir") => `<button class="big-speaker" aria-label="${label}">${SPEAKER}</button>`;
    const prompt = (tag, title) => `<div class="dr-tag">${tag}</div><h2 class="dr-q">${title}</h2>`;

    // opções de múltipla escolha; "lang" en faz cada toque falar a palavra
    function choices(options, right, { en = false, speakTap = false } = {}) {
      const box = document.createElement("div");
      box.className = "dr-opts";
      box.innerHTML = options.map((o, n) => `<button class="opt" data-n="${n}"><span class="box">${n + 1}</span><span class="${en ? "en" : ""}">${esc(o)}</span></button>`).join("");
      $stage.appendChild(box);
      let chosen = null;
      box.querySelectorAll(".opt").forEach(b => b.onclick = () => {
        if (phase !== "answer") return;
        box.querySelectorAll(".opt").forEach(x => x.classList.remove("sel"));
        b.classList.add("sel");
        chosen = options[+b.dataset.n];
        if (speakTap) say(chosen);
        setFooter({ label: "Verificar" });
      });
      $stage._choose = (n) => box.querySelector(`.opt[data-n="${n}"]`)?.click();
      checker = () => {
        const ok = chosen === right;
        box.querySelectorAll(".opt").forEach(x => {
          x.disabled = true;
          if (options[+x.dataset.n] === right) x.classList.add("right");
          else if (x.classList.contains("sel")) x.classList.add("wrong");
        });
        return { ok, answer: right };
      };
      setFooter({ label: "Verificar", disabled: true });
    }

    // montar a frase tocando nos blocos
    function tiles(answer, extra) {
      const words = shuffle([...tokensOf(answer), ...(extra || [])]);
      const box = document.createElement("div");
      box.className = "dr-bank";
      box.innerHTML = `<div class="dr-line" aria-live="polite"></div><div class="dr-tiles">${words.map((w, i) => `<button class="tile" data-i="${i}">${esc(w)}</button>`).join("")}</div>`;
      $stage.appendChild(box);
      const $line = box.querySelector(".dr-line");
      const picked = [];
      const paint = () => {
        $line.innerHTML = picked.map(i => `<button class="tile in" data-i="${i}">${esc(words[i])}</button>`).join("");
        box.querySelectorAll(".dr-tiles .tile").forEach(t => t.classList.toggle("used", picked.includes(+t.dataset.i)));
        setFooter({ label: "Verificar", disabled: !picked.length });
      };
      box.addEventListener("click", (e) => {
        const t = e.target.closest(".tile");
        if (!t || phase !== "answer") return;
        const i = +t.dataset.i;
        if (t.classList.contains("in")) picked.splice(picked.indexOf(i), 1);
        else if (!picked.includes(i)) { picked.push(i); say(words[i]); }
        paint();
      });
      paint();
      checker = () => {
        const given = picked.map(i => words[i]).join(" ");
        box.querySelectorAll(".tile").forEach(t => t.disabled = true);
        return { ok: sameTokens(given, answer), answer };
      };
    }

    // digitar (tradução ou ditado), com a mesma tolerância dos exercícios de escrita
    function typed(answer, kind) {
      const box = document.createElement("div");
      box.className = "dr-type";
      box.innerHTML = `<textarea class="write-input" rows="2" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="${answer.includes(" ") ? "Escreva em inglês" : "Escreva a palavra"}"></textarea><div class="pr-msg"></div>`;
      $stage.appendChild(box);
      const $in = box.querySelector("textarea");
      $in.oninput = () => setFooter({ label: "Verificar", disabled: !$in.value.trim() });
      $in.onfocus = () => setTimeout(() => $in.scrollIntoView({ block: "center", behavior: "instant" }), 250);
      setTimeout(() => $in.focus({ preventScroll: true }), 50);
      setFooter({ label: "Verificar", disabled: true });
      checker = () => {
        const r = M.score(answer, $in.value, kind);
        const ok = r.score >= THRESHOLD[kind];
        isWrite = true;
        $in.disabled = true;
        $in.blur();
        if (!r.exact) box.querySelector(".pr-msg").innerHTML = `<div class="diff"><small>Resposta:</small> ${markedHTML(answer, r.marks)}</div>`;
        return { ok, answer, near: ok && !r.exact };
      };
    }

    function show(sc) {
      $stage.innerHTML = "";
      $stage._choose = null;
      checker = null;
      isWrite = false;
      phase = "answer";
      const el = document.createElement("div");
      el.className = "dr-screen";
      $stage.appendChild(el);
      const add = (html) => el.insertAdjacentHTML("beforeend", html);
      const wire = (fn) => el.querySelectorAll(".big-speaker").forEach(b => b.onclick = () => fn(b));
      switch (sc.t) {
        case "intro":
          add(`${prompt("✨ PALAVRA NOVA", "")}<div class="dr-card">${speakerBig()}<div class="dr-word en">${esc(sc.w)}</div><div class="dr-pt">${esc(sc.pt)}</div></div>
            <p class="dr-hint">Toque no alto-falante para ouvir de novo.</p>`);
          wire(() => say(sc.w));
          say(sc.w);
          phase = "result";
          setFooter({ label: "Continuar" });
          return;
        case "meaning":
          add(prompt("ESCOLHA O SIGNIFICADO", `O que significa <button class="nw-play big" data-w="${esc(sc.w)}">${SPEAKER}<b>${esc(sc.w)}</b></button>?`));
          if (mode.listen) say(sc.w);
          return choices(sc.o, sc.pt);
        case "phrase":
          add(`${prompt("✨ FRASE NOVA", "")}<div class="dr-card dr-phrase">${speakerBig()}<div class="dr-sent en">${wordsHTML(sc.en)}</div><div class="dr-pt">${esc(sc.pt)}</div></div>
            <p class="dr-hint">Ouça e leia com atenção: ela vai aparecer nos próximos exercícios. Toque nas palavras para ver a tradução.</p>`);
          wire((b) => sayLine(sc, b));
          sayLine(sc, el.querySelector(".big-speaker"));
          phase = "result";
          setFooter({ label: "Continuar" });
          return;
        case "spell":
          if (!mode.write) {
            add(`${prompt("🎧 O QUE VOCÊ OUVE?", "Toque na palavra que você ouviu")}<div class="dr-listen">${speakerBig()}</div>`);
            wire(() => say(sc.w));
            say(sc.w);
            return choices(sc.o, sc.w, { en: true });
          }
          add(`${prompt("✍️ ESCREVA A PALAVRA QUE VOCÊ OUVE", "")}<div class="dr-listen">${speakerBig()}</div><p class="dr-hint">Dica: ${esc(sc.pt)}</p>`);
          wire(() => say(sc.w));
          say(sc.w);
          return typed(sc.w, "copy");
        case "copy":
          if (!mode.write) {
            add(prompt("MONTE A FRASE EM INGLÊS", esc(sc.pt)));
            return tiles(sc.en, sc.x);
          }
          add(`${prompt("✍️ COPIE A FRASE", "")}<div class="dr-sentence">${speakerBig()}<span class="en">${wordsHTML(sc.en)}</span></div><div class="dr-pt-line">${esc(sc.pt)}</div>`);
          wire((b) => sayLine(sc, b));
          if (mode.listen) sayLine(sc, el.querySelector(".big-speaker"));
          return typed(sc.en, "copy");
        case "pick":
          add(prompt("ESCOLHA A PALAVRA", `Como se diz “${esc(sc.pt)}”?`));
          return choices(sc.o, sc.w, { en: true, speakTap: true });
        case "hear":
          add(`${prompt("🎧 O QUE VOCÊ OUVE?", "Toque na palavra que você ouviu")}<div class="dr-listen">${speakerBig()}</div>`);
          wire(() => say(sc.w));
          say(sc.w);
          return choices(sc.o, sc.w, { en: true });
        case "pairs": return pairs(sc, add);
        case "fill":
          add(`${prompt("COMPLETE A FRASE", "")}<div class="dr-sentence">${speakerBig()}<span class="en">${esc(sc.gap).replace("___", '<span class="gap">____</span>')}</span></div><div class="dr-pt-line">${esc(sc.pt)}</div>`);
          wire((b) => sayLine(sc, b));
          return choices(sc.o, sc.w, { en: true, speakTap: true });
        case "listen":
          add(`${prompt("🎧 O QUE VOCÊ OUVE?", "Escolha a frase que você ouviu")}<div class="dr-listen">${speakerBig()}</div>`);
          wire((b) => sayLine(sc, b));
          sayLine(sc, el.querySelector(".big-speaker"));
          return choices(sc.o, sc.en, { en: true });
        case "bank":
          if (mode.write && sc.wr === "copy") { // 1ª metade: escreve vendo a frase
            add(`${prompt("✍️ COPIE A FRASE", "")}<div class="dr-sentence">${speakerBig()}<span class="en">${wordsHTML(sc.en)}</span></div><div class="dr-pt-line">${esc(sc.pt)}</div>`);
            wire((b) => sayLine(sc, b));
            return typed(sc.en, "copy");
          }
          if (mode.write) {
            add(prompt("✍️ ESCREVA EM INGLÊS", esc(sc.pt)));
            return typed(sc.en, "translate");
          }
          add(prompt("MONTE A FRASE EM INGLÊS", esc(sc.pt)));
          return tiles(sc.en, sc.x);
        case "type":
          add(`${prompt(mode.write ? "✍️ ESCREVA O QUE VOCÊ OUVE" : "🎧 MONTE O QUE VOCÊ OUVE", "")}<div class="dr-listen">${speakerBig()}</div>`);
          wire((b) => sayLine(sc, b));
          sayLine(sc, el.querySelector(".big-speaker"));
          return mode.write ? typed(sc.en, "dictation") : tiles(sc.en, sc.x);
        case "speak":
          if (mode.speak) {
            add(`${prompt("🎤 FALE EM VOZ ALTA", "")}<div class="dr-sentence">${speakerBig()}<span class="en">${wordsHTML(sc.en)}</span></div><div class="dr-pt-line">${esc(sc.pt)}</div>`);
            wire((b) => sayLine(sc, b));
            stats.speakTotal++;
            phase = "result"; // quem libera o Continuar é a própria caixa de fala
            const sp = createSpeak(sc.en, {
              mount: (box) => $stage.appendChild(box),
              setFooter,
              setBlocker: (b) => { blocker = b; },
              isActive: () => blocker?.kind === "speak",
              onOk: () => { stats.speakOk++; firstOk++; },
            });
            scored++;
            sayLine(sc, el.querySelector(".big-speaker"), () => sp.autoStart(250));
            return;
          }
          add(`${prompt("O QUE ESTA FRASE SIGNIFICA?", "")}<div class="dr-sentence">${speakerBig()}<span class="en">${wordsHTML(sc.en)}</span></div>`);
          wire((b) => sayLine(sc, b));
          if (mode.listen) sayLine(sc, el.querySelector(".big-speaker"));
          return choices(sc.o, sc.pt);
      }
    }

    function pairs(sc, add) {
      add(prompt("TOQUE NOS PARES", ""));
      const left = shuffle(sc.p.map(p => p[0])), right = shuffle(sc.p.map(p => p[1]));
      const box = document.createElement("div");
      box.className = "dr-pairs";
      box.innerHTML = left.map((w, i) => `<button class="tile en" data-side="en" data-v="${esc(w)}">${esc(w)}</button><button class="tile" data-side="pt" data-v="${esc(right[i])}">${esc(right[i])}</button>`).join("");
      $stage.appendChild(box);
      let sel = null, errors = 0, left_ = sc.p.length;
      const match = (en, pt) => sc.p.some(p => p[0] === en && p[1] === pt);
      setFooter({ label: "Continuar", disabled: true });
      box.querySelectorAll(".tile").forEach(t => t.onclick = () => {
        if (t.classList.contains("done")) return;
        if (t.dataset.side === "en") say(t.dataset.v);
        if (!sel || sel.dataset.side === t.dataset.side) {
          box.querySelectorAll(".tile.sel").forEach(x => x.classList.remove("sel"));
          sel = t; t.classList.add("sel");
          return;
        }
        const [en, pt] = sel.dataset.side === "en" ? [sel.dataset.v, t.dataset.v] : [t.dataset.v, sel.dataset.v];
        const pair = [sel, t];
        sel = null;
        pair.forEach(x => x.classList.remove("sel"));
        if (match(en, pt)) {
          pair.forEach(x => { x.classList.add("done"); x.disabled = true; });
          if (--left_ === 0) {
            scored++;
            if (!errors) firstOk++;
            phase = "result";
            setFooter({ ok: true, fb: errors ? "Isso! 👍" : "Perfeito! 🎉" });
            $btn.focus();
          }
        } else {
          errors++;
          pair.forEach(x => { x.classList.remove("bad"); void x.offsetWidth; x.classList.add("bad"); });
        }
      });
    }

    function check() {
      if (!checker) return;
      const sc = screens[queue[qi]];
      const { ok, answer, near } = checker();
      checker = null;
      phase = "result";
      const first = !retried.includes(queue[qi]) || queue.indexOf(queue[qi]) === qi;
      if (first) { scored++; if (ok) firstOk++; }
      if (first && isWrite) { stats.writeTotal++; if (ok) stats.writeOk++; } // escrita conta a 1ª tentativa
      if (ok) {
        if (sc.en && sc.t !== "listen") sayLine(sc);
        else if (sc.w) say(sc.w);
        setFooter({ ok: true, fb: near ? "Quase perfeito! 👍" : ["Excelente! 🎉", "Muito bem! ✨", "Perfeito! 💪", "Mandou bem! 🙌"][Math.floor(Math.random() * 4)] });
      } else {
        // errou: a tela volta no fim da lição (uma vez só)
        if (!retried.includes(queue[qi])) { retried.push(queue[qi]); queue.push(queue[qi]); }
        setFooter({ bad: true, label: "Continuar", fb: `<small>Resposta certa:</small> ${esc(answer)}` });
        if (sc.en) sayLine(sc);
      }
      $btn.focus();
    }

    function next() {
      if (qi >= 0) snapshot();
      stopAudio();
      qi++;
      $bar.style.width = (qi / queue.length) * 100 + "%";
      if (qi >= queue.length) return finish();
      show(screens[queue[qi]]);
    }

    function finish() {
      cleanup();
      clearSnapshot();
      const acc = scored ? Math.round((firstOk / scored) * 100) : 100;
      const repeat = !!progress.lessons[key];
      const speakRate = stats.speakTotal ? stats.speakOk / stats.speakTotal : 0;
      const writeRate = stats.writeTotal ? stats.writeOk / stats.writeTotal : 0;
      const earned = {
        listen: eligible.listen && mode.listen,
        speak: eligible.speak && mode.speak && stats.speakTotal > 0 && speakRate >= PASS_RATE,
        write: eligible.write && mode.write && stats.writeTotal > 0 && writeRate >= PASS_RATE,
      };
      const fresh = registerStudy(key, acc, 0, earned);
      for (const w of lesson.words) progress.words.taught[w] ||= today();
      saveProgress(progress);
      const faces = facesOf(key);
      const zl = lessonsFor(unit.id, 0);
      const nextZero = zl[found.index + 1];
      const firstStory = state.unitData[unit.id].lessons[0];
      const pct = (r) => Math.round(r * 100) + "%";
      const why = {
        read: "Lição concluída",
        listen: earned.listen ? "Áudio ligado do início ao fim" : "Faça com 🎧 Escuta ligada do início ao fim",
        speak: eligible.speak && mode.speak ? `${stats.speakOk}/${stats.speakTotal} frases faladas (${pct(speakRate)}; precisa de 80%)` : "Ligue 🎤 Fala antes de começar",
        write: eligible.write && mode.write ? `${stats.writeOk}/${stats.writeTotal} frases escritas (${pct(writeRate)}; precisa de 80%)` : "Ligue ✍️ Escrita antes de começar",
      };
      $app.innerHTML = `<div class="end">
        <div class="end-ring">${ringWithIcons(faces)}<span>${acc === 100 ? "🏆" : "🎉"}</span></div>
        <h1>Lição concluída!</h1>
        <p style="color:var(--muted);margin:0">Vocabulário ${found.index + 1} de ${zl.length} · ${esc(unit.title)}</p>
        <div class="cards">
          <div class="card"><div class="k">XP</div><div class="v">⚡ ${xpFor(0, repeat) + 5 * fresh.length}</div></div>
          <div class="card green"><div class="k">PRECISÃO</div><div class="v">🎯 ${acc}%</div></div>
        </div>
        ${wordsList.length ? `<div class="new-words learned"><div class="nw-title">✨ Palavras que você treinou</div>${wordListHTML(wordsList)}</div>` : ""}
        <ul class="face-list">
          ${FACES.map(f => `<li class="${faces[f.id] ? "got" : ""}"><span class="dot" style="background:${faces[f.id] ? f.color : "var(--ring-off)"}"></span>
            <b>${f.icon} ${f.name}</b><small>${fresh.includes(f.id) ? "<em>Nova! +5 XP</em> · " : ""}${esc(faces[f.id] && !earned[f.id] && f.id !== "read" ? "Já conquistada antes" : why[f.id])}</small></li>`).join("")}
        </ul>
        ${!nextZero && firstStory ? `<button class="btn ghost up" id="up">📖 Agora as histórias: nível 1</button>` : ""}
        </div>
        <div class="footer"><div class="footer-inner">
          <button class="btn ghost" id="again">Repetir</button>
          <button class="btn" id="cont">${nextZero ? "Próxima lição" : "Continuar"}</button>
        </div></div>`;
      const toStories = () => { progress.unitLevel[unit.id] = 1; saveProgress(progress); go(`#/lesson/${firstStory.id}/1`); };
      document.getElementById("again").onclick = () => renderDrill(lesson.id);
      document.getElementById("up")?.addEventListener("click", toStories);
      document.getElementById("cont").onclick = () => (nextZero ? go(`#/lesson/${nextZero.id}/0`) : go(home));
      document.getElementById("cont").focus();
      keyHandler = null;
    }

    function start(s) {
      if (s) {
        ({ queue, qi, firstOk, scored, retried } = s);
        Object.assign(stats, s.stats);
        for (const m of ["listen", "speak", "write"]) eligible[m] = !!s.eligible?.[m] && mode[m];
      }
      next();
    }

    $btn.onclick = () => {
      if (blocker) return blocker.primary();
      if (phase === "start") return start(null);
      if (phase === "answer") return check();
      next();
    };
    $skip.onclick = () => blocker?.skip();
    if (saved) {
      setFooter({ label: "Continuar de onde parei", skip: true, skipLabel: "Recomeçar" });
      blocker = {
        kind: "start",
        primary: () => { blocker = null; start(saved); },
        skip: () => { blocker = null; clearSnapshot(); start(null); },
        cancel: () => {},
      };
    }
    $btn.focus();
    keyHandler = (e) => {
      if (e.target.matches?.("input, textarea")) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!$btn.disabled) $btn.click(); }
        return;
      }
      if (e.target.closest("button") && e.key === " ") return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!$btn.disabled) $btn.click(); }
      const n = parseInt(e.key, 10);
      if (phase === "answer" && n >= 1 && n <= 9) $stage._choose?.(n - 1);
    };
  }


  /* ---------- Rotas ---------- */
  let keyHandler = null;
  document.addEventListener("keydown", (e) => keyHandler?.(e));
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    keyHandler = null; hideTip(); cleanup?.(); cleanup = null; stopAudio(); scrollTo(0, 0);
    const [, page, arg, lv] = location.hash.split("/");
    const n = parseInt(lv, 10);
    const level = Number.isNaN(n) ? 1 : Math.min(5, Math.max(0, n));
    if (page === "lesson") (level === 0 ? renderDrill(arg) : renderLesson(arg, level));
    else if (page === "guide") renderGuide(arg);
    else if (page === "pro") renderHome("pro");
    else renderHome();
  }
  let ready = false; // só troca de tela depois que as lições carregaram
  addEventListener("hashchange", () => { if (ready) route(); });

  /* ---------- App instalável / offline ---------- */
  let installPrompt = null;
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    if (state.units.length && (!location.hash || location.hash === "#/" || location.hash === "#/pro")) renderHome(location.hash === "#/pro" ? "pro" : "stories");
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});

  if ("speechSynthesis" in window) speechSynthesis.getVoices();
  loadAll().then(() => { ready = true; route(); }).catch((err) => {
    $app.innerHTML = `<p style="padding:40px 0">Não consegui carregar as lições 😕<br><small style="color:var(--muted)">${esc(String(err))}</small><br><br>
      Se abriu o arquivo direto (file://), use o <b>ABRIR_LOCAL.bat</b>.</p>`;
  });
})();
