# Atualizador do office-imp: recebe o pedido do painel do Dono e troca a versão das imagens.
# Tem acesso ao Docker do host, por isso só executa uma lista fixa de comandos, só nos serviços do office-imp.
FROM docker:27-cli
RUN apk add --no-cache nodejs
WORKDIR /updater
COPY server.mjs ./
ENV PORT=8787
EXPOSE 8787
# a imagem docker:cli tem um entrypoint que trataria "node" como subcomando do docker
ENTRYPOINT ["node", "server.mjs"]
CMD []
LABEL org.opencontainers.image.source="https://github.com/marcelolucas11/office-imp"
