const WEB_VITALS = {
  CLS: { metricName: 'frontend_web_vital_cls', unit: '1', multiplier: 1 },
  FID: { metricName: 'frontend_web_vital_fid_seconds', unit: 's', multiplier: 0.001 },
  FCP: { metricName: 'frontend_web_vital_fcp_seconds', unit: 's', multiplier: 0.001 },
  LCP: { metricName: 'frontend_web_vital_lcp_seconds', unit: 's', multiplier: 0.001 },
  TTFB: { metricName: 'frontend_web_vital_ttfb_seconds', unit: 's', multiplier: 0.001 },
};

function stringAttribute(key, value) {
  return {
    key,
    value: { stringValue: String(value) },
  };
}

function intAttribute(key, value) {
  return {
    key,
    value: { intValue: String(value) },
  };
}

function nowUnixNano() {
  return (BigInt(Date.now()) * 1000000n).toString();
}

function cleanPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  return value.slice(0, 256);
}

function cleanString(value, maxLength = 1024) {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, maxLength);
}

function grafanaEndpoint(base, signalPath) {
  return `${String(base || '').replace(/\/+$/, '')}/${signalPath}`;
}

function authHeader(env) {
  return `Basic ${btoa(`${env.GRAFANA_OTLP_USERNAME}:${env.GRAFANA_OTLP_TOKEN}`)}`;
}

function resource(env) {
  return {
    attributes: [
      stringAttribute('service.name', env.FRONTEND_SERVICE_NAME || 'equipe-sudo-frontend'),
      stringAttribute('deployment.environment', env.DEPLOYMENT_ENVIRONMENT || 'production'),
      stringAttribute('cloud.platform', 'cloudflare_pages'),
    ],
  };
}

function metricPayload(env, body) {
  const definition = WEB_VITALS[body.name];
  const pointAttributes = [
    stringAttribute('page.route', cleanPath(body.path)),
    stringAttribute('web_vital.name', body.name),
  ];

  if (body.rating) {
    pointAttributes.push(stringAttribute('web_vital.rating', cleanString(body.rating, 32)));
  }
  if (body.navigationType) {
    pointAttributes.push(
      stringAttribute('navigation.type', cleanString(body.navigationType, 64))
    );
  }

  return {
    resourceMetrics: [
      {
        resource: resource(env),
        scopeMetrics: [
          {
            scope: {
              name: 'cloudflare-pages-browser-telemetry',
              version: '1.0.0',
            },
            metrics: [
              {
                name: definition.metricName,
                description: `Real User Monitoring Web Vital ${body.name}`,
                unit: definition.unit,
                gauge: {
                  dataPoints: [
                    {
                      attributes: pointAttributes,
                      timeUnixNano: nowUnixNano(),
                      asDouble: body.value * definition.multiplier,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function logPayload(env, body) {
  const attributes = [
    stringAttribute('event.name', 'frontend.browser.error'),
    stringAttribute('page.route', cleanPath(body.path)),
    stringAttribute('error.type', cleanString(body.errorType, 128) || 'browser.error'),
  ];

  if (Number.isFinite(body.line)) attributes.push(intAttribute('code.line.number', body.line));
  if (Number.isFinite(body.column)) attributes.push(intAttribute('code.column.number', body.column));
  if (body.source) attributes.push(stringAttribute('code.file.path', cleanString(body.source, 512)));
  if (body.stack) attributes.push(stringAttribute('exception.stacktrace', cleanString(body.stack, 4096)));

  return {
    resourceLogs: [
      {
        resource: resource(env),
        scopeLogs: [
          {
            scope: {
              name: 'cloudflare-pages-browser-telemetry',
              version: '1.0.0',
            },
            logRecords: [
              {
                timeUnixNano: nowUnixNano(),
                severityNumber: 17,
                severityText: 'ERROR',
                body: {
                  stringValue: cleanString(body.message, 1024) || 'Browser error',
                },
                attributes,
              },
            ],
          },
        ],
      },
    ],
  };
}

async function pushToGrafana(env, signalPath, payload) {
  const response = await fetch(grafanaEndpoint(env.GRAFANA_OTLP_ENDPOINT, signalPath), {
    method: 'POST',
    headers: {
      authorization: authHeader(env),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(
      JSON.stringify({
        event: 'grafana.otlp.failed',
        signal: signalPath,
        status: response.status,
        response: text.slice(0, 500),
      })
    );
  }

  return response.ok;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GRAFANA_OTLP_ENDPOINT || !env.GRAFANA_OTLP_USERNAME || !env.GRAFANA_OTLP_TOKEN) {
    return new Response('Telemetry destination not configured', { status: 503 });
  }

  // Este endpoint foi desenhado para o proprio site. Bloqueia POST cross-origin.
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) {
        return new Response('Forbidden', { status: 403 });
      }
    } catch (_) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 16 * 1024) {
    return new Response('Payload Too Large', { status: 413 });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return new Response('Invalid JSON', { status: 400 });
  }

  try {
    if (body.kind === 'web_vital') {
      const definition = WEB_VITALS[body.name];
      if (!definition || !Number.isFinite(body.value) || body.value < 0) {
        return new Response('Invalid metric', { status: 400 });
      }

      const ok = await pushToGrafana(env, 'v1/metrics', metricPayload(env, body));
      return new Response(null, { status: ok ? 204 : 502 });
    }

    if (body.kind === 'error') {
      const ok = await pushToGrafana(env, 'v1/logs', logPayload(env, body));
      return new Response(null, { status: ok ? 204 : 502 });
    }

    return new Response('Unsupported telemetry event', { status: 400 });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'browser.telemetry.failed',
        error_type: err && err.name ? err.name : 'Error',
        error_message: err && err.message ? err.message : String(err),
      })
    );
    return new Response('Telemetry forwarding failed', { status: 502 });
  }
}

export function onRequest() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { allow: 'POST' },
  });
}
