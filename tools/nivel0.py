"""Gera o nível 0 (vocabulário) de cada unidade e área Pro: data/level0/u<id>.json.

O nível 0 não é história: são 10 lições de 20 telas no ciclo de repetição (apresentar a palavra,
reconhecer, ouvir, combinar pares, montar frases, completar, falar e escrever). O vocabulário e as
frases saem do próprio nível 1 da unidade (e das frases do guia), então o nível 0 prepara exatamente
o que o usuário vai encontrar nas histórias. As traduções das palavras vêm do glossário.

Rode depois de criar ou mudar uma unidade (o gerar_audio.py chama este script antes de gerar os áudios).
"""
import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "level0"
WORD_RE = re.compile(r"[A-Za-zÀ-ÿ]+(?:'[A-Za-zÀ-ÿ]+)?")
DEFAULT_VOICE = "en-US-JennyNeural"
RULES = [  # mesmas regras do app (lemmaOf em app.js)
    (r"'s$", ""), (r"s'$", "s"), (r"ies$", "y"), (r"ied$", "y"), (r"es$", ""), (r"s$", ""),
    (r"([^aeiou])\1ed$", r"\1"), (r"ed$", "e"), (r"ed$", ""), (r"d$", ""),
    (r"([^aeiou])\1ing$", r"\1"), (r"ing$", "e"), (r"ing$", ""), (r"ily$", "y"), (r"ly$", ""),
    (r"er$", ""), (r"est$", ""),
]
# palavras que não fazem sentido ensinar sozinhas (artigos, preposições curtas, interjeições)
SKIP = set("a an the to of oh ok okay ha hmm uh um wow ah hey yeah".split())
LESSONS, NEW_PER_LESSON = 10, 4
EMOJIS = ["🔤", "🧩", "🎯", "🧠", "💬", "🔁", "⭐", "🗝️", "🚀", "🏆"]
MAX_SENT_WORDS = 7


def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


GLOSS = load("data/glossary.json")


def lemma(word):
    w = word.lower().replace("’", "'")
    if w in GLOSS:
        return w
    for pat, rep in RULES:
        if re.search(pat, w):
            base = re.sub(pat, rep, w)
            if len(base) > 1 and base in GLOSS:
                return base
    return None


def short(g):
    return re.split(r"\s\(|;|,|/", g)[0].strip()


def teachable(l, names):
    g = GLOSS.get(l, "")
    return l and l not in SKIP and l not in names and "francês" not in g and "'" not in l and not re.match(r"^[A-ZÀ-Ý]", g) and len(l) > 1


def tokens(en):
    return WORD_RE.findall(en)


def unit_material(unit):
    """Falas curtas do nível 1 + frases do guia, com voz e tradução."""
    data = load(unit["file"])
    cast = data["cast"]
    names = {p for c in cast.values() for p in re.split(r"[^a-z]+", str(c["name"]).lower()) if p}
    sents, seen = [], set()
    for en, pt in unit.get("phrases", []):
        sents.append({"en": en, "pt": pt, "v": DEFAULT_VOICE, "guide": True})
        seen.add(en)
    for lesson in data["lessons"]:
        for s in lesson["steps"]:
            if isinstance(s, list) and s[1] not in seen:
                seen.add(s[1])
                n = len(tokens(s[1]))
                noisy = {t.lower() for t in tokens(s[1])} & {"hmm", "uh", "um", "ha", "oops"}
                if 2 <= n <= MAX_SENT_WORDS and not re.search(r"\d", s[1]) and not noisy:
                    sents.append({"en": s[1], "pt": s[2], "v": cast.get(s[0], {}).get("voice", DEFAULT_VOICE), "guide": False})
    freq = {}
    for lesson in data["lessons"]:
        for s in lesson["steps"]:
            if isinstance(s, list):
                for t in tokens(s[1]):
                    l = lemma(t)
                    if l and teachable(l, names):
                        freq[l] = freq.get(l, 0) + 1
    for en, _ in unit.get("phrases", []):
        for t in tokens(en):
            l = lemma(t)
            if l and teachable(l, names):
                freq[l] = freq.get(l, 0) + 3  # palavras do guia sobem na fila
    return sents, freq, names


