"""Conta em quantas histórias (lição + nível) cada palavra do glossário aparece.

Gera data/wordfreq.json ({palavra_base: nº de histórias}). O app usa isso para escolher as
"palavras novas" dos níveis 3 a 5: palavras muito frequentes ficam de fora, as mais raras primeiro.
Rode depois de criar ou mudar lições (o gerar_audio.py já chama este script no final).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORD_RE = re.compile(r"[A-Za-zÀ-ÿ]+(?:'[A-Za-zÀ-ÿ]+)?")
# mesmas regras do app (lemmaOf em app.js)
RULES = [
    (r"'s$", ""), (r"s'$", "s"), (r"ies$", "y"), (r"ied$", "y"), (r"es$", ""), (r"s$", ""),
    (r"([^aeiou])\1ed$", r"\1"), (r"ed$", "e"), (r"ed$", ""), (r"d$", ""),
    (r"([^aeiou])\1ing$", r"\1"), (r"ing$", "e"), (r"ing$", ""), (r"ily$", "y"), (r"ly$", ""),
    (r"er$", ""), (r"est$", ""),
]


def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def main():
    gloss = load("data/glossary.json")

    def lemma(word):
        w = word.lower().replace("’", "'")
        if w in gloss:
            return w
        for pat, rep in RULES:
            if re.search(pat, w):
                base = re.sub(pat, rep, w)
                if len(base) > 1 and base in gloss:
                    return base
        return None

    def lemmas(steps):
        return {l for s in steps if isinstance(s, list) for m in WORD_RE.findall(s[1]) if (l := lemma(m))}

    df = {}
    index = load("data/units.json")
    for unit in index["units"] + index.get("pro", []):
        docs = [lemmas(l["steps"]) for l in load(unit["file"])["lessons"]]
        for level in range(2, 6):
            path = ROOT / "data" / "levels" / f"u{unit['id']}-{level}.json"
            if path.exists():
                docs += [lemmas(st) for st in json.loads(path.read_text(encoding="utf-8"))["lessons"].values()]
        for d in docs:
            for l in d:
                df[l] = df.get(l, 0) + 1
    out = ROOT / "data" / "wordfreq.json"
    out.write_text(json.dumps(dict(sorted(df.items())), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wordfreq.json: {len(df)} palavras")


if __name__ == "__main__":
    main()
