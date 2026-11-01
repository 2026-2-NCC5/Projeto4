from pathlib import Path

from fecap_collector.parser import parse_page, route_in_scope, safe_route_url

FIXTURE = Path(__file__).parent / "fixtures" / "portal-page.html"
PORTAL = "https://portal.fecap.br"


def test_parse_discovers_navigation_tabs_table_and_read_only_form():
    route, pending = parse_page(
        FIXTURE.read_bytes(), f"{PORTAL}/framehtml/web/app/edu/PortalEducacional/#/notas", PORTAL, None, 0
    )
    assert route.title == "Portal do Aluno"
    assert route.page_kind == "academic"
    assert route.tabs == ["1º semestre", "2º semestre"]
    assert route.tables[0].headers == ["Disciplina", "Nota"]
    assert route.tables[0].rows[-1] == ["Estruturas de Dados", "8,5"]
    assert route.forms[0].fields[0].label == "Período"
    assert all(field.field_type != "password" for field in route.forms[0].fields)
    assert any("#/notas" in url for url in pending)
    payment = next(link for link in route.links if "financeiro" in link.url)
    assert payment.read_only_candidate is False
    external = next(link for link in route.links if "example.test" in link.url)
    assert external.in_scope is False


def test_scope_and_query_sanitization():
    assert route_in_scope("https://portal.fecap.br/path#/grades", PORTAL)
    assert not route_in_scope("https://sso.fecap.br/path", PORTAL)
    assert (
        safe_route_url("https://portal.fecap.br/x?tab=grades&access_token=secret")
        == "https://portal.fecap.br/x?tab=grades&access_token=%5Bredacted%5D"
    )
    assert (
        safe_route_url("https://portal.fecap.br/#/main?key=private&tab=home")
        == "https://portal.fecap.br/#/main?key=%5Bredacted%5D&tab=home"
    )
