# Tizen Retro TV — Design Spec

## Overview

Web app Tizen (.wgt) para sideload em Samsung Smart TV (2020, Tizen 5.5) que emula jogos SNES (prioridade principal — Super Mario World) e NES (secundário). Instalação via `tizen-app-installer-cli` a partir de um MacBook Air M3.

## Prioridades

1. **SNES funcional** — Super Mario World rodando a 60fps na TV
2. **NES funcional** — JSNES como sistema secundário
3. **UI navegável** — menus por D-pad, gamepad e controle remoto Samsung
4. **Save states** — salvar/carregar progresso
5. **ROM loading do USB** — escanear pen drive plugado na TV

## Arquitetura

```
┌─────────────────────────────────┐
│          UI Layer               │
│  Menu → ROM List → Game Screen  │
├─────────────────────────────────┤
│       Emulator Abstraction      │
│  emulator-snes.js  emulator-nes.js │
│  (interface comum: load/start/  │
│   pause/saveState/loadState)    │
├─────────────────────────────────┤
│        Engine Layer             │
│  xnes/snes9x (asm.js)   JSNES  │
└─────────────────────────────────┘
        ↕               ↕
   Canvas 2D         AudioContext
   (rendering)       (audio output)
```

### State Machine do App

```
MENU → ROM_LIST → LOADING → PLAYING ↔ PAUSED → MENU
```

- `MENU`: seleção NES/SNES
- `ROM_LIST`: lista de ROMs do USB filtrada por sistema
- `LOADING`: tela de loading enquanto ROM é carregada/descomprimida
- `PLAYING`: canvas fullscreen, game loop ativo
- `PAUSED`: overlay com opções (Resume, Reset, Save, Load, Back to Menu)

## Engine SNES

### Escolha: xnes (snes9x via asm.js)

- **Repo**: github.com/tjwei/xnes
- **Tech**: snes9x compilado com Emscripten, output asm.js
- **Licença**: Snes9x (non-commercial — ok para sideload pessoal)
- **Compatibilidade**: asm.js funciona em qualquer JS engine, garantido no Chromium 69 (Tizen 5.5)
- **Performance**: snes9x em asm.js roda SNES a full speed em hardware modesto

### Alternativas descartadas

| Opção | Motivo |
|---|---|
| bsnes-wasm | Não existe como pacote standalone |
| EmulatorJS WASM | Pode não rodar no Chromium 69, framework pesado |
| SnesJs (JS puro) | Muito lento — não roda full speed nem em desktop i5 |

### Fallback

Se xnes asm.js não rodar bem na TV: tentar EmulatorJS snes9x core (WASM). Chromium 69 tem suporte básico a WASM (MVP, sem SIMD/threads).

## Engine NES

- **JSNES** (github.com/bfirsh/jsnes) — JavaScript puro, MIT, leve
- Renderização Canvas 2D com `putImageData()`
- Audio via `AudioContext`

## Emulator Abstraction Layer

Ambos os wrappers (`emulator-snes.js`, `emulator-nes.js`) expõem a mesma interface:

```javascript
{
  init(canvas, audioContext)     // inicializa engine
  loadROM(arrayBuffer)           // carrega ROM em memória
  start()                        // inicia/retoma emulação
  pause()                        // pausa emulação
  reset()                        // reset do console
  setInput(player, button, pressed) // input do jogador
  saveState() → object           // retorna state serializável
  loadState(state)               // restaura state
  destroy()                      // cleanup de recursos
}
```

## Rendering

- **Canvas 2D** com `putImageData()` — mais compatível que WebGL no Tizen
- Resolução nativa SNES: 256x224, NES: 256x240
- Escala fullscreen mantendo aspect ratio
- Game loop via `requestAnimationFrame`
- Frame buffer pré-alocado para evitar GC pressure

## Audio

- `AudioContext` com `ScriptProcessorNode` (Chromium 69 não tem `AudioWorklet`)
- Buffer size: 2048 samples (ajustável se houver crackling)
- Sample rate: 44100 Hz

## UI / UX

### Design Visual

- Dark theme minimalista, fontes grandes (legíveis de longe na TV)
- Cores: fundo `#0a0a0a`, cards `#1a1a2e`, accent `#e94560`, texto `#eaeaea`
- Unidades relativas (vw/vh/rem) para funcionar em 1080p e 4K
- Zero dependências externas de CDN — tudo vendored/local

