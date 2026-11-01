from fecap_collector.browser import PortalBrowser


class Locator:
    def __init__(self, count: int):
        self._count = count

    def count(self) -> int:
        return self._count


class Page:
    def __init__(self, url: str, navigation_count: int):
        self.url = url
        self.navigation_count = navigation_count

    def locator(self, _selector: str) -> Locator:
        return Locator(self.navigation_count)


def test_authentication_marker_requires_portal_main_route_and_navigation():
    assert PortalBrowser._has_authenticated_route(
        Page("https://portal.fecap.br/framehtml/PortalEducacional/#/main?key=opaque", 1)
    )
    assert not PortalBrowser._has_authenticated_route(Page("https://portal.fecap.br/login/", 1))
    assert not PortalBrowser._has_authenticated_route(Page("https://portal.fecap.br/#/main", 0))
    assert not PortalBrowser._has_authenticated_route(Page("https://example.test/#/main", 1))
