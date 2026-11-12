# Como contribuir

Obrigado pelo interesse! O office-imp é software livre (AGPL-3.0) e aceita contribuições.

## Ambiente
Requisitos: Node 22+, pnpm 10+ e Docker (para o LiveKit).

```bash
pnpm install
docker compose -f infra/docker-compose.dev.yml up -d   # Redis + LiveKit (áudio e vídeo)
pnpm dev                                               # servidor em :3000, cliente web em :5173
```

Sem `DATABASE_URL`, o servidor usa um PostgreSQL embutido (PGlite) em `apps/server/data/`.
O token da configuração inicial aparece no log do servidor.

## Antes de abrir um PR
```bash
pnpm lint && pnpm typecheck && pnpm test   # ESLint, tipos e testes unitários
pnpm build && pnpm e2e                     # testes de ponta a ponta (Playwright)
pnpm spdx                                  # cabeçalho de licença nos arquivos novos
pnpm i18n:extract                          # atualiza apps/web/src/locales/pt-BR.json
```

## Convenções
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat:`, `fix:`, `docs:`, `chore:`…).
- **Textos da interface:** sempre por `t('chave', 'Texto em pt-BR')`. Nada de texto solto no JSX.
- **Permissões:** a regra fica em `packages/shared/src/permissions.ts` e é conferida no servidor.
- **Banco:** altere `apps/server/src/db/schema.ts` e gere a migração com `pnpm db:generate`.
- **Arte:** só recursos gerados por código ou com licença CC0/CC-BY (registre em `assets/LICENSES.md`).
- **Segredos:** nunca no repositório. Use `.env` (ignorado pelo Git) e documente em `.env.example`.

## Traduções
Copie `apps/web/src/locales/pt-BR.json` para o novo idioma (ex.: `es.json`), traduza os valores e
registre o idioma em `apps/web/src/lib/i18n.ts`.

## Marcas
O nome e o logotipo da Impera não fazem parte da licença do código. Veja [`TRADEMARKS.md`](TRADEMARKS.md).