def build(unit, taught_before, pro, rng):
    sents, freq, names = unit_material(unit)
    need = (LESSONS - 1) * NEW_PER_LESSON
    ranked = sorted(freq, key=lambda l: (l in taught_before, -freq[l], l))
    words = ranked[:need]
    # ordem de ensino: as mais frequentes primeiro (são as que destravam mais frases)
    words.sort(key=lambda l: (-freq[l], l))
    pool_gloss = {l: short(GLOSS[l]) for l in freq}

    def lem_set(en):
        return {lemma(t) for t in tokens(en)} - {None}

    def opts(right, pool, key=lambda x: x, k=3):
        cands = [p for p in pool if key(p).lower() != key(right).lower()]
        rng.shuffle(cands)
        out, seen = [right], {key(right).lower()}
        for c in cands:
            if key(c).lower() not in seen:
                out.append(c)
                seen.add(key(c).lower())
            if len(out) == k:
                break
        rng.shuffle(out)
        return out

    all_words = list(freq)
    used_sents = {}

    def pick_sents(known, focus, n):
        """Frases que usam o que já foi ensinado, de preferência com as palavras da lição."""
        def score(s):
            ls = {l for l in lem_set(s["en"]) if teachable(l, names)}
            unknown = len(ls - known)
            hit = len(ls & focus)
            return (unknown, -hit, used_sents.get(s["en"], 0), -s["guide"], len(tokens(s["en"])))
        chosen = sorted(sents, key=score)[:n]
        for s in chosen:
            used_sents[s["en"]] = used_sents.get(s["en"], 0) + 1
        return chosen

    def sentence_screens(s, kind):
        base = {"en": s["en"], "pt": s["pt"], "v": s["v"]}
        others = [x for x in sents if x["en"] != s["en"]]
        if kind == "bank":
            extra = [w for w in all_words if w not in lem_set(s["en"])]
            rng.shuffle(extra)
            return {"t": "bank", **base, "x": extra[:3]}
        if kind == "listen":
            o = opts(s["en"], [x["en"] for x in others])
            return {"t": "listen", **base, "o": o}
        if kind == "type":
            extra = [w for w in all_words if w not in lem_set(s["en"])]
            rng.shuffle(extra)
            return {"t": "type", **base, "x": extra[:3]}
        if kind == "speak":
            return {"t": "speak", **base, "o": opts(s["pt"], [x["pt"] for x in others])}
        if kind == "fill":
            toks = [m for m in WORD_RE.finditer(s["en"])]
            cand = [m for m in toks if (lemma(m.group()) in words) and teachable(lemma(m.group()), names)] or \
                   [m for m in toks if len(m.group()) > 2] or toks
            m = rng.choice(cand)
            gap = s["en"][:m.start()] + "___" + s["en"][m.end():]
            o = opts(m.group(), [w for w in all_words if w != lemma(m.group())])
            return {"t": "fill", **base, "gap": gap, "w": m.group(), "o": o}
        raise ValueError(kind)

    def word_screen(t, w, known):
        pool = [x for x in known if x != w] or [x for x in all_words if x != w]
        if len(pool) < 4:
            pool = pool + [x for x in all_words if x != w and x not in pool]
        if t == "intro":
            return {"t": "intro", "w": w, "pt": pool_gloss[w]}
        if t == "meaning":
            return {"t": "meaning", "w": w, "pt": pool_gloss[w], "o": opts(pool_gloss[w], [pool_gloss[x] for x in pool])}
        if t in ("pick", "hear"):
            return {"t": t, "w": w, "pt": pool_gloss[w], "o": opts(w, pool)}
        raise ValueError(t)

    def pairs(ws, known):
        ws = list(dict.fromkeys(ws))
        extra = [x for x in known if x not in ws]
        rng.shuffle(extra)
        ws = (ws + extra)[:5]
        # sem traduções repetidas na mesma rodada
        out, seen = [], set()
        for w in ws:
            g = pool_gloss[w].lower()
            if g not in seen:
                seen.add(g)
                out.append([w, pool_gloss[w]])
        return {"t": "pairs", "p": out}

    lessons, known = [], set()
    for i in range(LESSONS):
        lid = f"{unit['id']}z{i + 1}" if pro else f"u{unit['id']}z{i + 1}"
        if i < LESSONS - 1:
            new = words[i * NEW_PER_LESSON:(i + 1) * NEW_PER_LESSON]
            if len(new) < NEW_PER_LESSON:  # unidade com pouco vocabulário: repete as mais úteis
                new += [w for w in words if w not in new][:NEW_PER_LESSON - len(new)]
            n1, n2, n3, n4 = new
            before = set(known)
            known |= set(new)
            rev = [w for w in before] or new
            rng.shuffle(rev)
            r = (rev * 3)[:3]
            S = pick_sents(known, set(new), 4)
            S = (S * 4)[:4]
            screens = [
                word_screen("intro", n1, known), word_screen("meaning", n1, known),
                word_screen("intro", n2, known), word_screen("hear", n2, known),
                pairs([n1, n2], before or known),
                word_screen("intro", n3, known), word_screen("pick", n3, known),
                word_screen("intro", n4, known), word_screen("meaning", n4, known),
                word_screen("hear", n3, known),
                pairs([n3, n4, n1, n2], known),
                sentence_screens(S[0], "bank"), sentence_screens(S[1], "fill"),
                sentence_screens(S[0], "speak"), word_screen("pick", n4, known),
                sentence_screens(S[1], "type"), sentence_screens(S[2], "listen"),
                word_screen("meaning", r[0], known), sentence_screens(S[2], "speak"),
                sentence_screens(S[3], "bank"),
            ]
            title = " · ".join(new)
            title_pt = " · ".join(pool_gloss[w] for w in new)
        else:  # revisão geral
            new = []
            ws = list(known)
            rng.shuffle(ws)
            G = [s for s in sents if s["guide"]] + pick_sents(known, set(), 5)
            G = list({s["en"]: s for s in G}.values())
            G = (G * 5)[:5]
            w = (ws * 3)
            screens = [
                pairs(w[0:5], known), word_screen("meaning", w[5], known), word_screen("hear", w[6], known),
                word_screen("pick", w[7], known), sentence_screens(G[0], "bank"), sentence_screens(G[1], "fill"),
                sentence_screens(G[0], "speak"), pairs(w[8:13], known), sentence_screens(G[1], "type"),
                sentence_screens(G[2], "listen"), word_screen("meaning", w[13], known), word_screen("pick", w[14], known),
                sentence_screens(G[3], "bank"), sentence_screens(G[3], "speak"), word_screen("hear", w[15], known),
                sentence_screens(G[4], "fill"), sentence_screens(G[2], "type"), pairs(w[16:21], known),
                sentence_screens(G[4], "bank"), sentence_screens(G[4], "speak"),
            ]
            title, title_pt = "Review", "Revisão geral"
        assert len(screens) == 20
        lessons.append({"id": lid, "title": title, "titlePt": title_pt, "emoji": EMOJIS[i], "words": new, "screens": screens})
    return {"unit": unit["id"], "lessons": lessons}, set(words)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = load("data/units.json")
    taught = set()
    story_words = set()
    for unit in index["units"]:
        data, ws = build(unit, taught, False, random.Random(f"u{unit['id']}"))
        taught |= ws
        story_words |= ws
        (OUT / f"u{unit['id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    for unit in index.get("pro", []):
        # nas áreas Pro, o foco é o vocabulário da profissão (palavras das unidades vão para o fim da fila)
        data, _ = build(unit, story_words, True, random.Random(f"p{unit['id']}"))
        (OUT / f"u{unit['id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"nível 0: {len(index['units']) + len(index.get('pro', []))} unidades geradas em data/level0/")


if __name__ == "__main__":
    main()
