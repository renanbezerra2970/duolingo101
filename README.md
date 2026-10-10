# Prolingo — Histórias em inglês

App de histórias em inglês para estudar com diálogos:
um diálogo longo, com uma pergunta a cada 4–5 falas, todas as frases e palavras com áudio em inglês.

## Como funciona (sem banco de dados, sem servidor)

| Peça | Onde fica | Papel |
|---|---|---|
| Lições | `data/unitN.json` (nesta pasta, no seu PC) | O "banco de dados" é a própria pasta — arquivos JSON versionados no Git |
| Áudios | `audio/*.mp3` + `audio/manifest.json` | Gerados uma vez com vozes neurais grátis (edge-tts) |
| Progresso (XP, sequência, lições feitas) | `localStorage` do navegador | Fica salvo em cada aparelho |
| Site | Vercel (projeto `prolingo`, https://prolingo101.vercel.app) | Publica sozinho a cada `git push` |

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

## Níveis de dificuldade (1 a 5)

Cada história existe em 5 versões: mesmo enredo, língua cada vez mais difícil. Descrições e velocidade do áudio ficam em `data/levels.json`.

| Nível | Onde fica | Perguntas |
|---|---|---|
| 1 Básico (A1) | `data/unitN.json` | em português |
| 2 Elementar (A2) | `data/levels/uN-2.json` | em português (algumas opções em inglês com `"lang": "en"`) |
| 3 Intermediário (B1) | `data/levels/uN-3.json` | em inglês, com áudio |
| 4 Avançado (B2–C1) | `data/levels/uN-4.json` | em inglês: expressões idiomáticas |
| 5 Nativo (C2) | `data/levels/uN-5.json` | em inglês: gírias, ironia, subentendidos |

Formato de `data/levels/uN-L.json`: `{ "unit": N, "level": L, "cast": { ...personagens extras... }, "lessons": { "u1l1": [ ...falas e perguntas... ] } }`.
O glossário aceita só a forma base da palavra: o app acha sozinho plurais, passado, "-ing" e possessivos.

## Aba Pro (inglês profissional)

Trilhas profissionais no mesmo formato (5 histórias × 5 níveis), listadas em `data/units.json` na chave `"pro"`:

| Trilha | Arquivo nível 1 | Níveis 2–5 |
|---|---|---|
| Enfermagem | `data/pro/enf.json` | `data/levels/uenf-2..5.json` |
| Serviço Social | `data/pro/soc.json` | `data/levels/usoc-2..5.json` |
| Medicina | `data/pro/med.json` | `data/levels/umed-2..5.json` |
| Psicologia | `data/pro/psi.json` | `data/levels/upsi-2..5.json` |

Nova área: crie `data/pro/<id>.json` + `data/levels/u<id>-2..5.json` e registre em `"pro"` com as frases-chave do guia.

## Círculo das 4 faces e modos de estudo

Cada lição (em cada nível) tem um círculo em 4 partes: 📖 Leitura · 🎧 Escuta · 🎤 Fala · ✍️ Escrita.

- **Leitura**: concluir a lição.
- **Escuta**: concluir com 🎧 Escuta (áudio automático) ligada do início ao fim.
- **Fala** (`🎤`): cada fala do diálogo é repetida em voz alta; o navegador transcreve (Web Speech API), o usuário vê o texto e confirma. Conta com ≥ 80% das falas aceitas.
- **Escrita** (`✍️`): a cada 2–3 falas, um exercício: lacuna de 1 palavra → 2 palavras → frase inteira (copiar, ditado ou tradução), conforme o nível (`WRITE_PLAN` em `app.js`). Conta com ≥ 80% de acertos.
- Os modos só contam no círculo se estiverem ligados desde o início. Fala e Escrita têm botão **Pular**.
- A tolerância a erros fica em `match.js` (números, contrações, grafia britânica/americana, erros de digitação).
