/* Comparação tolerante de respostas (fala e escrita).
   Normaliza números, contrações, abreviações e grafias britânica/americana,
   e compara palavra a palavra aceitando pequenos erros de digitação ou de reconhecimento de voz. */
(function (root) {
  "use strict";

  const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  function numToWords(n) {
    n = Math.floor(n);
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
    if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + numToWords(n % 100) : "");
    if (n < 1e6) return numToWords(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + numToWords(n % 1000) : "");
    return String(n);
  }

  const CONTRACTIONS = [
    [/\bcan't\b/g, "can not"], [/\bcannot\b/g, "can not"], [/\bwon't\b/g, "will not"], [/\bshan't\b/g, "shall not"],
    [/\bain't\b/g, "is not"], [/n't\b/g, " not"], [/'re\b/g, " are"], [/'ll\b/g, " will"], [/'ve\b/g, " have"],
    [/'d\b/g, " would"], [/\bi'm\b/g, "i am"], [/\b(it|that|what|where|who|there|here|he|she|how)'s\b/g, "$1 is"],
    [/\bgonna\b/g, "going to"], [/\bwanna\b/g, "want to"], [/\bgotta\b/g, "got to"], [/\blemme\b/g, "let me"],
    [/\bgimme\b/g, "give me"], [/\by'all\b/g, "you all"], [/\bkinda\b/g, "kind of"], [/\boutta\b/g, "out of"],
    [/\bdunno\b/g, "do not know"], [/\bcuz\b|\b'cause\b/g, "because"],
  ];
  const ABBR = [
    [/\bmr\b\.?/g, "mister"], [/\bmrs\b\.?/g, "missus"], [/\bms\b\.?/g, "miss"], [/\bdr\b\.?/g, "doctor"],
    [/\bok\b/g, "okay"], [/\be-mail\b/g, "email"], [/&/g, " and "], [/%/g, " percent"], [/\balright\b/g, "all right"],
  ];
  // grafia britânica → americana (aplicada nos dois lados, então só precisa ser consistente)
  // contrações digitadas sem apóstrofo (muito comum no celular)
  const NOAPOS = { im: "i am", ive: "i have", ill: null, id: null, youre: "you are", youve: "you have", youll: "you will",
    theyre: "they are", theyve: "they have", weve: "we have", dont: "do not", doesnt: "does not", didnt: "did not",
    isnt: "is not", arent: "are not", wasnt: "was not", werent: "were not", cant: "can not", couldnt: "could not",
    wouldnt: "would not", shouldnt: "should not", havent: "have not", hasnt: "has not", wont: "will not",
    thats: "that is", whats: "what is", theres: "there is", heres: "here is", shes: "she is", hes: "he is",
    its: "it is", lets: "let us", hows: "how is", wheres: "where is", whos: "who is" };
  const SPELL = { mum: "mom", mummy: "mommy", grey: "gray", tyre: "tire", programme: "program", cheque: "check",
    pyjamas: "pajamas", aeroplane: "airplane", travelled: "traveled", travelling: "traveling", cancelled: "canceled" };

  function tokens(text) {
    let t = String(text).toLowerCase().replace(/[’‘`]/g, "'");
    t = t.replace(/(\d+):(\d+)/g, "$1 $2");
    t = t.replace(/(\d+)\.(\d+)/g, (_, a, b) => numToWords(+a) + " point " + b.split("").map(d => ONES[+d]).join(" "));
    t = t.replace(/(\d+),(\d{3})/g, "$1$2");
    t = t.replace(/\d+/g, (d) => " " + numToWords(+d) + " ");
    for (const [re, rep] of ABBR) t = t.replace(re, rep);
    for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
    t = t.replace(/'s\b/g, "s").replace(/'/g, "").replace(/[-–—/]/g, " ");
    t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
    t = t.replace(/[^a-z\s]/g, " ");
    return t.split(/\s+/).filter(Boolean).flatMap((w) => (NOAPOS[w] ? NOAPOS[w].split(" ") : [w])).map((w) => {
      w = SPELL[w] || w;
      w = w.replace(/our$/, "or").replace(/is(e|ed|es|ing|ation)$/, "iz$1").replace(/tre$/, "ter");
      return w;
    });
  }

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  // quantos erros de letra aceitamos numa palavra, pelo tamanho dela
  const typoAllowance = (len) => (len <= 3 ? 0 : len <= 7 ? 1 : 2);
  const wordsMatch = (a, b) => a === b || lev(a, b) <= typoAllowance(Math.max(a.length, b.length));

  // alinhamento palavra a palavra (maior subsequência comum com tolerância a erros de digitação)
  function align(exp, got) {
    const m = exp.length, n = got.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = wordsMatch(exp[i - 1], got[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    const hit = new Array(m).fill(false);
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (wordsMatch(exp[i - 1], got[j - 1]) && dp[i][j] === dp[i - 1][j - 1] + 1) { hit[i - 1] = true; i--; j--; }
      else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
      else j--;
    }
    return { matches: dp[m][n], hit };
  }

  /**
   * Compara a resposta com o esperado.
   * mode "recall": fração das palavras esperadas que apareceram (bom para fala: o reconhecedor às vezes acrescenta palavras).
   * mode "f1": equilíbrio entre faltar e sobrar palavras (bom para escrita).
   */
  function score(expected, given, mode = "f1") {
    const e = tokens(expected), g = tokens(given);
    if (!e.length) return { score: g.length ? 0 : 1, exact: !g.length, missing: [] };
    const { matches, hit } = align(e, g);
    const s = mode === "recall" ? matches / e.length : (2 * matches) / (e.length + g.length || 1);
    const exact = e.join(" ") === g.join(" ");
    return { score: s, exact, missing: e.filter((_, k) => !hit[k]) };
  }

  // uma palavra (lacuna): aceita erro de digitação pequeno
  function wordOk(expected, given) {
    const e = tokens(expected).join(""), g = tokens(given).join("");
    if (!g) return { ok: false, exact: false };
    if (e === g) return { ok: true, exact: true };
    return { ok: lev(e, g) <= typoAllowance(e.length), exact: false };
  }

  const api = { tokens, score, wordOk, lev, numToWords };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.D101Match = api;
})(typeof window !== "undefined" ? window : globalThis);
