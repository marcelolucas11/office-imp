# Segurança

## Como relatar uma falha
Não abra uma issue pública para vulnerabilidades. Use **Security → Report a vulnerability** no
repositório do GitHub (relato privado). Descreva o impacto, os passos para reproduzir e a versão.
Você recebe uma resposta em até 7 dias.

## O que o projeto já faz
- Senhas com Argon2id; sessão em cookie `HttpOnly`, `Secure`, `SameSite=Lax`; limite de tentativas de login.
- Verificação em duas etapas (TOTP) obrigatória para Dono e Admin, com códigos de recuperação.
- Toda permissão é conferida no servidor (API e mensagens em tempo real); o cliente só esconde botões.
- Tokens de convite aleatórios (32 bytes), guardados com hash; convites de convidado com validade e revogação imediata.
- Tokens do LiveKit emitidos só pelo servidor, com validade curta; o de uma sala privada só sai para quem está dentro dela.
- Segredos de terceiros (SMTP, Google) criptografados no banco (AES-256-GCM) com `APP_ENCRYPTION_KEY`.
- CSP restrita, cabeçalhos de segurança e checagem de origem em requisições que alteram dados.
- App desktop com `contextIsolation`, `sandbox` e sem `nodeIntegration`; só o endereço do servidor recebe permissões.
- O atualizador só aceita versões no formato `X.Y.Z`, exige token e só age nos serviços do office-imp.

## Fora do escopo
- Instalações sem HTTPS ou com `COOKIE_SECURE=false`.
- Quem tem acesso root à VPS ou ao arquivo `.env` tem acesso a tudo, por definição.
