'use strict';

/*
 * Logger estruturado (JSON) — CyberVegas / equipe-sudo
 * ------------------------------------------------------------------
 * Cada evento e escrito no stdout como uma unica linha JSON e, quando o
 * SDK de OpenTelemetry esta ativo, tambem encaminhado como LogRecord via
 * OTLP para o collector (que persiste no Loki).
 *
 * Campos fixos: ts (UTC ISO-8601), level, service, environment, event.
 * Campos variaveis: request_id, trace_id, span_id, method, route, path,
 * status_code, duration_ms, outcome, error_type, error_message...
 *
 * Nao registrar senhas, tokens, credenciais, strings de conexao ou dados
 * pessoais.
 */

const { logs, SeverityNumber } = require('@opentelemetry/api-logs');
const { trace } = require('@opentelemetry/api');

const SERVICE = process.env.OTEL_SERVICE_NAME || 'equipe-sudo-backend';
const ENVIRONMENT = process.env.DEPLOYMENT_ENVIRONMENT || 'dev';

const SEVERITY = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

let otelLogger = null;
function getOtelLogger() {
  if (otelLogger) return otelLogger;
  try {
    otelLogger = logs.getLogger(SERVICE);
  } catch (_) {
    otelLogger = null;
  }
  return otelLogger;
}

function emit(level, event, fields) {
  const record = Object.assign(
    {
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      environment: ENVIRONMENT,
      event,
    },
    fields || {}
  );

  const span = trace.getActiveSpan();
  if (span) {
    const ctx = span.spanContext();
    if (ctx && ctx.traceId && !/^0+$/.test(ctx.traceId)) {
      record.trace_id = ctx.traceId;
      record.span_id = ctx.spanId;
    }
  }

  process.stdout.write(JSON.stringify(record) + '\n');

  const logger = getOtelLogger();
  if (logger) {
    try {
      const attributes = Object.assign(
        { level, service: SERVICE, environment: ENVIRONMENT, event },
        fields || {}
      );
      logger.emit({
        severityNumber: SEVERITY[level] || SEVERITY.info,
        severityText: level.toUpperCase(),
        // body = linha JSON completa: permite consultar no Loki com `| json`
        // e manter paridade com o que aparece no `docker logs`.
        body: JSON.stringify(record),
        timestamp: Date.now(),
        attributes,
      });
    } catch (_) {
      /* nao deixar a observabilidade derrubar a aplicacao */
    }
  }

  return record;
}

module.exports = {
  debug: (event, fields) => emit('debug', event, fields),
  info: (event, fields) => emit('info', event, fields),
  warn: (event, fields) => emit('warn', event, fields),
  error: (event, fields) => emit('error', event, fields),
};
