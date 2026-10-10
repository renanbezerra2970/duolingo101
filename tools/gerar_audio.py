"""Gera os áudios (MP3) de todas as frases e palavras das lições.

Usa o edge-tts (vozes neurais gratuitas da Microsoft, as mesmas do "Ler em voz alta" do Edge).
Só gera o que ainda não existe, então pode rodar quantas vezes quiser.

Uso:  python tools/gerar_audio.py
"""
import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("Falta o edge-tts. Rode:  python -m pip install --user edge-tts")

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
WORD_VOICE = "en-US-JennyNeural"
DEFAULT_VOICE = "en-US-JennyNeural"
WORD_RE = re.compile(r"[A-Za-zÀ-ÿ]+(?:'[A-Za-zÀ-ÿ]+)?")
CONCURRENCY = 6


def file_for(key: str) -> str:
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12] + ".mp3"


def collect():
    """Retorna {chave: (voz, texto, velocidade)}. Chave de frase = 'voz|texto'; de palavra = 'word|palavra'."""
    items = {}

    def add_sentence(voice, text):
        items[f"{voice}|{text}"] = (voice, text, "-5%")
        for w in WORD_RE.findall(text):
            w = w.lower()
            items[f"word|{w}"] = (WORD_VOICE, w, "-15%")

    units = json.loads((ROOT / "data" / "units.json").read_text(encoding="utf-8"))["units"]
    for unit in units:
        for en, _pt in unit.get("phrases", []):
            add_sentence(DEFAULT_VOICE, en)
        data = json.loads((ROOT / unit["file"]).read_text(encoding="utf-8"))
        cast = data["cast"]
        for lesson in data["lessons"]:
            add_sentence(DEFAULT_VOICE, lesson["title"])
            for step in lesson["steps"]:
                if isinstance(step, list):
                    who, en = step[0], step[1]
                    add_sentence(cast.get(who, {}).get("voice", DEFAULT_VOICE), en)
                elif step.get("lang") == "en":
                    for opt in step["o"]:
                        add_sentence(DEFAULT_VOICE, opt)
    return items


async def synth(sem, voice, text, rate, out: Path):
    async with sem:
        for attempt in range(3):
            try:
                await edge_tts.Communicate(text, voice, rate=rate).save(str(out))
                return True
            except Exception as e:  # rede instável: tenta de novo
                if attempt == 2:
                    print(f"  ERRO em '{text}': {e}")
                    out.unlink(missing_ok=True)
                    return False
                await asyncio.sleep(1.5)


async def main():
    AUDIO.mkdir(exist_ok=True)
    items = collect()
    manifest = {key: file_for(key) for key in items}
    todo = [(k, v) for k, v in items.items() if not (AUDIO / manifest[k]).exists()]
    print(f"{len(items)} áudios no total, {len(todo)} novos para gerar...")

    sem = asyncio.Semaphore(CONCURRENCY)
    done = 0

    async def run(key, spec):
        nonlocal done
        ok = await synth(sem, *spec, AUDIO / manifest[key])
        done += 1
        if done % 25 == 0 or done == len(todo):
            print(f"  {done}/{len(todo)}")
        return key, ok

    results = await asyncio.gather(*(run(k, v) for k, v in todo))
    for key, ok in results:
        if not ok:
            manifest.pop(key, None)

    # remove MP3s que nenhuma lição usa mais
    used = set(manifest.values())
    removed = 0
    for f in AUDIO.glob("*.mp3"):
        if f.name not in used:
            f.unlink()
            removed += 1

    (AUDIO / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=0), encoding="utf-8")
    print(f"Pronto! manifest.json com {len(manifest)} áudios ({removed} antigos removidos).")


if __name__ == "__main__":
    asyncio.run(main())
