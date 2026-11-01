import pytest

from fecap_collector.security import load_encrypted_state, restore_context_state, save_encrypted_state


def test_persistent_state_is_encrypted_and_restorable(tmp_path):
    target = tmp_path / ".private" / "session.enc"
    state = {"cookies": [{"name": "asa-private-cookie", "value": "very-secret"}], "origins": []}
    save_encrypted_state(target, state, "local passphrase longer than twelve")
    assert b"very-secret" not in target.read_bytes()
    assert load_encrypted_state(target, "local passphrase longer than twelve") == state
    with pytest.raises(ValueError):
        load_encrypted_state(target, "wrong passphrase")


def test_restore_state_injects_only_origin_scoped_local_storage():
    class Context:
        def __init__(self):
            self.cookies = []
            self.scripts = []

        def add_cookies(self, cookies):
            self.cookies.extend(cookies)

        def add_init_script(self, *, script):
            self.scripts.append(script)

    context = Context()
    restore_context_state(
        context,
        {
            "cookies": [{"name": "sid", "value": "x"}],
            "origins": [{"origin": "https://portal.fecap.br", "localStorage": [{"name": "theme", "value": "light"}]}],
        },
    )
    assert context.cookies[0]["name"] == "sid"
    assert "location.origin" in context.scripts[0]
    assert "portal.fecap.br" in context.scripts[0]
