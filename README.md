# AutoWpp

Orquestrador robusto para envio automático de mensagens no WhatsApp usando múltiplas contas, com balanceamento de carga inteligente e sistema de auto-resposta.

O projeto foi atualizado para garantir estabilidade, evitando conflitos de navegador e garantindo que cada conta envie apenas suas mensagens atribuídas.

## Visão geral

O sistema opera com dois componentes principais:

1.  **`orchestrator.py`**: Gerencia o ciclo de vida completo. Busca dados do banco de dados, controla as sessões do WhatsApp, aguarda a autenticação de todas as contas e gera a distribuição de contatos.
2.  **`index.js`**: Cliente do WhatsApp (Node.js). Responsável por conectar, autenticar, enviar as mensagens atribuídas e capturar leads (CPF/E-mail) via auto-resposta.

## Fluxo de Execução (3 Fases)

Para evitar erros de "navegador já em execução" e garantir distribuição correta, o `orchestrator.py` segue um fluxo estrito de 3 fases:

1.  **Fase 1: Autenticação**
    *   Inicia todas as contas definidas (`account_1`, `account_2`, etc).
    *   Exibe os QR Codes para cada conta.
    *   **Aguarda que TODAS as contas sejam autenticadas com sucesso.**
    *   O sistema limpa o `contacts.json` temporariamente para evitar envios prematuros com dados antigos.

2.  **Fase 2: Configuração e Distribuição**
    *   Interrompe os bots para liberar os processos do navegador.
    *   Busca os dados no banco de dados (SQL Server configurado em `settings.py`).
    *   Gera o arquivo `contacts.json` distribuindo os contatos **alternadamente** apenas entre as contas que foram autenticadas com sucesso na Fase 1.

3.  **Fase 3: Envio e Monitoramento**
    *   Reinicia os bots (eles fazem login automático usando a sessão salva).
    *   Cada bot lê o `contacts.json`, filtra apenas os contatos onde `sentBy` corresponde ao seu ID e inicia o envio.
    *   Os bots permanecem ativos após o envio para processar respostas (auto-resposta).

## Requisitos

- **Node.js** 18+ (recomendado)
- **Python** 3.8+
- **Bibliotecas Python:**
    - `pandas`
    - `pyodbc`
    - (Instale via `pip install pandas pyodbc`)
- **Dependências Node:**
    - `whatsapp-web.js`
    - `qrcode-terminal`
    - `axios`
    - `googleapis`

Instale as dependências com:

```bash
npm install whatsapp-web.js qrcode-terminal axios googleapis
pip install pandas pyodbc
```

## Configuração

### 1. Variáveis de Ambiente (`.env`)
Crie um arquivo `.env` na raiz do projeto com as seguintes configurações:

```env
# Google Sheets
GOOGLE_SHEET_ID=
GOOGLE_SHEET_RANGE=A:D

# Relatórios de Erro (Opcional)
ERROR_REPORT_URL=
ERROR_REPORT_AUTH_TOKEN=
ERROR_REPORT_HEADER_KEY=
ERROR_REPORT_HEADER_VALUE=

# Relatórios de Sucesso (Opcional)
SUCCESS_REPORT_URL=
SUCCESS_REPORT_HEADER_KEY=
SUCCESS_REPORT_HEADER_VALUE=
```

### 2. Banco de Dados (`settings.py`)
Certifique-se de que o arquivo `settings.py` (importado no Python) contém as credenciais do banco de dados e a query SQL (`QUERY_NEGOCIADOR_BY_CPF`).

## Estrutura do arquivo `contacts.json`

Este arquivo é gerado **automaticamente** pelo orquestrador na Fase 2. Não é necessário editá-lo manualmente.

Exemplo de estrutura:

```json
[
  {
    "phone": "+5511999999999",
    "message": "Olá! Temos uma proposta para você.",
    "delay": 30000,
    "sent": false,
    "sentBy": "account_1",
    "sentAt": null
  },
  {
    "phone": "+5531999999999",
    "message": "Olá! Temos uma proposta para você.",
    "delay": 30000,
    "sent": false,
    "sentBy": "account_2",
    "sentAt": null
  }
]
```

- **`sentBy`**: Campo crucial. Define exatamente qual conta deve enviar a mensagem. O bot verifica isso e ignora contatos de outros IDs.
- **`sent`**: Atualizado automaticamente para `true` após o envio.
- **`delay`**: Tempo de espera (em ms) entre mensagens de uma mesma conta.

## Como Executar

### Modo Principal (Orquestrador)

Use o script Python para iniciar todo o processo. Ele cuidará de tudo (autenticação, distribuição e envio).

```bash
python3 orchestrator.py
```

### Comandos Disponíveis (Durante a execução)

Após os bots iniciarem e começarem a enviar, você pode interagir com o terminal:

- **`status`**: Mostra o status de cada conta (Autenticado/Não Autenticado) e se está rodando.
- **`stats`**: Mostra estatísticas detalhadas (Total, Enviados, Falhas, erros por conta).
- **`terminate`**: Para todos os bots de forma segura e encerra o script.

### Modo Depuração (Única Conta)

Para testar uma única conta sem o orquestrador, você pode rodar o Node diretamente:

```bash
node index.js account_1 contacts.json
```

*Nota: Certifique-se de que o `contacts.json` existe e tem contatos atribuídos a `account_1`.*

## Funcionalidades

### Auto-resposta e Captura de Leads
Após o envio da mensagem inicial, os bots ficam escutando respostas. O fluxo é:
1. Cliente responde.
2. Bot pede **CPF ou CNPJ**.
3. Bot pede **E-mail**.
4. Bot grava os dados na Google Sheets e envia para o endpoint de sucesso configurado.

### Balanceamento Inteligente
O orquestrador distribui os contatos de forma alternada entre as contas disponíveis.
- Se você tem 100 contatos e 2 contas autenticadas: Cada conta enviará para 50 contatos.
- Se você tem 100 contatos e apenas 1 conta autentica: Essa conta enviará as 100 mensagens.
- **Segurança:** Existe um delay inicial de 4 segundos entre o start de cada conta para evitar conflitos de recursos no Puppeteer.

### Tratamento de Falhas
- Se um envio falhar, o contato permanece como `sent: false` e recebe um registro de erro no `sentAt`.
- O erro é reportado ao `ERROR_REPORT_URL` se configurado.

## Solução de Problemas (Troubleshooting)

**Erro: "The browser is already running for..."**
- **Causa:** Tentou rodar duas instâncias com o mesmo `accountId` ou conflito de sessão.
- **Solução:** O orquestrador atual já lida com isso separando as fases e garantindo que os bots sejam parados antes de reiniciar.

**Uma conta não está enviando nada.**
- Verifique o comando `stats`. Se a conta não aparecer na lista de envios, verifique se ela se autenticou na Fase 1.
- Verifique o `contacts.json` gerado: os campos `sentBy` estão corretos?

**Os bots estão enviando mensagens duplicadas.**
- Certifique-se de que você rodou via `python3 orchestrator.py` e não iniciou processos `node` manualmente ao mesmo tempo. O arquivo `contacts.json` deve ser único e centralizado.

## To-Do (Pendências)
- Tratativa avançada de desconexão forçada (banimento) e auto-reconexão.
- Lógica para pausar envios automaticamente após detectar alto volume de erros de envio.