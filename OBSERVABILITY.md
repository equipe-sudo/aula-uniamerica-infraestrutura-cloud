# Observabilidade serverless — Cloudflare Pages + Oracle + Grafana Cloud

Esta implementação mantém a camada de observabilidade compatível com a arquitetura
serverless/edge do projeto.

## Arquitetura

```text
Browser
  |
  | React + web-vitals
  v
Cloudflare Pages
  |
  +-- /api/* ---------------------------> Oracle Cloud Backend
  |
  +-- /telemetry/browser ---------------> Grafana Cloud OTLP
  |       Pages Function                    metrics + browser errors
  |
  +-- /telemetry/otlp/v1/{signal} ------> Grafana Cloud OTLP
          Pages Function
                 ^
                 |
                 | OTLP/HTTP protobuf
                 |
          Oracle Cloud Backend
```

Não é necessário executar Grafana, Prometheus, Loki ou OpenTelemetry Collector
como containers permanentes na Oracle.

## 1. Variáveis e secrets no Cloudflare Pages

No projeto Pages, configure em **Settings > Variables and Secrets**:

### Variáveis

- `GRAFANA_OTLP_ENDPOINT`
  - Exemplo: `https://otlp-gateway-prod-REGION.grafana.net/otlp`
  - Copie o valor do card **OpenTelemetry** da sua stack Grafana Cloud.
- `GRAFANA_OTLP_USERNAME`
  - O **OTLP Instance ID** mostrado no mesmo card.
- `FRONTEND_SERVICE_NAME`
  - Sugestão: `equipe-sudo-frontend`
- `DEPLOYMENT_ENVIRONMENT`
  - Sugestão: `production`

### Secrets

- `GRAFANA_OTLP_TOKEN`
  - Access Policy token do Grafana Cloud com escopos OTLP de escrita.
- `OTEL_INGRESS_SECRET`
  - Segredo aleatório usado somente entre a Oracle e a Pages Function.

Não coloque esses valores no bundle React.

## 2. Backend Oracle

O backend já possui OpenTelemetry. Configure:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=https://SEU-DOMINIO/telemetry/otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_HEADERS=X-Telemetry-Secret=COLOQUE_AQUI_O_MESMO_OTEL_INGRESS_SECRET

OTEL_SERVICE_NAME=equipe-sudo-backend
DEPLOYMENT_ENVIRONMENT=production
APP_VERSION=1.0.0
```

O SDK acrescenta automaticamente:

- `/v1/metrics`
- `/v1/logs`

ao endpoint OTLP base.

O token do Grafana Cloud fica somente no Cloudflare Pages, não na VM Oracle.

## 3. Frontend

O projeto já possui `web-vitals`. O arquivo `frontend/src/telemetry.js` envia:

- CLS
- FID
- FCP
- LCP
- TTFB
- erros JavaScript de `window.error`
- `unhandledrejection`

para `/telemetry/browser`.

A Pages Function converte os eventos para OTLP/HTTP JSON e envia ao Grafana Cloud.

Métricas produzidas:

- `frontend_web_vital_cls`
- `frontend_web_vital_fid_seconds`
- `frontend_web_vital_fcp_seconds`
- `frontend_web_vital_lcp_seconds`
- `frontend_web_vital_ttfb_seconds`

> Observação: a versão atual do projeto usa `web-vitals@2.1.4`, portanto mede FID.
> Em uma atualização futura para uma versão moderna do pacote, FID deve ser
> substituído por INP.

## 4. Consultas sugeridas no Grafana

Dependendo da normalização aplicada pelo Grafana Cloud, os nomes de labels OTel
são convertidos para formato Prometheus.

### LCP médio

```promql
avg(frontend_web_vital_lcp_seconds)
```

### CLS médio

```promql
avg(frontend_web_vital_cls)
```

### Requisições por segundo do backend

```promql
sum(rate(app_http_requests_total[5m]))
```

### Erros HTTP 5xx

```promql
sum(
  rate(
    app_http_requests_total{
      http_response_status_code=~"5.."
    }[5m]
  )
)
```

### p95 de latência HTTP

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(app_http_request_duration_seconds_bucket[5m])
  )
)
```

### Falhas de banco

```promql
sum(
  rate(
    app_db_operations_total{
      outcome="failure"
    }[5m]
  )
)
```

## 5. Disponibilidade externa

Para medir uptime real do Pages e do backend sem rodar Blackbox Exporter,
crie checks no **Grafana Cloud Synthetic Monitoring** para:

- `https://SEU-SITE/`
- `https://SEU-SITE/api/health` ou o endpoint público equivalente

Isso mantém a observabilidade gerenciada/serverless.

## 6. Segurança

- `GRAFANA_OTLP_TOKEN` é secret do Cloudflare.
- `OTEL_INGRESS_SECRET` impede ingestão arbitrária no proxy OTLP.
- O browser só chama um endpoint same-origin.
- O browser nunca recebe o token Grafana.
- A Pages Function só aceita `/v1/metrics`, `/v1/logs` e `/v1/traces`.
- Payload do browser é limitado e validado.
- Telemetria nunca deve conter senha, token, cookie ou conteúdo privado de tarefas.

## 7. Referências

- Cloudflare Pages Functions:
  https://developers.cloudflare.com/pages/functions/
- Cloudflare Pages bindings/secrets:
  https://developers.cloudflare.com/pages/functions/bindings/
- Grafana Cloud OTLP:
  https://grafana.com/docs/grafana-cloud/observe-and-act/send-data/otlp/
- Grafana OTLP format considerations:
  https://grafana.com/docs/grafana-cloud/observe-and-act/send-data/otlp/otlp-format-considerations/
