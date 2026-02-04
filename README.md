# AutoWpp

Orquestrador para envio automático de mensagens no WhatsApp usando múltiplas contas, com distribuição eligente e auto-resposta. O projeto inclui um modo simples (um único bot) e um orquestrador em Python que rdena várias sessões autenticadas.\

## Visão geral

- **index.js**: inicia um cliente do WhatsApp, envia mensagens para contatos pendentes e mantém o bot ativo a auto-respostas.\
- **sender.js**: envia mensagens pontuais para uma lista de contatos e encerra o processo (útil para o uestrador).\
- **orchestrator.py**: inicia múltiplos bots, espera autenticação e distribui envios entre contas com anceamento aleatório.\

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

> **Observação:** o `whatsapp-web.js` usa o Puppeteer para controlar o navegador. O projeto já inicia o me em modo headless com `--no-sandbox`.

## Estrutura do arquivo de contatos

O arquivo padrão é `contacts.json`. Cada contato deve seguir o formato abaixo:

```json
[
  {
    "phone": "+5511999999999",
    "message": "Olá! Esta é uma mensagem automática.",
    "delay": 2000,
    "sent": false,
    "sentBy": null,
    "sentAt": null
  }
]
```

- `phone`: número com DDI (ex.: `+55`).\
- `message`: texto a ser enviado.\
- `delay`: tempo em milissegundos entre mensagens (opcional).\
- `sent`: controle de envio (deve começar como `false`).\
- `sentBy`: conta (chip) que enviou a mensagem (preenchido automaticamente).\
- `sentAt`: data/hora do envio em ISO (preenchido automaticamente).\

## Uso rápido (1 conta- teste) 

Inicie um bot único apontando para o arquivo de contatos:

```bash
node index.js account_1 contacts.json
```

- Escaneie o QR Code no WhatsApp para autenticar.\
- O bot envia mensagens pendentes e permanece ativo para auto-respostas.

## Uso com múltiplas contas (orquestrador- principal)

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

Após enviar mensagens, o bot permanece ativo e espera a resposta do cliente. Caso o cliente responda ele requisita o CPF/CNPJ. Após a confirmação ele pede o email. Após as duas respostas o bot envia uma mensagem que em breve entraremos em contato.

## Google Sheets (captura de leads)

Quando o cliente envia CPF e e-mail, o bot registra os dados em uma planilha. Para habilitar:

1. Salve os arquivos `key.json` e `token.json` na raiz do projeto. (Usados para o acesso ao GoogleAPI)\
2. Garanta que a planilha tenha as colunas `Número`, `CPF/CNPJ`, `EMAIL` e `Data Registro`.\
3. Ajuste as variáveis de ambiente se necessário (o app lê automaticamente do arquivo `.env` na raiz):\
   - `GOOGLE_SHEET_ID`\
   - `GOOGLE_SHEET_RANGE` (ex.: `A:D`)
    -Configurados no .env
O campo **Data Registro** é preenchido no formato `dd/mm/aa - hh:mm`.

### .env (configuração obrigatória)

O projeto lê automaticamente um arquivo `.env` na raiz. Todos os valores abaixo são obrigatórios:

```
GOOGLE_SHEET_ID=
GOOGLE_SHEET_RANGE=
ERROR_REPORT_URL=
ERROR_REPORT_AUTH_TOKEN=
ERROR_REPORT_HEADER_KEY=
ERROR_REPORT_HEADER_VALUE=
SUCCESS_REPORT_URL=
SUCCESS_REPORT_HEADER_KEY=
SUCCESS_REPORT_HEADER_VALUE=
```

## Relato de erros (em standby- não usado, mas já configurado)

Em falhas de envio, o sistema tenta registrar erros em um endpoint configurado via `.env` (`ERROR_REPORT_URL`rtifique-se de ajustar a URL e o token conforme necessário. Quando ocorre um erro de envio pelo orquestrador, tato permanece com `sent: false` e recebe um `sentAt` com prefixo `ERROR_`, para que o reenvio aconteça s em uma próxima execução.

## Relato de sucesso (leads)

Após gravar o lead na planilha, o bot envia um POST para `SUCCESS_REPORT_URL` com o JSON:

```json
{
  "telefone": "5511999999999",
  "cpf_cnpj": "00000000000",
  "time": "dd/mm/aa - hh:mm"
}
```

## Dicas

- Para reenviar mensagens, altere `"sent": false` no `contacts.json`.\
- Use `delay` para reduzir risco de bloqueios.\
- Mantenha sessões autenticadas em ambientes estáveis.

## Obsersações
- O orquestrador de maneira inteligente, e quando digo inteligente digo aleatória usa os chips autenticados de maneira aleatória para fazer os disparos dos contatos cadastrados no contacts.json. Porém ele tem umas tratativas para diminuir a chance dos bloqueios:
  1. Os envios das mensagens são feitas de maneira aleatória, mas com a limitação de no máximo 3 envios consecutivos por chip (a menos que haja apenas 1 chip online).
  2. O envio das respostas e dos acionamentos possui um delay adicional de até 4s aleatório para que os tempos não sejam todos iguais. 

## To Do:
- Tratativa de desconexão de auth do chip caso o mesmo venha a ser bloqueado.
- Tratativa de 3 mensagens erradas o bot deixa de responder o cliente até o reinício do mesmo.