# Retro TV — SNES/NES Emulator for Samsung Smart TV

Tizen web app (.wgt) para Samsung Smart TVs (2020+, Tizen 5.5) com emulador SNES usando snes9x-2005 (WASM).

## Status do Projeto

### SNES (snes9x-2005 WASM)
- **Funciona** na TV Samsung Q60T 2020 (Tizen 5.5, Chromium 69)
- **Performance**: roda, mas com engasgos (~35-45fps). O hardware ARM da TV tem limitacao com emulacao SNES em JavaScript/WASM
- **Gamepad**: funciona (Xbox/PlayStation com mapeamento automatico)
- **Audio**: desativado pra performance (pode ser reativado em `script.js` setando `noSound = false`)
- **ROMs bundled**: 4 ROMs incluidas no pacote

### NES (futuro)
- JSNES (122KB, JavaScript puro) deve rodar liso na TV — NES eh muito mais leve que SNES
- Estrutura do app ja suporta NES (rom-loader, input, UI)

### Solucao para 60fps: Lumen + Moonlight
Para SNES a 60fps real, a solucao eh streaming do Mac:
- **Mac** roda RetroArch/emulador a 60fps (M3 sobra de potencia)
- **TV** roda Moonlight Tizen (~30ms latencia LAN)
- **Gamepad na TV** envia input pro Mac
- Ver `docs/` para detalhes

## Arquitetura

```
tizen-retro-tv/
├── config.xml              # Manifest Tizen (package xR3tr0TvAp)
├── index.html              # Menu principal (selecao de ROM)
├── css/styles.css           # Dark theme, TV-optimized
├── js/
│   ├── app.js              # State machine (MENU→ROM_LIST→LOADING→PLAYING)
│   ├── emulator-snes.js    # Redireciona pra snes9x-2005
│   ├── emulator-nes.js     # Wrapper JSNES (futuro)
│   ├── input.js            # Gamepad + keyboard + TV remote
│   ├── rom-loader.js       # ROMs bundled + Tizen USB scan
│   ├── save-manager.js     # Save states via localStorage
│   └── ui.js               # Menus, toasts, navegacao
├── lib/
│   └── snes9x2005/         # Engine SNES (WASM, 604KB)
│       ├── snes9x_2005.wasm
│       ├── snes9x_2005.js   # Emscripten glue
│       ├── script.js        # Game loop, ROM loading, otimizacoes
│       ├── gamepad.js       # Gamepad mapping
│       └── index.html       # Pagina do emulador (fullscreen canvas)
├── roms/                    # ROMs bundled
├── assets/icons/            # App icons (117x117, 512x512)
└── build.sh                 # Empacota como .wgt
```

## Build e Deploy

### Pre-requisitos (MacBook)

- **Tizen Studio CLI** instalado em `~/tizen-studio/`
- **Certificado Samsung** configurado (profile "RetroTV" com sdk-public distributor)
- **Node.js** (para o script de instalacao)
- TV em **Developer Mode** (Apps → 12345 → ON → IP do Mac)

### Build

```bash
./build.sh
# Output: dist/TizenRetroTV.wgt
```

### Assinar

```bash
# Assinar com certificado Samsung (necessario pra TV aceitar)
~/tizen-studio/tools/ide/bin/tizen package -t wgt -s RetroTV -- dist/TizenRetroTV.wgt
```

### Deploy na TV

```bash
# Matar SDB existente (conflita com o installer)
killall sdb

# Instalar via Node.js ADB client (o metodo que funciona)
node /tmp/tv-installer/install2.js 192.168.1.5 dist/TizenRetroTV.wgt xR3tr0TvAp
```

**IMPORTANTE**: O `tizen install` CLI e o TizenBrew Installer NAO funcionam pra instalar apps custom nesta TV. O unico metodo que funciona eh o script Node.js `install2.js` que usa o protocolo ADB diretamente (baseado no FilePusher do TizenBrew).

### Script de instalacao (install2.js)

Localizado em `/tmp/tv-installer/install2.js`. Usa a lib `adbhost` pra:
1. Conectar na TV via porta 26101
2. Pushcar o .wgt pro filesystem da TV
3. Chamar `vd_appinstall` pra instalar

## Controles

### Gamepad (Xbox/PlayStation)

| SNES | Xbox | PlayStation |
|------|------|-------------|
| D-pad | D-pad/Stick | D-pad/Stick |
| A | A | Cross |
| B | B | Circle |
| X | X | Square |
| Y | Y | Triangle |
| L | LB | L1 |
| R | RB | R1 |
| Start | Start | Options |
| Select | Back | Share |
| **Pause** | **Select+Start** | **Share+Options** |

### Keyboard

