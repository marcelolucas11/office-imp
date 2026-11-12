# Transcrição local: servidor HTTP do whisper.cpp (MIT). O modelo é baixado na primeira execução.
FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates && rm -rf /var/lib/apt/lists/*
ARG WHISPER_REF=v1.7.4
RUN git clone --depth 1 --branch ${WHISPER_REF} https://github.com/ggml-org/whisper.cpp /src
WORKDIR /src
# GGML_NATIVE=OFF: o binário compilado no CI precisa rodar na CPU da VPS (AVX2, sem AVX-512)
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON \
  && cmake --build build -j"$(nproc)" --config Release \
  && mkdir /out && (cp build/bin/whisper-server /out/whisper-server || cp build/bin/server /out/whisper-server)

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libgomp1 && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/whisper-server /usr/local/bin/whisper-server
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /models
ENV WHISPER_MODEL=auto MODELS_DIR=/models WHISPER_THREADS=2 WHISPER_LANGUAGE=pt
VOLUME /models
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=600s --retries=5 CMD curl -fsS -o /dev/null http://127.0.0.1:8080/ || exit 1
ENTRYPOINT ["/entrypoint.sh"]
LABEL org.opencontainers.image.source="https://github.com/marcelolucas11/office-imp"
