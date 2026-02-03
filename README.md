# AutoWpp

Orquestrador para envio automático de mensagens no WhatsApp usando múltiplas contas, com distribuição inteligente e auto-resposta. O projeto inclui um modo simples (um único bot) e um orquestrador em Python que coordena várias sessões autenticadas.\

## Visão geral

- **index.js**: inicia um cliente do WhatsApp, envia mensagens para contatos pendentes e mantém o bot ativo para auto-respostas.\
- **sender.js**: envia mensagens pontuais para uma lista de contatos e encerra o processo (útil para o orquestrador).\
- **orchestrator.py**: inicia múltiplos bots, espera autenticação e distribui envios entre contas com balanceamento aleatório.\

## Requisitos

- Node.js 18+ (recomendado)\
- Python 3.8+\
- Dependências Node:\
  - `whatsapp-web.js`\
  - `qrcode-terminal`\
  - `axios`\
  - `googleapis`

Instale as dependências com:

```bash
npm install whatsapp-web.js qrcode-terminal axios googleapis
```

> **Observação:** o `whatsapp-web.js` usa o Puppeteer para controlar o navegador. O projeto já inicia o Chrome em modo headless com `--no-sandbox`.

## Estrutura do arquivo de contatos

O arquivo padrão é `contacts.json`. Cada contato deve seguir o formato abaixo:

```json
[
  {
    "phone": "+5511999999999",
    "message": "Olá! Esta é uma mensagem automática.",
    "delay": 2000,
    "sent": false
  }
]
```

- `phone`: número com DDI (ex.: `+55`).\
- `message`: texto a ser enviado.\
- `delay`: tempo em milissegundos entre mensagens (opcional).\
- `sent`: controle de envio (deve começar como `false`).\

## Uso rápido (1 conta)

Inicie um bot único apontando para o arquivo de contatos:

```bash
node index.js account_1 contacts.json
```

- Escaneie o QR Code no WhatsApp para autenticar.\
- O bot envia mensagens pendentes e permanece ativo para auto-respostas.

## Uso com múltiplas contas (orquestrador)

O orquestrador inicia várias instâncias e distribui os envios:

```bash
python3 orchestrator.py
```

Fluxo principal:

1. Cada conta exibe um QR Code para autenticação.\
2. Após autenticar, o coordenador envia mensagens pendentes com balanceamento aleatório.\
3. Os bots ficam ativos para responder automaticamente.

### Comandos do orquestrador

- `status`: status das contas e processos.\
- `stats`: estatísticas de envio.\
- `terminate`: encerra todas as instâncias.

## Auto-resposta

Após enviar mensagens, o bot permanece ativo e responde automaticamente com **"Um momento!"** quando recebe uma mensagem.

## Google Sheets (captura de leads)

Quando o cliente envia CPF e e-mail, o bot registra os dados em uma planilha. Para habilitar:

1. Salve os arquivos `key.json` e `token.json` na raiz do projeto.\
2. Garanta que a planilha tenha as colunas `Número`, `CPF` e `EMAIL`.\
3. Ajuste as variáveis de ambiente se necessário:\
   - `GOOGLE_SHEET_ID` (padrão: planilha do link fornecido)\
   - `GOOGLE_SHEET_RANGE` (padrão: `A:C`)

## Relato de erros

Em falhas de envio, o sistema tenta registrar erros em um endpoint configurado no código (`ERROR_REPORT_URL`). Certifique-se de ajustar a URL e o token conforme necessário. Quando ocorre um erro de envio pelo orquestrador, o contato permanece com `sent: false` e recebe um `sentAt` com prefixo `ERROR_`, para que o reenvio aconteça apenas em uma próxima execução.

## Dicas

- Para reenviar mensagens, altere `"sent": false` no `contacts.json`.\
- Use `delay` para reduzir risco de bloqueios.\
- Mantenha sessões autenticadas em ambientes estáveis.