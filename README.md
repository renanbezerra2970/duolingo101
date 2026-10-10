# Duolingo 101 — Histórias

App no estilo das *Histórias* do Duolingo para complementar o curso de inglês:
um diálogo longo, com uma pergunta a cada 4–5 falas, todas as frases e palavras com áudio em inglês.

## Como funciona (sem banco de dados, sem servidor)

| Peça | Onde fica | Papel |
|---|---|---|
| Lições | `data/unitN.json` (nesta pasta, no seu PC) | O "banco de dados" é a própria pasta — arquivos JSON versionados no Git |
| Áudios | `audio/*.mp3` + `audio/manifest.json` | Gerados uma vez com vozes neurais grátis (edge-tts) |
| Progresso (XP, sequência, lições feitas) | `localStorage` do navegador | Fica salvo em cada aparelho |
| Site | Vercel (projeto `duolingo101`) | Publica sozinho a cada `git push` |

## Atalhos

- **ABRIR_LOCAL.bat**: abre o app no seu PC (http://localhost:8101) para testar antes de publicar.
- **GERAR_AUDIO.bat**: gera os MP3 das frases/palavras novas (só gera o que falta).
- **PUBLICAR.bat**: gera os áudios, faz commit e push → a Vercel atualiza o site em ~30 s.

## Formato de uma lição

```json
{
  "id": "u5l1", "title": "At the Hotel", "titlePt": "No hotel", "emoji": "🏨",
  "steps": [
    ["nar", "Anna is at a hotel.", "A Anna está em um hotel."],
    ["anna", "Hello! My name is Anna.", "Olá! Meu nome é Anna."],
    { "q": "Onde a Anna está?", "o": ["Em um hotel.", "Em um café."], "a": 0 },
    { "q": "O que ela diz?", "lang": "en", "o": ["Hello!", "Goodbye!"], "a": 0 }
  ]
}
```

- Fala: `[personagem, inglês, português]`. O personagem (voz + emoji) é definido em `cast`, no topo do arquivo da unidade. `nar` é o narrador.
- Pergunta: `q` = enunciado, `o` = opções, `a` = índice da certa (o app embaralha). `"lang": "en"` faz as opções terem áudio.
- Nova unidade: crie `data/unit5.json`, registre em `data/units.json` (com as frases do guia) e adicione palavras novas em `data/glossary.json`.