| SNES | Key |
|------|-----|
| D-pad | Arrow keys |
| A | A |
| B | Z |
| X | X |
| Y | S |
| L | D |
| R | C |
| Start | Enter |
| Select | Shift |

## Engines Testados

### Funcionou (com limitacoes de performance)

| Engine | Tech | Tamanho | Resultado |
|--------|------|---------|-----------|
| **snes9x-2005-wasm** | WASM | 604KB | Melhor resultado. ~35-45fps. Feito pra PSP |
| **xnes (snes9x asm.js)** | asm.js | 4MB | Funciona mas ~30fps. Audio consome muito CPU |

### Nao funcionou

| Engine | Tech | Problema |
|--------|------|----------|
| **EmulatorJS** | WASM | JS usa optional chaining (`?.`) — Chromium 69 nao suporta. Transpilamos com Babel mas o core WASM deu timeout |
| **webretro (BinBashBanana)** | WASM | Carrega mas performance similar ao xnes |
| **bsnes-wasm** | N/A | Nao existe como pacote standalone |
| **SnesJs (JS puro)** | JS | Muito lento, nao roda nem em desktop |

## Otimizacoes Aplicadas

1. **Audio desativado** (`noSound = true`) — economiza ~30% CPU
2. **`Uint8ClampedArray.set()`** em vez de copia byte-a-byte — ~10x mais rapido
3. **GPU canvas** (`translateZ(0)`, `will-change: transform`)
4. **Viewport 720p** — menos pixels pro compositor
5. **Multitasking desabilitado** (config.xml metadata)
6. **Resolucao 1080p forcada** (config.xml metadata)
7. **Zero console.log** — sem overhead de logging
8. **Gamepad com mapeamento default** — sem necessidade de configuracao manual

## Otimizacoes Tentadas que NAO Funcionaram

1. **Desabilitar AudioContext** (fake stub) — quebra o timing do Emscripten (0 FPS)
2. **Mute via GainNode zero** — timing funciona mas nao melhora performance (APU ainda emula internamente)
3. **`_set_transparency(0)`** — fundo fica preto
4. **Frameskip agressivo** — perde fluidez visual
5. **Canvas 256x224 com CSS upscale** — CSS nao escalou no Tizen, ficou minusculo
6. **Cap de 30fps** — logica do jogo roda a metade da velocidade (SNES precisa de 60 ticks/s)
7. **Offscreen canvas + drawImage** — nao melhorou performance

## Problemas Conhecidos de Deploy

### Certificado
- TVs Samsung exigem certificado assinado pelo **Tizen SDK distributor** (sdk-public)
- Certificado Tizen generico (`tizen-distributor-signer.p12`) eh rejeitado
- O certificado precisa ser assinado pelo `tizen package` CLI (nao pelo tizen.js npm)
- TizenBrew Installer Desktop NAO re-assina pra Tizen 5.5 (so pra Tizen 7+)

### Developer Mode
- Precisa ativar Developer Mode toda vez que reinicia a TV
- Host PC IP deve ser o IP do Mac
- Porta 26101 deve estar aberta (verificar com `nc -z IP 26101`)
- SDB e TizenBrew Installer conflitam — matar um antes de usar o outro

### config.xml
- `tizen:profile name="tv-samsung"` eh **obrigatorio** (sem isso o app nao aparece)
- `required_version="3.0"` (nao 5.5 — compatibilidade mais ampla)
- `viewmodes="maximized"` eh necessario
- `<access origin="*" subdomains="true"/>` necessario pra fetch

## Proximos Passos

### NES Port
- Integrar JSNES (122KB, JS puro, MIT)
- Deve rodar liso — NES eh ~10x mais simples que SNES
- Usar a mesma estrutura de menu e ROM loading

### SNES 60fps via Streaming
- Instalar Lumen (Sunshine fork pra Apple Silicon) no Mac
- Instalar Moonlight Tizen na TV
- Mac roda RetroArch com snes9x a 60fps
- TV exibe stream com ~30ms de latencia
- Gamepad na TV funciona via Moonlight protocol

### USB ROM Loading
- Nao foi testado completamente — o `tizen.filesystem` API pode nao detectar USB no Chromium 69
- ROMs bundled no pacote funcionam como workaround

## Licencas

| Componente | Licenca |
|------------|---------|
| snes9x-2005 | Snes9x (non-commercial) |
| JSNES | Apache 2.0 |
| webretro | MIT |

## Hardware de Teste

- **TV**: Samsung QN50Q60TAGXZD (2020, Tizen 5.5, Chromium 69, ARM quad-core)
- **Mac**: MacBook Air M3
- **Gamepad**: PlayStation DualSense via Bluetooth
- **Rede**: Wi-Fi LAN 192.168.1.x
