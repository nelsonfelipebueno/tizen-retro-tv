# NaCl SNES Emulator — Design Spec

## Overview

Compilar snes9x como binário ARM nativo via NaCl (Native Client) para rodar a ~85% da velocidade nativa dentro do app Tizen web (.wgt) na Samsung Q60T 2020 (Tizen 5.5). Baseado no projeto [snes4nacl](https://github.com/GeoffreyPlitt/snes4nacl) que já portou snes9x 1.53 pra PPAPI.

## Objetivo

SNES (Super Mario World) rodando a 60fps na TV Samsung 2020 com gamepad, audio, e save states.

## Por que NaCl

| Approach | Performance vs Nativo |
|---|---|
| JavaScript (JSNES/xnes) | ~4% |
| WASM (snes9x-2005) | ~60-70% |
| **NaCl (.nexe ARM)** | **~85%** |

O WASM já foi testado e não atingiu 60fps. O NaCl é a última opção antes de hardware externo.

## Arquitetura

```
┌─────────────────────────────────────────────┐
│            Tizen Web App (.wgt)             │
│                                             │
│  index.html                                 │
│    ├── Menu UI (JS) — seleção de sistema/ROM│
│    ├── <embed type="application/x-nacl">    │
│    │     └── snes9x_arm.nexe (ARM binary)   │
│    └── JS controller                        │
│         ├── postMessage(ROM) → NaCl         │
│         ├── Gamepad API polling → postMessage│
│         └── Save/Load via localStorage      │
│                                             │
│  NaCl Module (C++, snes9x 1.53):            │
│    ├── HandleMessage() — recebe ROM/comandos │
│    ├── pp::Graphics2D — renderiza frames     │
│    │     └── ReplaceContents() (zero-copy)   │
│    ├── pp::Audio — callback 44100Hz          │
│    │     └── Ring buffer thread-safe do APU   │
│    ├── HandleInputEvent() — keyboard/remote  │
│    └── snes9x core (inalterado)              │
│         ├── CPU 65c816                        │
│         ├── PPU (framebuffer 256x224/512x448) │
│         ├── APU/SPC700 (32000Hz → 44100Hz)    │
│         └── Chips especiais (SA-1, DSP, etc.) │
└─────────────────────────────────────────────┘
```

## Base: snes4nacl

Repositório: https://github.com/GeoffreyPlitt/snes4nacl

O snes4nacl já adaptou snes9x 1.53 pra NaCl com:
- `pp::Graphics2D` pra renderização
- `pp::Audio` pra audio
- `HandleInputEvent()` pra input
- `HandleMessage()` pra comunicação JS↔C++
- Remoção de SDL, X11, Win32

O que precisa adaptar:
- Atualizar de Google Pepper ~37 pra Samsung Pepper 63
- Ajustar Makefile/build pra toolchain Samsung ARM
- Adicionar suporte a gamepad via postMessage
- Adicionar save/load state via postMessage
- Integrar no nosso app Tizen existente

## Comunicação JS ↔ NaCl

### JS → NaCl (postMessage)

| Comando | Payload | Descrição |
|---|---|---|
| `load_rom` | ArrayBuffer | ROM data |
| `input` | uint32 bitmask | Estado do joypad |
| `save_state` | — | Solicita save state |
| `load_state` | ArrayBuffer | Restaura save state |
| `pause` | — | Pausa emulação |
| `resume` | — | Retoma emulação |

### NaCl → JS (PostMessage)

| Mensagem | Tipo | Descrição |
|---|---|---|
| `rom_loaded` | string | ROM carregada com sucesso |
| `state_data` | ArrayBuffer | Save state serializado |
| `error` | string | Mensagem de erro |

## Rendering

- `pp::Graphics2D` com `pp::ImageData`
- `ReplaceContents()` pra swap zero-copy do framebuffer
- `Flush()` callback como vsync (game loop)
- Formato: BGRA ou RGBA (detectado em runtime via `GetNativeImageDataFormat()`)
- Resolução: 256x224 (nativo SNES), escalado pelo embed element dimensions

## Audio

- `pp::Audio` com callback em thread separada
- Sample rate: 44100 Hz (PP_AUDIOSAMPLERATE_44100)
- SNES APU gera 32000 Hz → resampling linear pra 44100
- Ring buffer thread-safe entre game loop e audio callback
- Formato: int16_t stereo interleaved

## Input

### Keyboard (HandleInputEvent)
- Teclas do controle remoto Samsung chegam como keyboard events
- Teclado USB funciona direto

### Gamepad (via JS postMessage)
- JS faz polling do Gamepad API (navigator.getGamepads)
- Envia bitmask do joypad via postMessage a cada frame
- Bitmask: mesmo formato do snes9x (bit 4=R, 5=L, 6=X, 7=A, 8=Right, 9=Left, 10=Down, 11=Up, 12=Start, 13=Select, 14=Y, 15=B)

## Build Pipeline

### Docker Container

```
Base: ubuntu:20.04 (x86_64, roda via Rosetta no M3)
├── Samsung Pepper 63 SDK (1.68GB)
├── snes4nacl source
└── PNaCl toolchain:
     pnacl-clang++ → app.pexe
     pnacl-finalize → app.pexe (finalizado)
     pnacl-translate -arch arm → snes9x_arm.nexe
```

### Dockerfile

```dockerfile
FROM ubuntu:20.04
RUN apt-get update && apt-get install -y wget unzip python2 build-essential git
# Download Samsung Pepper 63
RUN wget -O /tmp/pepper63.zip <SAMSUNG_PEPPER_63_URL>
RUN unzip /tmp/pepper63.zip -d /opt/nacl-sdk
# Clone snes4nacl
RUN git clone https://github.com/GeoffreyPlitt/snes4nacl.git /src/snes4nacl
ENV NACL_SDK_ROOT=/opt/nacl-sdk/pepper_63
WORKDIR /src/snes4nacl
```

### Build Commands

```bash
docker build -t nacl-builder .
docker run -v $(pwd)/output:/output nacl-builder make release
# Output: /output/snes9x_arm.nexe + app.nmf
```

## Estrutura do Projeto (após integração)

```
tizen-retro-tv/
├── config.xml
├── index.html              # Menu + <embed> NaCl (SNES) ou JSNES (NES)
├── nacl/
│   ├── snes9x_arm.nexe     # SNES engine nativo ARM (~2-4MB)
│   └── app.nmf             # Manifest NaCl
├── js/
│   ├── app.js              # State machine (MENU→ROM_LIST→PLAYING)
│   ├── emulator-snes.js    # Controller JS pra NaCl module
│   ├── emulator-nes.js     # JSNES wrapper (inalterado)
│   ├── input.js            # Gamepad + keyboard
│   ├── rom-loader.js       # ROMs bundled + USB
│   ├── save-manager.js     # localStorage save/load
│   └── ui.js               # Menus
├── lib/
│   ├── jsnes.min.js        # NES engine (mantido)
│   └── snes9x2005/         # WASM fallback (mantido)
├── roms/                   # ROMs bundled
├── css/styles.css
└── build.sh
```

## emulator-snes.js (novo)

O wrapper JS muda de "redirecionar pra snes9x2005" pra "controlar o NaCl module":

```javascript
var EmulatorSNES = (function() {
    var naclModule = null;

    function init(container) {
        // Cria <embed> element
        var embed = document.createElement('embed');
        embed.id = 'nacl-snes';
        embed.setAttribute('type', 'application/x-nacl');
        embed.setAttribute('src', 'nacl/app.nmf');
        embed.style.width = '100%';
        embed.style.height = '100%';
        container.appendChild(embed);
        naclModule = embed;

        naclModule.addEventListener('load', function() {
            // NaCl module pronto
        });
    }

    function loadROM(arrayBuffer) {
        naclModule.postMessage({cmd: 'load_rom', data: arrayBuffer});
    }

    function setInput(bitmask) {
        naclModule.postMessage({cmd: 'input', joypad: bitmask});
    }

    function saveState() {
        naclModule.postMessage({cmd: 'save_state'});
    }

    // ...
})();
```

## NaCl Module (C++ — baseado no snes4nacl)

### Arquivos principais a modificar do snes4nacl:

| Arquivo | Mudança |
|---|---|
| `nacl_module.cpp` | Atualizar PPAPI pra Pepper 63, adicionar postMessage handlers |
| `Makefile` | Apontar pra Samsung Pepper 63 toolchain |
| `nacl_video.cpp` | Verificar compatibilidade Graphics2D |
| `nacl_audio.cpp` | Verificar compatibilidade Audio |
| `nacl_input.cpp` | Adicionar gamepad via postMessage |

### Código não modificado (snes9x core):
- `cpu.cpp`, `cpuexec.cpp` — CPU 65c816
- `ppu.cpp`, `tile.cpp` — PPU rendering
- `apu.cpp`, `spc700.cpp` — Audio
- `memmap.cpp` — Memory mapping
- `dsp.cpp`, `sa1.cpp`, `superfx.cpp` — Chips especiais

## Compatibilidade

- **TV**: Samsung Q60T 2020, Tizen 5.5
- **NaCl**: Suportado em TVs 2015-2021 (Pepper 63)
- **config.xml**: Sem privilégios adicionais necessários
- **Fallback**: Se NaCl falhar, manter snes9x-2005 WASM como backup

## Riscos

1. **Samsung Pepper 63 SDK pode não estar mais disponível pra download** — verificar URL antes de começar
2. **snes4nacl usa Pepper ~37** — pode haver breaking changes no Pepper 63
3. **Docker Rosetta (ARM→x86)** pode ter problemas com o PNaCl toolchain
4. **Gamepad via postMessage** adiciona latência de 1 frame vs HandleInputEvent direto
5. **Memory limit ~120MB** no Tizen — snes9x 1.53 + ROM deve caber

## Critério de Sucesso

- Super Mario World rodando a **50+ fps** na TV (vs ~35fps com WASM)
- Audio sem crackling
- Gamepad funcional (D-pad + 8 botões)
- Save states funcionais
