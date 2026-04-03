#!/bin/bash
set -e

export NACL_SDK_ROOT=/opt/nacl-sdk/pepper_63
TOOLCHAIN=$NACL_SDK_ROOT/toolchain/linux_pnacl/bin

echo "=== Checking toolchain ==="
ls $TOOLCHAIN/pnacl-clang++ || { echo "ERROR: PNaCl toolchain not found"; exit 1; }

echo "=== Compiling snes4nacl for ARM ==="
cd /src/snes4nacl

rm -f *.pexe *.nexe

CORE_CPP=$(find . -maxdepth 1 -name "*.cpp" | sort | tr '\n' ' ')
APU_CPP=$(find apu -name "*.cpp" | sort | tr '\n' ' ')
NACL_CPP=$(find nacl -name "*.cpp" | sort | tr '\n' ' ')

echo "Core files: $(echo $CORE_CPP | wc -w)"
echo "APU files: $(echo $APU_CPP | wc -w)"
echo "NaCl files: $(echo $NACL_CPP | wc -w)"

$TOOLCHAIN/pnacl-clang++ \
    -I$NACL_SDK_ROOT/include \
    -I. -Iapu -Inacl \
    -DHAVE_STRINGS_H -DHAVE_STDINT_H -DRIGHTSHIFT_IS_SAR \
    -DVAR_CYCLES -DCPU_SHUTDOWN -DSPC700_SHUTDOWN \
    -DCORRECT_VRAM_READS -DUNZIP_SUPPORT \
    -DNOASM -DPIXEL_FORMAT=RGB565 \
    -DUSE_OPENGL -DNACL \
    -std=gnu++98 \
    -O2 \
    -o snes4nacl.pexe \
    $CORE_CPP $APU_CPP $NACL_CPP \
    -L$NACL_SDK_ROOT/lib/pnacl/Release \
    -lppapi_gles2 -lppapi_cpp -lppapi -lnosys -lpthread

echo "=== Finalizing PNaCl ==="
$TOOLCHAIN/pnacl-finalize snes4nacl.pexe

echo "=== Translating to ARM ==="
$TOOLCHAIN/pnacl-translate -arch arm -o snes9x_arm.nexe snes4nacl.pexe

echo "=== Done ==="
ls -lh snes9x_arm.nexe

cp snes9x_arm.nexe /output/
cat > /output/app.nmf << 'EOF'
{
  "program": {
    "arm": {
      "url": "snes9x_arm.nexe"
    }
  }
}
EOF

echo "Output: /output/snes9x_arm.nexe + /output/app.nmf"
