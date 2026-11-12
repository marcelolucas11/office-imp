#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Escolhe o modelo pela memória disponível (auto), baixa se faltar e sobe o servidor do whisper.cpp.
set -e
MODEL="${WHISPER_MODEL:-auto}"
if [ "$MODEL" = "auto" ]; then
  avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  if [ "$avail" -ge 3000 ]; then MODEL=small; elif [ "$avail" -ge 1200 ]; then MODEL=base; else MODEL=tiny; fi
  echo "[whisper] memória disponível: ${avail} MB -> modelo '${MODEL}'"
fi
FILE="${MODELS_DIR:-/models}/ggml-${MODEL}.bin"
if [ ! -s "$FILE" ]; then
  echo "[whisper] baixando o modelo ${MODEL} (uma vez só)..."
  curl -fL --retry 5 --retry-delay 5 -o "${FILE}.part" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin"
  mv "${FILE}.part" "$FILE"
fi
echo "[whisper] servidor pronto na porta 8080 (modelo ${MODEL}, ${WHISPER_THREADS:-2} threads)"
exec nice -n 10 whisper-server -m "$FILE" --host 0.0.0.0 --port 8080 -t "${WHISPER_THREADS:-2}" -l "${WHISPER_LANGUAGE:-pt}"
