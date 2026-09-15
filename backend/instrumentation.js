'use strict';

/*
 * OpenTelemetry — inicializacao do SDK
 * ------------------------------------------------------------------
 * Carregado antes da aplicacao (`node --require ./instrumentation.js index.js`).
 *
 * O SDK so e habilitado quando OTEL_EXPORTER_OTLP_ENDPOINT esta definido.
 * Isso permite rodar a aplicacao localmente sem collector nenhum.
 *
 * Sinais exportados (OTLP/HTTP protobuf):
 *   - metricas  (OTEL_EXPORTER_OTLP_ENDPOINT -> /v1/metrics)
 *   - logs      (OTEL_EXPORTER_OTLP_ENDPOINT -> /v1/logs)
 *
 * Traces ficam desabilitados por padrao para economizar CPU/RAM na VM de
 * 1 GB (nao ha backend de traces/Tempo no ambiente). A correlacao entre
 * eventos e feita pelo campo `request_id` presente em todos os logs.
 */

const endpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '').trim();
const disabled = process.env.OTEL_SDK_DISABLED === 'true';
const enabled = endpoint !== '' && !disabled;

if (enabled) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
  const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-proto');
  const { resourceFromAttributes } = require('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'equipe-sudo-backend',
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || 'unknown',
    'deployment.environment': process.env.DEPLOYMENT_ENVIRONMENT || 'dev',
  });

  const sdk = new NodeSDK({
    resource,
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({}),
      exportIntervalMillis: 15000,
    }),
    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({}) }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  try {
    sdk.start();
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        service: process.env.OTEL_SERVICE_NAME || 'equipe-sudo-backend',
        event: 'otel.sdk.started',
        otel_endpoint: endpoint,
      }) + '\n'
    );
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        service: process.env.OTEL_SERVICE_NAME || 'equipe-sudo-backend',
        event: 'otel.sdk.start_failed',
        error_type: err.name,
        error_message: err.message,
      }) + '\n'
    );
  }

  const shutdown = () => {
    sdk
      .shutdown()
      .catch(() => {})
      .finally(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { otelEnabled: enabled };
