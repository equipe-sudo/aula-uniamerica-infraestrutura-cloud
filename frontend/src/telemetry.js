const TELEMETRY_ENDPOINT = '/telemetry/browser';

function trimString(value, maxLength) {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, maxLength);
}

function send(payload) {
  const body = JSON.stringify(payload);

  // keepalive permite que a requisicao termine mesmo durante unload/navegacao.
  fetch(TELEMETRY_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body,
    keepalive: true,
    credentials: 'same-origin',
  }).catch(() => {
    // Observabilidade nunca deve quebrar a aplicacao.
  });
}

export function sendWebVital(metric) {
  if (!metric || typeof metric.name !== 'string' || !Number.isFinite(metric.value)) {
    return;
  }

  send({
    kind: 'web_vital',
    name: metric.name,
    value: metric.value,
    delta: Number.isFinite(metric.delta) ? metric.delta : undefined,
    rating: trimString(metric.rating, 32),
    navigationType: trimString(metric.navigationType, 64),
    path: window.location.pathname,
  });
}

export function installFrontendErrorTelemetry() {
  window.addEventListener('error', (event) => {
    send({
      kind: 'error',
      errorType: 'window.error',
      message: trimString(event.message || 'Unhandled browser error', 1024),
      stack: trimString(event.error && event.error.stack, 4096),
      source: trimString(event.filename, 512),
      line: Number.isFinite(event.lineno) ? event.lineno : undefined,
      column: Number.isFinite(event.colno) ? event.colno : undefined,
      path: window.location.pathname,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      reason && typeof reason.message === 'string'
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection';

    send({
      kind: 'error',
      errorType: 'unhandledrejection',
      message: trimString(message, 1024),
      stack: trimString(reason && reason.stack, 4096),
      path: window.location.pathname,
    });
  });
}
