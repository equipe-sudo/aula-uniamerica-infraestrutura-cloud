# Backend — Todo App (Express + MongoDB) com OpenTelemetry

API Express usada pela aplicação. Além das rotas originais, esta versão é **instrumentada com
OpenTelemetry** para alimentar os painéis de observabilidade da Entrega Final 02.

## Rotas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/todos` | Lista todas as tarefas |
| POST | `/todos` | Cria uma tarefa (`{ "text": "..." }`) |
| PATCH | `/todos/:id` | Alterna `completed` |
| DELETE | `/todos/:id` | Remove a tarefa |
| GET | `/health` | Liveness — `200 {"status":"ok"}` |
| GET | `/health/ready` | Readiness — `200` com MongoDB conectado, `503` caso contrário |

> Aplicação exposta em `:5000`. O acesso público é sempre por `/api/*` no domínio, via nginx.

## Instrumentação

| Arquivo | Papel |
|---|---|
| `instrumentation.js` | Inicializa o SDK (`--require`). Só ativa se `OTEL_EXPORTER_OTLP_ENDPOINT` estiver definido |
| `logger.js` | Logger JSON no stdout + `LogRecord` OTLP |
| `index.js` | Métricas HTTP e de banco, contadores de negócio, logs de acesso e de erro |

### Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `MONGO_URI` | `mongodb://root:rootpassword@mongo-todo:27017/todo-app?authSource=admin` | Conexão com o MongoDB |
| `PORT` | `5000` | Porta HTTP |
| `OTEL_SERVICE_NAME` | `equipe-sudo-backend` | Nome do serviço nas métricas/logs |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | *(vazio)* | Se vazio, o SDK **não** inicializa (útil no dev local) |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` | Protocolo OTLP |
| `OTEL_TRACES_EXPORTER` | `none` | Sem backend de traces |
| `DEPLOYMENT_ENVIRONMENT` | `dev` | Ambiente nos recursos de telemetria |
| `APP_VERSION` | `unknown` | Versão/SHA da aplicação |

### Métricas emitidas

`app_http_requests_total`, `app_http_request_duration_seconds`,
`app_todos_operations_total`, `app_db_operations_total`, `app_db_operation_duration_seconds`.

### Formato dos logs (JSON)

```json
{"ts":"2026-09-15T15:11:31.502Z","level":"warn","service":"equipe-sudo-backend","environment":"dev","event":"todos.create.invalid","request_id":"2482c5e3-1598-42d1-a0c6-53d325adc2bc","reason":"missing_text"}
```

O campo `request_id` correlaciona todos os registros de uma mesma requisição.
**Não** são registrados senhas, tokens, credenciais, strings de conexão nem dados pessoais.

## Rodar localmente

```bash
npm install
MONGO_URI="mongodb://root:rootpassword@localhost:27017/todo-app?authSource=admin" npm start

# com observabilidade (endpoint OTLP de um coletor disponível)
MONGO_URI="..." \
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318" \
OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf" \
npm start
```

## Build da imagem

```bash
docker build -t equipe-sudo-backend .
```
