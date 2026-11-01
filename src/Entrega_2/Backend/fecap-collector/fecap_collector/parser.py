from __future__ import annotations

import hashlib
import re
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

from scrapling import Selector

from .models import DiscoveredLink, FormField, FormInventory, PortalRoute, PortalTable

DENIED_ACTION_WORDS = (
    "pagar",
    "pagamento",
    "boleto",
    "cancelar",
    "excluir",
    "apagar",
    "remover",
    "enviar requerimento",
    "protocolar",
    "matricular",
    "rematrícula",
    "trancar",
    "assinar",
    "aceitar",
    "confirmar envio",
    "salvar",
    "submeter",
    "finalizar solicitação",
    "alterar cadastro",
    "comprar",
    "solicitar",
    "solicitação",
    "solicitacao",
    "inscrever",
    "incluir",
    "gravar",
    "editar",
    "atualizar",
    "enviar",
    "submit",
    "create",
    "delete",
    "remove",
    "update",
    "confirm",
    "matrícula",
    "matricula",
)
SECRET_QUERY_KEYS = {
    "token",
    "access_token",
    "code",
    "session",
    "sessionid",
    "session_key",
    "ticket",
    "authorization",
    "auth",
    "key",
}
DOCUMENT_SUFFIXES = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".odt", ".png", ".jpg")


def clean_text(value: str | None, max_length: int = 5000) -> str:
    if not value:
        return ""
    value = re.sub(r"\s+", " ", value).strip()
    return value[:max_length]


def safe_route_url(url: str) -> str:
    parsed = urlparse(url)

    def redact(query_string: str) -> str:
        return urlencode(
            [
                (key, "[redacted]" if key.lower() in SECRET_QUERY_KEYS else value)
                for key, value in parse_qsl(query_string, keep_blank_values=True)
            ]
        )

    fragment = parsed.fragment
    if "?" in fragment:
        fragment_path, fragment_query = fragment.split("?", 1)
        fragment = f"{fragment_path}?{redact(fragment_query)}"
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, redact(parsed.query), fragment))


