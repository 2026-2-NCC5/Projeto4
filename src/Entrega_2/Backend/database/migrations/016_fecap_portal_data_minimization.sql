-- O coletor experimental não deve manter conteúdo acadêmico/documental no ASA.
-- Mantém somente metadados mínimos para que a pessoa reconheça os itens do mapa.
update portal_discovered_routes
set route_key = md5(route_key),
    route_data = jsonb_build_object(
      'title', left(coalesce(route_data->>'title', 'Seção do portal'), 300),
      'category', left(coalesce(route_data->>'category', 'unclassified'), 80),
      'depth', case
        when (route_data->>'depth') ~ '^[0-8]$' then (route_data->>'depth')::integer
        else 0
      end
    ),
    content_hash = md5(jsonb_build_object(
      'title', left(coalesce(route_data->>'title', 'Seção do portal'), 300),
      'category', left(coalesce(route_data->>'category', 'unclassified'), 80),
      'depth', case when (route_data->>'depth') ~ '^[0-8]$' then (route_data->>'depth')::integer else 0 end
    )::text) || md5('safe-metadata:' || jsonb_build_object(
      'title', left(coalesce(route_data->>'title', 'Seção do portal'), 300),
      'category', left(coalesce(route_data->>'category', 'unclassified'), 80),
      'depth', case when (route_data->>'depth') ~ '^[0-8]$' then (route_data->>'depth')::integer else 0 end
    )::text);

-- Mensagens e caminhos de erro poderiam incluir URLs ou valores acadêmicos.
update portal_sync_sessions
set metadata = jsonb_build_object(
  'authStatus', left(coalesce(metadata->>'authStatus', 'unknown'), 40),
  'errorCount', greatest(coalesce((metadata->>'errorCount')::integer, case when jsonb_typeof(metadata->'errors') = 'array' then jsonb_array_length(metadata->'errors') else 0 end), 0)
)
where metadata ? 'errors' or metadata ? 'authStatus';

-- Os identificadores emitidos pelo cliente também não precisam ser guardados em claro.
update portal_sync_sessions set client_session_id = md5(client_session_id);
