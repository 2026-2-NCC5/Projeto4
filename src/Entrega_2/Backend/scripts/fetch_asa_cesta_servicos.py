#!/usr/bin/env python3
"""
Coleta a "Cesta de Serviços" PÚBLICA do ASA em fecap.br e grava um retrato em JSON.

Uso (a partir de src/Entrega_2/Backend):
    python3 -I scripts/fetch_asa_cesta_servicos.py [saida.json]

- Só lê páginas públicas listadas no sitemap oficial (cesta-de-servicos-sitemap.xml), uma por vez,
  com intervalo entre requisições. Não faz login nem envia dados do projeto ou de pessoas.
- De cada serviço guarda o texto da aba "Graduação" (o público do ASA Conecta) — ou o conteúdo
  único quando a página não tem abas —, as condições, o setor responsável, o local, o horário e os
  canais de contato publicados. Serviços exclusivos do Colégio, da Pós ou do Mestrado ficam de fora.
- O JSON alimenta `api/scripts/build-official-knowledge.ts`, que gera o conteúdo oficial da base de
  conhecimento (database/content/). Revise o diff antes de publicar.

Somente biblioteca padrão.
"""
from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

SITEMAP = "https://www.fecap.br/cesta-de-servicos-sitemap.xml"
ABOUT_URL = "https://www.fecap.br/asa/"
BASE = "https://www.fecap.br/asa/cesta-de-servicos/"
USER_AGENT = "Mozilla/5.0 (compatible; ASA-Conecta-KB-Import/1.0)"
DELAY_SECONDS = 0.6
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "database" / "content" / "asa_cesta_de_servicos.json"

