# Instalação e configuração

Este guia cobre, na ordem: [VPS](#1-instalar-na-vps) · [DNS](#2-dns-na-cloudflare) ·
[HTTPS / proxy](#3-https-e-proxy-reverso) · [primeiro acesso](#4-primeiro-acesso) ·
[apps de Mac e Windows](#5-apps-de-mac-e-windows) · [e-mail (SMTP)](#6-e-mail-smtp-para-as-notas-de-reunião) ·
[Google Calendar](#7-google-calendar) · [atualizações](#8-atualizações) · [backup](#9-backup-e-restauração) ·
[problemas comuns](#10-problemas-comuns).

## Requisitos

| Item | Mínimo | Recomendado (5 a 10 câmeras + transcrição) |
|---|---|---|
| Sistema | Ubuntu 22.04+ ou Debian 12+ (x86-64) | — |
| vCPU | 2 | 4 |
| RAM livre para o office-imp | 2 GB | 4 GB |
| Disco livre | 8 GB | 20 GB |
| Portas para a internet | 443/tcp, **7881/tcp** e **7882/udp** | — |

Memória aproximada dos serviços: app ~250 MB, PostgreSQL ~100 MB, Redis ~20 MB, LiveKit ~150 MB
(mais ~30 MB por pessoa com câmera), Egress ~250 MB (só durante gravações), Whisper ~400 MB com o
modelo `base` ou ~900 MB com o `small`.

## 1. Instalar na VPS

Entre na VPS por SSH e rode:

```bash
curl -fsSL https://raw.githubusercontent.com/marcelolucas11/office-imp/main/infra/install.sh | sudo bash
```

O instalador:

1. **Só observa** o que já existe (sistema, memória, containers, quem usa as portas 80 e 443).
2. Instala o Docker se faltar (pergunta antes).
3. Pergunta o domínio, o domínio do áudio/vídeo e confirma o IP público.
4. Decide o proxy: se as portas 80/443 estão **livres**, sobe um Caddy próprio com HTTPS automático;
   se estão **em uso** (por exemplo, pelo proxy do seu CRM), **não mexe nele** e mostra o que acrescentar.
5. Grava tudo em `/opt/office-imp` (com um `.env` de segredos aleatórios, permissão 600).
6. Libera as portas de mídia no UFW, se ele estiver ativo.
7. Sobe os serviços, espera o servidor responder e agenda o backup diário.
8. Mostra os próximos passos, o **token de configuração** e o uso de memória.

Ele pode ser rodado de novo a qualquer momento: os segredos e os dados são preservados.

> **Convivência com o CRM:** o office-imp usa um projeto Docker próprio (`office-imp`), volumes com
> prefixo `officeimp_` e só publica as portas 3080 e 7880 em `127.0.0.1`, mais 7881/tcp e 7882/udp.
> Nenhum container, volume, rede ou arquivo de configuração de outro sistema é alterado.

## 2. DNS na Cloudflare

Crie **dois registros do tipo A**, os dois apontando para o IP da VPS:

| Nome | Tipo | Conteúdo | Proxy |
|---|---|---|---|
| `office-impera` | A | IP da VPS | **DNS only** (nuvem cinza) |
| `rtc-office-impera` | A | IP da VPS | **DNS only** (nuvem cinza) — obrigatório |

O segundo registro (`rtc-…`) é o do áudio e vídeo. A Cloudflare não repassa esse tipo de tráfego,
então ele **precisa** ficar como "DNS only". O primeiro também funciona com a nuvem laranja
(nesse caso use SSL/TLS em modo *Full (strict)*), mas comece com a cinza: é o caminho mais simples
para o certificado HTTPS sair de primeira.

## 3. HTTPS e proxy reverso

**Caso A — portas 80/443 livres.** Nada a fazer: o Caddy do office-imp emite os certificados sozinho
assim que o DNS propagar (alguns minutos).

**Caso B — já existe um proxy na VPS (o do CRM).** Acrescente dois endereços a ele, com HTTPS e
suporte a WebSocket:

| Endereço público | Encaminhar para |
|---|---|
| `https://office-impera.imperaservices.com` | `http://127.0.0.1:3080` |
| `https://rtc-office-impera.imperaservices.com` | `http://127.0.0.1:7880` |

O instalador deixa exemplos **já com os seus domínios e portas** em `/opt/office-imp/proxy/`:

- `nginx.conf` — copie para `/etc/nginx/conf.d/office-imp.conf`, rode `nginx -t && systemctl reload nginx`
  e depois `certbot --nginx -d office-impera.imperaservices.com -d rtc-office-impera.imperaservices.com`.
- `Caddyfile.snippet` — cole no Caddyfile existente e rode `caddy validate` e `systemctl reload caddy`.
- `traefik.yml` — coloque na pasta de configuração dinâmica do Traefik.

Se o proxy atual roda **em container**, o instalador faz o office-imp escutar no IP da rede interna
do Docker (em geral `172.17.0.1`) e os exemplos saem com esse endereço.

Sempre **recarregue** (reload) o proxy, nunca reinicie, e valide a configuração antes.

**Caso C — a VPS usa o Easypanel** (o Traefik dele ocupa as portas 80/443). Não cadastre nada na tela
**Domínios** do Easypanel: ela só encaminha para serviços criados dentro dele. O instalador detecta o
Traefik em container e faz o office-imp escutar em `172.17.0.1`. Depois de instalar:

1. Confira, sem alterar nada, se o Traefik alcança o office-imp e quais nomes ele usa:

   ```bash
   C=/etc/easypanel/traefik/config
   T=$(docker ps -q -f name=easypanel-traefik)
   docker exec $T wget -qO- http://172.17.0.1:3080/api/health; echo     # deve mostrar {"ok":true,...}
   grep -A3 '"entryPoints"' $C/main.yaml | grep -oE '"https?"' | sort | uniq -c   # deve listar "https"
   grep -o 'certResolver": "[a-z]*' $C/main.yaml | sort -u                   # deve mostrar letsencrypt
   ```

2. Crie um arquivo **próprio** na pasta de configuração. Não edite o `main.yaml` (o Easypanel o
   reescreve) nem um `custom.yaml` que já exista:

   ```bash
   C=/etc/easypanel/traefik/config
   [ -e $C/office-imp.yaml ] && echo "já existe" || tee $C/office-imp.yaml >/dev/null <<'EOF'
   http:
     routers:
       office-imp:
         rule: Host(`office-impera.imperaservices.com`)
         entryPoints: [https]
         service: office-imp
         tls: { certResolver: letsencrypt }
       office-imp-rtc:
         rule: Host(`rtc-office-impera.imperaservices.com`)
         entryPoints: [https]
         service: office-imp-rtc
         tls: { certResolver: letsencrypt }
     services:
       office-imp:
         loadBalancer:
           servers: [{ url: "http://172.17.0.1:3080" }]
       office-imp-rtc:
         loadBalancer:
           servers: [{ url: "http://172.17.0.1:7880" }]
   EOF
   ```

3. Espere cerca de um minuto (o Traefik lê o arquivo sozinho e emite os certificados) e teste:

   ```bash
   curl -sI https://office-impera.imperaservices.com/api/health | head -1   # HTTP/2 200
   curl -sI https://rtc-office-impera.imperaservices.com | head -1          # HTTP/2 200
   ```

   Se aparecer 404 ou erro de certificado, reinicie o Traefik pelo Easypanel num horário tranquilo
   (os sites dele ficam fora do ar por alguns segundos).

Para remover o office-imp do proxy, basta apagar o `office-imp.yaml`.

Testado numa VPS Contabo com Ubuntu 24.04, Easypanel 2.37 e Traefik 3.7, ao lado de outros sistemas
em produção.

## 4. Primeiro acesso

1. Abra `https://office-impera.imperaservices.com/setup`.
2. Cole o **token de configuração** (o instalador mostra no final; também está em
   `/opt/office-imp/.env`, linha `SETUP_TOKEN`).
3. Crie as duas contas de **Dono** (você e o sócio). A tela de configuração se desativa em seguida.
4. Configure a verificação em duas etapas (obrigatória para Donos e Admins) com um app autenticador
   e **guarde os códigos de recuperação**. O sócio faz o mesmo no primeiro login dele.
5. Em **Painel do ADM → Escritórios → Criar escritório**, responda ao assistente
   (tamanho, quantos sócios, se dividem a sala) e pronto.
6. Em **Pessoas**, crie as contas dos funcionários (usuário e senha temporária).
7. Em **Links de convite**, gere o **link da equipe** e envie aos funcionários. Eles abrem o link,
   entram com o usuário e a senha que você passou e trocam a senha.

Perdeu o acesso das duas contas de Dono? Crie outra pela VPS:

```bash
cd /opt/office-imp
docker compose exec app node dist/setup-owner.js novo.dono "Nome do Dono" "uma-senha-forte"
```

## 5. Apps de Mac e Windows

Baixe em <https://github.com/marcelolucas11/office-imp/releases> e envie o arquivo para a equipe.
O app já abre em `https://office-impera.imperaservices.com`.

**Windows.** Rode o `.exe`. Na primeira vez o SmartScreen pode avisar "editor desconhecido":
clique em **Mais informações → Executar assim mesmo**. O app se atualiza sozinho.

**Mac (Apple Silicon M1, M2, M3, M4, M5… e Intel).** Abra o `.dmg` e arraste o app para Aplicativos.
Como o app não tem a assinatura paga da Apple, o macOS bloqueia a **primeira** abertura:

1. Abra o app uma vez (vai aparecer o aviso de bloqueio) e feche o aviso.
2. Vá em **Ajustes do Sistema → Privacidade e Segurança**, role até o fim e clique em **Abrir Mesmo Assim**.
3. Confirme. Isso só é pedido uma vez.

Alternativa pelo Terminal: `xattr -dr com.apple.quarantine "/Applications/Office Impera.app"`.

Depois, o macOS pede permissão de **microfone**, **câmera** e, ao compartilhar a tela pela primeira
vez, de **Gravação de Tela** (Ajustes → Privacidade e Segurança → Gravação de Tela; depois reabra o app).

No Mac sem assinatura a atualização é manual: o app avisa que há versão nova e abre a página de
download. Com uma conta Apple Developer (US$ 99/ano) dá para assinar: crie os *secrets*
`MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID`
no repositório e publique uma nova versão; o Mac passa a abrir sem aviso e a se atualizar sozinho.

## 6. E-mail (SMTP) para as notas de reunião

O SMTP é a "conta de envio" que o servidor usa para mandar a transcrição das reuniões.
Configure em **Painel do ADM → Configurações → E-mail (SMTP)**.

### Opção mais simples: Gmail com "senha de app"

1. Na conta Google que vai enviar os e-mails, ative a **verificação em duas etapas**
   (<https://myaccount.google.com/security>).
2. Abra <https://myaccount.google.com/apppasswords>, crie uma senha com o nome `office-imp` e copie
   os 16 caracteres.
3. No painel, preencha:

| Campo | Valor |
|---|---|
| Servidor (host) | `smtp.gmail.com` |
| Porta | `587` (STARTTLS) |
| Usuário | o endereço completo do Gmail |
| Senha | a senha de app de 16 caracteres (sem espaços) |
| Remetente | `Office Impera <seuendereco@gmail.com>` |

4. Clique em **Salvar** e depois em **Testar envio** para o seu próprio e-mail.

### Outros provedores

| Provedor | Host | Porta | Usuário | Senha |
|---|---|---|---|---|
| Brevo | `smtp-relay.brevo.com` | 587 | login SMTP da conta | chave SMTP |
| Resend | `smtp.resend.com` | 465 (SSL) | `resend` | chave de API |
| Zoho Mail | `smtp.zoho.com` | 465 (SSL) | o endereço | senha de app |
| Hostinger | `smtp.hostinger.com` | 465 (SSL) | o endereço | a senha da caixa |

Nos serviços de envio (Brevo, Resend), o **remetente** precisa ser de um domínio verificado lá.

### Quem recebe

Em **Escritórios → Configurações → Quem recebe as notas de reunião**, coloque um e-mail por linha.
É só uma lista de destino: o app não liga esses e-mails às contas de ninguém.

### Como usar

Dentro de uma **sala de reunião**, clique em **📝 Iniciar notas de reunião**. Todos na sala veem
"🔴 Gravando áudio para notas" e ouvem um aviso sonoro. Ao parar (ou quando a última pessoa sai),
o servidor transcreve o áudio, intercala as falas com o nome de quem falou, manda o e-mail e guarda
uma cópia em **Painel do ADM → Notas de reunião** (texto, áudio por pessoa e download).
Não há gravação de vídeo.

## 7. Google Calendar

Permite ver os eventos do dia, entrar na sala pelo link e agendar reuniões. Cada pessoa conecta a
própria agenda; o app guarda só a autorização (criptografada), nunca o e-mail.

### 7.1 Criar as credenciais (uma vez, pelo Dono)

1. Abra <https://console.cloud.google.com/> e crie um projeto (ex.: `office-imp`).
2. Em **APIs e serviços → Biblioteca**, procure **Google Calendar API** e clique em **Ativar**.
3. Em **APIs e serviços → Tela de permissão OAuth** (ou *Google Auth Platform → Branding*):
   tipo de usuário **Externo**, nome do app (`Office Impera`) e um e-mail de suporte.
4. Em **Público-alvo** (*Audience*), clique em **Publicar aplicativo** (status "Em produção").
   Sem publicar, a autorização de cada pessoa expira a cada 7 dias. Apps não verificados aceitam
   até 100 usuários, o que basta para uso interno.
5. Em **Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo de aplicativo: **Aplicativo da Web**
   - **URIs de redirecionamento autorizados:** copie o endereço mostrado em
     *Painel do ADM → Configurações → Google Calendar*, que é
     `https://office-impera.imperaservices.com/api/calendar/callback`
6. Copie o **ID do cliente** e a **chave secreta**.

### 7.2 Colocar no office-imp

Em **Painel do ADM → Configurações → Google Calendar**, cole o ID do cliente e a chave secreta e salve.

### 7.3 Cada pessoa conecta a sua agenda

Dentro do escritório, clique em **📅 Agenda → Conectar o Google Calendar**. A autorização abre no
navegador. Como o app não passou pela verificação do Google, aparece a tela "O Google não verificou
este app": clique em **Avançado → Acessar Office Impera**. Volte ao escritório e clique em **Atualizar**.

Para agendar: **📅 Agenda → Agendar reunião**, escolha a sala, a data e a hora. O evento é criado na
agenda da pessoa com o link direto da sala (`…/o/<escritório>/sala/<id>`); quem clicar em **Entrar**
vai direto para ela.

## 8. Atualizações

- **Servidor:** *Painel do ADM → Atualizações → Atualizar servidor* (só o Dono). É feito um backup do
  banco antes e, se a nova versão não responder, a anterior volta sozinha. Pela VPS:
  `cd /opt/office-imp && ./update.sh`.
- **Apps das pessoas:** *Atualizar automaticamente ao abrir* (liga/desliga) e **Atualizar todos agora**
  (aviso de 30 segundos; cada pessoa volta para o mesmo lugar do mapa).
- **Publicar uma versão nova** (para quem mantém o código): `git tag v1.1.0 && git push origin v1.1.0`.
  O GitHub Actions gera as imagens Docker, os instaladores e a release.

## 9. Backup e restauração

Todo dia às 03:30 o `backup.sh` salva em `/opt/office-imp/backups/` o banco (`db-….sql.gz`) e os
arquivos (`data-….tar.gz`: áudios, uploads), guardando 7 dias. **Copie também o `.env`** para um
lugar seguro: sem a `APP_ENCRYPTION_KEY` não dá para ler as senhas de SMTP e as autorizações do Google.

```bash
cd /opt/office-imp
./backup.sh                                             # backup agora
./restore.sh backups/db-20261112-033000.sql.gz          # restaura o banco
./restore.sh backups/db-….sql.gz backups/data-….tar.gz  # banco + arquivos
```

## 10. Problemas comuns

| Sintoma | Causa provável e solução |
|---|---|
| Entro no escritório, vejo os avatares, mas ninguém se ouve | As portas **7881/tcp** e **7882/udp** não estão abertas para a internet, ou o registro `rtc-…` está com a nuvem laranja. Confira o firewall da VPS e o DNS. |
| "áudio/vídeo indisponível, tentando de novo…" | O endereço `rtc-…` não tem HTTPS válido ou o proxy não repassa WebSocket. Teste `https://rtc-office-impera.imperaservices.com` no navegador: deve responder `OK`. |
| A página abre, mas fica em "Reconectando…" | O proxy não está repassando WebSocket em `/rt`. Veja os cabeçalhos `Upgrade`/`Connection` no exemplo de `nginx.conf`. |
| O certificado HTTPS não sai | O DNS ainda não propagou ou a porta 80 não chega na VPS. `docker compose logs caddy` mostra o motivo. |
| Notas de reunião ficam em "transcrevendo" | O Whisper ainda está baixando o modelo (primeira vez) ou falta memória. `docker compose logs whisper`. |
| O e-mail das notas não chega | Use **Testar envio**. O erro do provedor aparece na hora e também em *Notas de reunião → detalhe*. |
| Esqueci a senha | Não existe recuperação por e-mail. Um Admin ou Dono redefine em *Pessoas → Editar*. |
| Perdi o celular do 2FA | Use um código de recuperação no login, ou peça ao outro Dono para "Zerar 2FA". |

Comandos úteis, sempre em `/opt/office-imp`:

```bash
docker compose ps                # estado dos serviços
docker compose logs -f app       # log do servidor
docker compose logs -f livekit   # log do áudio e vídeo
docker stats --no-stream         # memória e CPU de cada serviço
```
