/* Tour guiado (spotlight): escurece a tela, destaca um elemento por vez e explica com um cartão. */
(function (root) {
  "use strict";

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /**
   * steps: [{ target?: seletor CSS ou função que devolve o elemento, title, text, icon? }]
   * Passos cujo alvo não existe na tela são pulados. Sem alvo, o cartão aparece no centro.
   */
  function spotlight(steps, { onDone, doneLabel = "Entendi!" } = {}) {
    const list = steps.filter((s) => !s.target || find(s));
    if (!list.length) return onDone?.();
    let i = 0;

    const wrap = document.createElement("div");
    wrap.className = "spot-wrap";
    wrap.innerHTML = `<div class="spot-hole"></div>
      <div class="spot-card" role="dialog" aria-modal="true" aria-live="polite">
        <div class="spot-top"><span class="spot-count"></span><button class="spot-skip" type="button">Pular tour</button></div>
        <div class="spot-icon"></div>
        <h3 class="spot-title"></h3>
        <p class="spot-text"></p>
        <div class="spot-actions">
          <div class="spot-dots"></div>
          <button class="spot-back" type="button">Voltar</button>
          <button class="spot-next" type="button">Próximo</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const $hole = wrap.querySelector(".spot-hole");
    const $card = wrap.querySelector(".spot-card");
    const $next = wrap.querySelector(".spot-next");
    const $back = wrap.querySelector(".spot-back");

    function find(s) {
      const el = typeof s.target === "function" ? s.target() : document.querySelector(s.target);
      return el && el.getClientRects().length ? el : null;
    }

    function place() {
      const s = list[i];
      const el = s.target ? find(s) : null;
      const vw = innerWidth, vh = innerHeight, pad = s.pad ?? 8, gap = 14;
      if (el) {
        const r = el.getBoundingClientRect();
        Object.assign($hole.style, {
          display: "block", left: r.left - pad + "px", top: r.top - pad + "px",
          width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px",
          borderRadius: (s.round ? 999 : 16) + "px",
        });
        wrap.classList.remove("centered");
        const cw = Math.min(380, vw - 32);
        $card.style.width = cw + "px";
        const ch = $card.offsetHeight;
        let top = r.bottom + pad + gap;
        if (top + ch > vh - 12) top = r.top - pad - gap - ch; // não cabe embaixo: vai para cima
        if (top < 12) top = Math.max(12, vh - ch - 16); // nem em cima: encosta no rodapé
        const left = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), vw - cw - 16);
        Object.assign($card.style, { left: left + "px", top: top + "px" });
      } else {
        $hole.style.display = "none";
        wrap.classList.add("centered");
        Object.assign($card.style, { left: "", top: "", width: "" });
      }
    }

    function show() {
      const s = list[i];
      const el = s.target ? find(s) : null;
      if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
      wrap.querySelector(".spot-count").textContent = `${i + 1} de ${list.length}`;
      wrap.querySelector(".spot-icon").textContent = s.icon || "";
      wrap.querySelector(".spot-icon").hidden = !s.icon;
      wrap.querySelector(".spot-title").textContent = s.title;
      wrap.querySelector(".spot-text").innerHTML = s.text; // texto do próprio app (pode ter <b>)
      wrap.querySelector(".spot-dots").innerHTML = list.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
      $back.hidden = i === 0;
      $next.textContent = i === list.length - 1 ? doneLabel : "Próximo";
      $card.classList.remove("in");
      void $card.offsetWidth;
      $card.classList.add("in");
      requestAnimationFrame(place);
      setTimeout(place, 60);
      $next.focus({ preventScroll: true });
    }

    function end() {
      wrap.remove();
      removeEventListener("resize", place);
      removeEventListener("keydown", onKey, true);
      onDone?.();
    }
    const go = (d) => { i += d; if (i >= list.length) return end(); if (i < 0) i = 0; show(); };
    function onKey(e) {
      if (["Enter", "ArrowRight", " "].includes(e.key)) go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") end();
      else return;
      e.preventDefault();
      e.stopPropagation();
    }

    $next.onclick = () => go(1);
    $back.onclick = () => go(-1);
    wrap.querySelector(".spot-skip").onclick = end;
    // tocar fora do cartão avança (como nos tours de apps); o elemento destacado não recebe o toque
    wrap.addEventListener("click", (e) => { if (!$card.contains(e.target)) go(1); });
    addEventListener("resize", place);
    addEventListener("keydown", onKey, true);
    show();
  }

  root.Spotlight = { spotlight, esc };
})(window);