BLOCK_TAGS = {"p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "td", "th"}


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "pt-BR"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def clean(text: str) -> str:
    text = html.unescape(text).replace("\xa0", " ")
    return re.sub(r"[ \t\r\f\v]+", " ", re.sub(r"\s*\n\s*", "\n", text)).strip()


class ServiceParser(HTMLParser):
    """Lê o bloco <section id="cesta-de-servicos">: abas (tab-pane) e contatos (info-contatos)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.tab_labels: dict[str, str] = {}
        self.tabs: dict[str, list[dict]] = {}
        self.untabbed: list[dict] = []
        self.contacts: list[dict] = []
        self.contact_links: list[str] = []
        self.title = ""
        self._title_open = False
        self._tab_link: str | None = None
        self._tab_link_text = ""
        self._pane: tuple[str, int] | None = None
        self._content: int | None = None
        self._info: int | None = None
        self._block: dict | None = None
        self._link: dict | None = None

    # --------------------------------------------------------------- helpers
    def _target(self) -> list[dict] | None:
        if self._info is not None:
            return self.contacts
        if self._pane is not None:
            return self.tabs.setdefault(self._pane[0], [])
        if self._content is not None:
            return self.untabbed
        return None

    def _open_block(self, tag: str) -> None:
        self._close_block()
        if self._target() is not None:
            self._block = {"tag": tag, "parts": []}

    def _close_block(self) -> None:
        if self._block is None:
            return
        text = clean("".join(self._block["parts"]))
        target = self._target()
        if text and target is not None:
            target.append({"tag": self._block["tag"], "text": text})
        self._block = None

    def _write(self, text: str) -> None:
        if self._block is None and self._target() is not None and text.strip():
            self._block = {"tag": "p", "parts": []}
        if self._block is not None:
            self._block["parts"].append(text)

    # ----------------------------------------------------------- HTMLParser
    def handle_starttag(self, tag: str, attrs_list) -> None:
        attrs = {key: (value or "") for key, value in attrs_list}
        classes = attrs.get("class", "").split()
        if tag == "div":
            self.depth += 1
            if "tab-pane" in classes and attrs.get("id"):
                self._close_block()
                self._pane = (attrs["id"], self.depth)
            elif "info-contatos" in classes:
                self._close_block()
                self._info = self.depth
            elif "col-lg-12" in classes and self._content is None and self.title:
                self._content = self.depth
            return
        if tag == "h2" and not self.title:
            self._title_open = True
            return
        if tag == "a" and "nav-link" in classes and attrs.get("href", "").startswith("#nav-"):
            self._tab_link = attrs["href"][1:]
            self._tab_link_text = ""
            return
        if tag == "a":
            href = attrs.get("href", "").strip()
            if self._info is not None and re.match(r"^(tel:|mailto:|https://api\.whatsapp\.com/)", href):
                self.contact_links.append(href)
            if re.match(r"^https://[^\s\"'<>]+$", href):
                self._link = {"href": href, "parts": []}
            return
        if tag == "br":
            self._write("\n")
            return
        if tag in BLOCK_TAGS:
            self._open_block(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag == "div":
            if self._pane is not None and self._pane[1] == self.depth:
                self._close_block()
                self._pane = None
            elif self._info is not None and self._info == self.depth:
                self._close_block()
                self._info = None
            elif self._content is not None and self._content == self.depth:
                self._close_block()
                self._content = None
            self.depth -= 1
            return
        if tag == "h2" and self._title_open:
            self._title_open = False
            return
        if tag == "a" and self._tab_link is not None:
            self.tab_labels[self._tab_link] = clean(self._tab_link_text)
            self._tab_link = None
            return
        if tag == "a" and self._link is not None:
            text = clean("".join(self._link["parts"]))
            href = self._link["href"]
            self._link = None
            if text:
                self._write(f"[{text}]({href})" if text != href else href)
            return
        if tag in BLOCK_TAGS:
            self._close_block()

    def handle_data(self, data: str) -> None:
        if self._title_open:
            self.title += data
            return
        if self._tab_link is not None:
            self._tab_link_text += data
            return
        if self._link is not None:
            self._link["parts"].append(data)
            return
        self._write(data)


def breadcrumb_category(page: str) -> tuple[str | None, str | None]:
    match = re.search(r'href="https://www\.fecap\.br/asa/cesta-de-servicos/s/([a-z0-9-]+)/">([^<]+)</a>', page)
    return (match.group(1), clean(match.group(2))) if match else (None, None)


def split_conditions(blocks: list[dict]) -> tuple[list[dict], list[str]]:
    """O texto depois de "Condições:" vira a lista de condições."""
    body: list[dict] = []
    conditions: list[str] = []
    in_conditions = False
    for block in blocks:
        text = block["text"]
        match = re.match(r"^condi[cç](ão|ões|oes|ao)\s*:?\s*(.*)$", text, re.IGNORECASE | re.DOTALL)
        if match:
            in_conditions = True
            rest = match.group(2).strip()
            if rest:
                conditions.append(rest)
            continue
        (conditions.append(text) if in_conditions else body.append(block))
    return body, conditions


CONTACT_FIELDS = {
    "setor responsavel": "sector",
    "setor responsável": "sector",
    "local": "location",
    "horario de atendimento": "hours",
    "horário de atendimento": "hours",
}


def parse_contacts(blocks: list[dict]) -> dict:
    result: dict = {}
    for block in blocks:
        match = re.match(r"^([^:]{3,40}):\s*(.+)$", block["text"], re.DOTALL)
        if not match:
            continue
        key = CONTACT_FIELDS.get(match.group(1).strip().lower())
        if key:
            result[key] = clean(match.group(2)).replace("\n", " ")
    return result


def parse_service(url: str, page: str) -> dict | None:
    start = page.find('id="cesta-de-servicos"')
    if start < 0:
        return None
    end = page.find("</section>", start)
    parser = ServiceParser()
    parser.feed(page[page.rfind("<section", 0, start):end + len("</section>")])
    parser.close()

    title = clean(parser.title)
    if not title:
        return None
    labels = {pane: label for pane, label in parser.tab_labels.items()}
    audiences = sorted({label for label in labels.values() if label})
    chosen = next((pane for pane, label in labels.items() if label.lower().startswith("gradua")), None)
    if parser.tab_labels and chosen is None:
        return {"skip": True, "url": url, "title": title, "audiences": audiences}
    blocks = parser.tabs.get(chosen, []) if chosen else parser.untabbed
    blocks = [block for block in blocks if not re.match(r"^(compartilhe:?|whatsapp|facebook|linkedin|x-twitter)$", block["text"], re.IGNORECASE)]
    body, conditions = split_conditions(blocks)
    if not body:
        return {"skip": True, "url": url, "title": title, "audiences": audiences, "reason": "sem texto"}

    category_slug, category_label = breadcrumb_category(page)
    contact = parse_contacts(parser.contacts)
    phones = sorted({link[4:] for link in parser.contact_links if link.startswith("tel:")})
    emails = sorted({link[7:].split("?")[0] for link in parser.contact_links if link.startswith("mailto:")})
    whatsapp = sorted({m.group(1) for link in parser.contact_links if (m := re.search(r"phone=(\d+)", link))})
    slug = url.rstrip("/").rsplit("/", 1)[-1]
    return {
        "slug": slug,
        "url": url,
        "title": title,
        "category": {"slug": category_slug, "label": category_label},
        "audiences": audiences,
        "blocks": body,
        "conditions": conditions,
        "sector": contact.get("sector"),
        "location": contact.get("location"),
        "hours": contact.get("hours"),
        "channels": {"phones": phones, "emails": emails, "whatsapp": whatsapp},
    }


def parse_about(page: str) -> list[str]:
    """Parágrafos da seção "Sobre" da página Quem Somos do ASA."""
    start = page.find('id="sobre"')
    if start < 0:
        return []
    end = page.find('<div class="col-lg-6 my-auto">', start)
    section = page[start:end if end > 0 else start + 20000]
    paragraphs = [clean(re.sub(r"(?s)<[^>]+>", "", item)) for item in re.findall(r"(?s)<p>(.*?)</p>", section)]
    return [item for item in paragraphs if item]


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    sitemap = fetch(SITEMAP)
    urls = [html.unescape(u).strip() for u in re.findall(r"<loc>([^<]+)</loc>", sitemap)]
    urls = sorted({u for u in urls if u.startswith(BASE) and u != BASE and "/s/" not in u[len(BASE):]})
    services: list[dict] = []
    skipped: list[dict] = []
    for index, url in enumerate(urls, 1):
        try:
            parsed = parse_service(url, fetch(url))
        except Exception as error:  # rede/HTML inesperado: registra e segue
            skipped.append({"url": url, "reason": f"erro: {type(error).__name__}"})
            parsed = None
        if parsed is None:
            skipped.append({"url": url, "reason": "sem bloco de serviço"})
        elif parsed.get("skip"):
            skipped.append({k: v for k, v in parsed.items() if k != "skip"})
        else:
            services.append(parsed)
        print(f"[{index}/{len(urls)}] {url}", file=sys.stderr)
        time.sleep(DELAY_SECONDS)

    services.sort(key=lambda item: item["slug"])
    about = parse_about(fetch(ABOUT_URL))
    snapshot = {
        "source": "https://www.fecap.br/asa/cesta-de-servicos/",
        "sitemap": SITEMAP,
        "fetchedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "audience": "Graduação",
        "about": {"url": ABOUT_URL, "paragraphs": about},
        "services": services,
        "skipped": skipped,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(services)} serviços gravados em {out}; {len(skipped)} ignorados", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