### Tela 1 — Menu Principal

- Dois cards grandes centralizados: **SNES** (primeiro) e **NES**
- Navegação por D-pad ou gamepad
- Card selecionado: borda accent `#e94560`

### Tela 2 — Lista de ROMs

- Lista vertical com nome dos arquivos
- Scroll por D-pad, highlight no item selecionado
- Filtrado pelo sistema: `.smc`/`.sfc` para SNES, `.nes` para NES
- Mensagem orientativa se nenhuma ROM encontrada
- Botão "Refresh" para re-escanear USB

### Tela 3 — Jogo

- Canvas fullscreen, sem UI visível durante gameplay
- Overlay de pause (Back no controle remoto ou Start+Select no gamepad):
  - Resume
  - Reset
  - Save State (slot 1/2/3)
  - Load State (slot 1/2/3, desabilitado se vazio)
  - Voltar ao Menu
- Notificações breves ("State saved to slot 1") que somem após 2s

## Input

### Gamepad API (Xbox layout como referência)

| SNES | Gamepad | NES | Gamepad |
|---|---|---|---|
| D-pad | D-pad/Left stick | D-pad | D-pad/Left stick |
| A | button 0 | A | button 0 |
| B | button 1 | B | button 1 |
| X | button 2 | — | — |
| Y | button 3 | — | — |
| L | button 4 (LB) | — | — |
| R | button 5 (RB) | — | — |
| Start | button 9 | Start | button 9 |
| Select | button 8 | Select | button 8 |

### Keyboard

| SNES | Key | NES | Key |
|---|---|---|---|
| D-pad | Arrow keys | D-pad | Arrow keys |
| A | F | A | Z |
| B | D | B | X |
| X | S | Start | Enter |
| Y | A | Select | Shift |
| L | Q | — | — |
| R | W | — | — |
| Start | Enter | — | — |
| Select | Shift | — | — |

### Controle Remoto Samsung TV

- Só para navegação nos menus (não para gameplay)
- Registrar via `tizen.tvinputdevice.registerKey()`: Enter/OK, Back, setas, Play/Pause
- Back: volta ao menu anterior ou abre overlay de pause durante jogo

### Remapeamento

- Menu de settings acessível do menu principal
- Persistido em `localStorage` (key: `input_config`)

## ROM Loading

### Paths de USB no Tizen

- `/opt/usr/media/USB/`
- `/media/USBDriveA/`, `/media/USBDriveB/`
- Detectados via `tizen.filesystem.resolve()`

### Estrutura sugerida no USB

```
USB/
├── roms/
│   ├── snes/
│   │   └── Super Mario World.smc
│   └── nes/
│       └── Super Mario Bros.nes
```

A pasta é opcional — o app detecta o tipo pela extensão do arquivo.

### Extensões suportadas

- SNES: `.smc`, `.sfc`, `.fig`
- NES: `.nes`
- Comprimido: `.zip` (extraído em memória via `fflate`)

### Cache

- Lista de ROMs cacheada em `localStorage` (key: `rom_list_cache`)
- Re-escaneia ao pressionar "Refresh" ou se storage mudou

## Save States

### Armazenamento

- **Primário**: `localStorage`
  - Key: `save_{hash_do_filename}_{slot}` (slot 1-3)
  - Hash: MD5 do nome do arquivo (não do conteúdo — seria lento)
- **Fallback**: filesystem local do app (`wgt-private/`) se localStorage estiver cheio
  - Tizen web apps têm ~5MB de localStorage
  - Save states snes9x: ~300KB cada
  - ~5 ROMs x 3 slots = ~4.5MB (limite prático)

### Formato

- JSON com o state serializado do engine
- Inclui metadata: timestamp, nome da ROM, slot number

## Estrutura do Projeto

