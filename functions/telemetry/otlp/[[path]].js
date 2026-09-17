const ALLOWED_SIGNAL_PATHS = new Set(['v1/metrics', 'v1/logs', 'v1/traces']);

function grafanaEndpoint(base, signalPath) {
  return `${String(base || '').replace(/\/+$/, '')}/${signalPath}`;
}

function authHeader(env) {
  return `Basic ${btoa(`${env.GRAFANA_OTLP_USERNAME}:${env.GRAFANA_OTLP_TOKEN}`)}`;
}

function requestedSignalPath(params) {
  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  return parts.join('/');
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { allow: 'POST' },
    });
  }

  if (
    !env.GRAFANA_OTLP_ENDPOINT ||
    !env.GRAFANA_OTLP_USERNAME ||
    !env.GRAFANA_OTLP_TOKEN ||
    !env.OTEL_INGRESS_SECRET
  ) {
    return new Response('Telemetry gateway not configured', { status: 503 });
  }

  const ingressSecret = request.headers.get('x-telemetry-secret');
  if (!ingressSecret || ingressSecret !== env.OTEL_INGRESS_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const signalPath = requestedSignalPath(params);
  if (!ALLOWED_SIGNAL_PATHS.has(signalPath)) {
    return new Response('Not Found', { status: 404 });
  }

  const forwarded = new Headers();
  forwarded.set('authorization', authHeader(env));
  forwarded.set(
    'content-type',
    request.headers.get('content-type') || 'application/x-protobuf'
  );

  for (const headerName of ['content-encoding', 'accept']) {
    const value = request.headers.get(headerName);
    if (value) forwarded.set(headerName, value);
  }

  try {
    const upstream = await fetch(grafanaEndpoint(env.GRAFANA_OTLP_ENDPOINT, signalPath), {
      method: 'POST',
      headers: forwarded,
      body: request.body,
      redirect: 'manual',
    });

    const responseHeaders = new Headers();
    const contentType = upstream.headers.get('content-type');
    const contentEncoding = upstream.headers.get('content-encoding');
    if (contentType) responseHeaders.set('content-type', contentType);
    if (contentEncoding) responseHeaders.set('content-encoding', contentEncoding);
    responseHeaders.set('x-telemetry-gateway', 'cloudflare-pages');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'otlp.proxy.failed',
        signal: signalPath,
        error_type: err && err.name ? err.name : 'Error',
        error_message: err && err.message ? err.message : String(err),
      })
    );

    return new Response('OTLP upstream unavailable', { status: 502 });
  }
}
