/**
 * Cloudflare Pages Function — proxy da API
 * ------------------------------------------------------------------
 * O SPA React chama a API por `/api/*` no mesmo domínio. Quando o
 * front-end passa a ser servido pela edge (Cloudflare Pages), o
 * back-end continua na OCI, atrás do Cloudflare Tunnel. Esta função
 * encaminha `/api/*` para o hostname de origem da API.
 *
 * Variáveis de ambiente do projeto Pages:
 *   API_ORIGIN          ex.: https://api-equipe-sudo.kolpzs.com
 *   ORIGIN_SHARED_SECRET  (opcional) segredo enviado no header
 *                         X-Origin-Secret, validado pelo origin
 *
 * Sem API_ORIGIN configurado, responde 503 com uma mensagem clara em
 * vez de quebrar silenciosamente.
 */

const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'];

function targetUrl(origin, request, params) {
  const incoming = new URL(request.url);
  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const suffix = parts.map((p) => encodeURIComponent(p)).join('/');
  const url = new URL('/api/' + suffix, origin);
  url.search = incoming.search;
  return url;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const origin = env.API_ORIGIN;

  if (!origin) {
    return new Response(
      JSON.stringify({ status: 'error', message: 'API_ORIGIN não configurado no projeto Pages.' }),
      { status: 503, headers: { 'content-type': 'application/json' } }
    );
  }

  if (!ALLOWED_METHODS.includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Repassa apenas os headers relevantes (evita vazar/propagar Host, Cookie, etc.)
  const forwarded = new Headers();
  for (const name of ['accept', 'content-type', 'authorization', 'x-request-id', 'user-agent']) {
    const value = request.headers.get(name);
    if (value) forwarded.set(name, value);
  }
  // Preserva a origem real do cliente para os logs do back-end
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) forwarded.set('cf-connecting-ip', clientIp);
  if (env.ORIGIN_SHARED_SECRET) forwarded.set('x-origin-secret', env.ORIGIN_SHARED_SECRET);

  // Autenticação no Cloudflare Access do hostname de origem (Service Token).
  // Sem isso, o Access devolveria a página de login e a chamada falharia.
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    forwarded.set('cf-access-client-id', env.CF_ACCESS_CLIENT_ID);
    forwarded.set('cf-access-client-secret', env.CF_ACCESS_CLIENT_SECRET);
  }

  const init = {
    method: request.method,
    headers: forwarded,
    // Não seguir redirects (ex.: tela de login do Cloudflare Access)
    redirect: 'manual',
  };

  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstream = await fetch(targetUrl(origin, request, params).toString(), init);
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('x-proxied-by', 'cloudflare-pages-function');
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (err) {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'Falha ao contatar a API de origem.',
        error_type: err && err.name ? err.name : 'Error',
      }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }
}