def route_in_scope(url: str, portal_origin: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and f"{parsed.scheme}://{parsed.netloc}" == portal_origin


def is_read_only_candidate(label: str, href: str) -> bool:
    text = f"{label} {href}".lower()
    return not any(word in text for word in DENIED_ACTION_WORDS)


def categorize(title: str, route: str, text: str) -> str:
    value = f"{title} {route} {text[:400]}".lower()
    if any(word in value for word in ("estágio", "estagio", "termo de compromisso", "plano de atividades")):
        return "internship"
    if any(word in value for word in ("requerimento", "solicitação", "solicitacao", "protocolo")):
        return "requirements"
    if any(word in value for word in ("frequência", "frequencia", "nota", "avaliação", "avaliacao")):
        return "academic"
    if any(word in value for word in ("financeiro", "parcela", "mensalidade", "boleto")):
        return "financial"
    if any(word in value for word in ("documento", "declaração", "declaracao", "histórico", "historico")):
        return "documents"
    return "unclassified"


def _accessible_name(element: Selector) -> str:
    return clean_text(
        element.attrib.get("aria-label")
        or element.attrib.get("title")
        or element.get_all_text()
        or element.attrib.get("value")
        or element.attrib.get("placeholder"),
        300,
    )


def _state_signature(route: str, title: str, breadcrumbs: list[str], selected: list[str]) -> str:
    canonical = "|".join((route, title.strip().lower(), "/".join(breadcrumbs), "/".join(selected)))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def parse_page(
    html: str | bytes,
    current_url: str,
    portal_origin: str,
    parent_route: str | None,
    depth: int,
    *,
    state_label: str | None = None,
) -> tuple[PortalRoute, list[str]]:
    selector = Selector(html, url=current_url)
    title = (
        clean_text(selector.css("title::text").get("") or selector.css("h1::text").get(""), 300) or "Página sem título"
    )
    route_path = safe_route_url(current_url)
    route_bits = [
        clean_text(node.get_all_text(), 200)
        for node in selector.css(
            "nav[aria-label*=breadcrumb i] a, [aria-label*=breadcrumb i] a, .breadcrumb a, .breadcrumb li"
        )
    ]
    breadcrumbs = [item for item in route_bits if item]
    active = [
        clean_text(node.get_all_text() or node.attrib.get("aria-label"), 200)
        for node in selector.css("[aria-current=page], [aria-selected=true], .active[role=tab]")
    ]
    if state_label:
        active.append(state_label)
    links: list[DiscoveredLink] = []
    pending: list[str] = []
    documents: list[DiscoveredLink] = []
    for anchor in selector.css("a[href]"):
        href = anchor.attrib.get("href", "").strip()
        label = _accessible_name(anchor)
        if not href or href.startswith(("javascript:", "mailto:", "tel:")):
            continue
        target = urljoin(current_url, href)
        in_scope = route_in_scope(target, portal_origin)
        if in_scope:
            parsed = urlparse(target)
            if any(key.lower() in SECRET_QUERY_KEYS for key, _ in parse_qsl(parsed.query, keep_blank_values=True)):
                in_scope = False
        document = href.split("?", 1)[0].lower().endswith(DOCUMENT_SUFFIXES)
        safe = is_read_only_candidate(label, href)
        item = DiscoveredLink(
            label=label or "Link sem rótulo",
            url=safe_route_url(target),
            relation="document" if document else "link",
            in_scope=in_scope,
            read_only_candidate=safe,
        )
        links.append(item)
        if document:
            documents.append(item)
        if in_scope and safe and not document:
            pending.append(target)

    tabs = [
        name for name in (_accessible_name(node) for node in selector.css("[role=tab], [role=tablist] button")) if name
    ]
    tables: list[PortalTable] = []
    for table in selector.css("table"):
        headers = [clean_text(cell.get_all_text(), 300) for cell in table.css("thead th, tr:first-child th")]
        rows: list[list[str]] = []
        for row in table.css("tr"):
            values = [clean_text(cell.get_all_text(), 1000) for cell in row.css("th, td")]
            if values and any(values):
                rows.append(values)
        if rows:
            tables.append(PortalTable(headers=headers, rows=rows[:500]))

    forms: list[FormInventory] = []
    for form in selector.css("form"):
        fields: list[FormField] = []
        for control in form.css("input, select, textarea"):
            field_type = control.attrib.get("type", control.tag.lower())
            if field_type.lower() in {"password", "hidden", "submit", "button"}:
                continue
            field_name = control.attrib.get("name") or control.attrib.get("id")
            label = control.attrib.get("aria-label") or control.attrib.get("placeholder") or ""
            if not label and field_name:
                matching = next(
                    (
                        label_node.get_all_text()
                        for label_node in selector.css("label[for]")
                        if label_node.attrib.get("for") == field_name
                    ),
                    "",
                )
                label = matching or field_name.replace("_", " ").replace("-", " ")
            fields.append(
                FormField(
                    label=clean_text(label, 300) or "Campo sem rótulo",
                    field_type=field_type[:40],
                    required="required" in control.attrib,
                    name=field_name[:200] if field_name else None,
                )
            )
        if fields:
            forms.append(
                FormInventory(
                    label=clean_text(
                        form.attrib.get("aria-label") or form.attrib.get("name") or "Formulário consultivo", 300
                    ),
                    fields=fields[:100],
                )
            )

    text = clean_text(selector.get_all_text(), 20_000)
    category = categorize(title, route_path, text)
    route_id = _state_signature(route_path, title, breadcrumbs, active)[:24]
    result = PortalRoute(
        route_id=route_id,
        title=title,
        route=route_path,
        parent_route=parent_route,
        breadcrumbs=breadcrumbs,
        state_signature=_state_signature(route_path, title, breadcrumbs, active),
        page_kind=category,
        depth=depth,
        links=links[:1000],
        tabs=tabs[:100],
        documents=documents[:200],
        tables=tables[:100],
        forms=forms[:50],
        text=text,
    )
    return result, pending