```
tizen-retro-tv/
├── config.xml              # Manifest Tizen (privileges, app ID)
├── index.html              # Entry point único (SPA)
├── css/
│   └── styles.css          # Dark theme, fontes grandes, responsivo
├── js/
│   ├── app.js              # State machine, inicialização
│   ├── emulator-snes.js    # Wrapper xnes/snes9x
│   ├── emulator-nes.js     # Wrapper JSNES
│   ├── rom-loader.js       # Tizen filesystem scan + fallback file input
│   ├── input.js            # Gamepad + keyboard + controle remoto
│   ├── save-manager.js     # Save states (localStorage + fallback)
│   └── ui.js               # Menus, overlays, notificações
├── lib/
│   ├── xnes/               # snes9x asm.js vendored
│   ├── jsnes.min.js        # NES engine vendored
│   └── fflate.min.js       # Descompressão ZIP (~3KB)
├── assets/
│   ├── icons/              # 117x117 e 512x512
│   └── img/                # Background, controller hints
├── build.sh                # Empacota em .wgt
└── README.md               # Build e instalação
```

## config.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets"
        xmlns:tizen="http://tizen.org/ns/widgets"
        id="http://example.com/TizenRetroTV"
        version="1.0.0">
    <tizen:application id="XXXXXXXXXX.TizenRetroTV"
                       package="XXXXXXXXXX"
                       required_version="5.5"/>
    <content src="index.html"/>
    <name>Retro TV</name>
    <icon src="assets/icons/icon-117.png"/>
    <tizen:privilege name="http://tizen.org/privilege/filesystem.read"/>
    <tizen:privilege name="http://tizen.org/privilege/filesystem.write"/>
    <tizen:privilege name="http://tizen.org/privilege/externalstorage"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
</widget>
```

## Compatibilidade Tizen 5.5 (Chromium 69)

### Pode usar

- ES6: `let/const`, arrow functions, template literals, classes, `Promise`, `Map/Set`
- Canvas 2D, `requestAnimationFrame`
- `AudioContext`, `ScriptProcessorNode`
- Gamepad API
- `localStorage`
- WebAssembly MVP (básico, sem SIMD/threads)

### Não pode usar

- ES modules nativos (`import/export`) — usar script tags
- Top-level await
- Optional chaining (`?.`)
- Nullish coalescing (`??`)
- `AudioWorklet`
- `OffscreenCanvas` (provavelmente não disponível)
- WebGL 2 (incerto, usar Canvas 2D)

### Consequência

- Todos os `.js` carregados via `<script>` tags no `index.html`
- Código em ES5/ES6 básico, sem transpilação necessária
- Zero npm/bundler em runtime

## Modo Dev (Chrome Desktop)

- Quando `window.tizen` não existe:
  - ROM loading via `<input type="file">` em vez de filesystem API
  - Sem registro de teclas do controle remoto Samsung
  - Tudo mais funciona igual
- Permite iterar rápido no Chrome sem deployar na TV

## Build e Deploy

### build.sh

```bash
#!/bin/bash
DIST_DIR="dist"
WGT_NAME="TizenRetroTV.wgt"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"
zip -r "$DIST_DIR/$WGT_NAME" \
  config.xml index.html css/ js/ lib/ assets/ \
  -x "*.DS_Store" "*__MACOSX*" "*.git*"
echo "Built: $DIST_DIR/$WGT_NAME"
```

### Deploy (MacBook Air M3)

```bash
# Instalar tizen-app-installer-cli
npm install -g @nicecactus/tizen-app-installer-cli

# Build
./build.sh

# Deploy na TV (TV deve estar em modo dev, no mesmo Wi-Fi)
tizen-app-installer -t <IP_DA_TV> dist/TizenRetroTV.wgt
```

### Pré-requisitos no Mac

- Node.js (para tizen-app-installer-cli)
- `zip` (já vem no macOS)
- TV Samsung em modo desenvolvedor (Apps → digitar 12345 no controle → ativar Developer Mode → inserir IP do Mac)

## Estratégia de Validação

### Fase 1 — Prova de conceito (SNES na TV)

Build mínimo: `index.html` + canvas + xnes asm.js + Super Mario World hardcoded. Deploy na TV e validar:
- [ ] Roda a 60fps?
- [ ] Audio funciona sem crackling?
- [ ] Input do gamepad USB funciona?

Se sim → prosseguir. Se não → pivotar para EmulatorJS WASM.

### Fase 2 — App completo

Construir o app inteiro com a engine validada.

### Fase 3 — NES

Integrar JSNES com a mesma arquitetura.

## Licenças

| Componente | Licença | Nota |
|---|---|---|
| JSNES | MIT | Livre |
| xnes/snes9x | Snes9x (non-commercial) | Ok para uso pessoal/sideload |
| fflate | MIT | Livre |
