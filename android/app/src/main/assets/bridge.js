/* Roda antes do site, só dentro do APK.
 * O WebView não tem reconhecimento de voz: aqui ele vira uma ponte para o reconhecimento do Android.
 * Também guarda os áudios tocando, para pausar tudo quando o carro começa a andar. */
(function () {
  if (!window.ProlingoNative) return;

  const NativeAudio = window.Audio;
  const live = new Set();
  window.Audio = function (src) {
    const a = new NativeAudio(src);
    live.add(a);
    a.addEventListener("ended", () => live.delete(a));
    return a;
  };
  window.Audio.prototype = NativeAudio.prototype;
  window.__prolingoPause = () => {
    live.forEach(a => a.pause());
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  };

  // o WebView também não fala sozinho: a leitura em voz alta vem do Android
  let ttsId = 0;
  const speaking = new Map();
  window.__prolingoTTS = {
    done(id) { const u = speaking.get(id); speaking.delete(id); u?.onend?.(); },
  };
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; this.lang = "en-US"; this.rate = 1; }
  };
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      getVoices: () => [],
      speak(u) { speaking.set(++ttsId, u); ProlingoNative.say(ttsId, u.text, u.lang, u.rate); },
      cancel() { speaking.clear(); ProlingoNative.sayStop(); },
    },
  });

  if (!ProlingoNative.speechAvailable()) return;
  let cur = null;
  window.__prolingoSR = {
    result(list, isFinal) {
      const r = list.map(t => ({ transcript: t, confidence: 1 }));
      r.isFinal = isFinal;
      cur?.onresult?.({ results: [r], resultIndex: 0 });
    },
    error(code) { cur?.onerror?.({ error: code }); },
    end() { const c = cur; cur = null; c?.onend?.(); },
  };
  class NativeRecognition {
    start() {
      if (cur) throw new Error("already started");
      cur = this;
      ProlingoNative.startListening(this.lang || "en-US", this.maxAlternatives || 1);
    }
    stop() { ProlingoNative.stopListening(); }
    abort() { ProlingoNative.cancelListening(); }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = NativeRecognition;
})();
