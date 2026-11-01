from __future__ import annotations

import getpass
import logging
import re
from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qsl, urlparse

from scrapling.fetchers import DynamicSession

from .config import Settings
from .security import load_encrypted_state, restore_context_state, save_encrypted_state

logger = logging.getLogger(__name__)
MFA_WORDS = (
    "autenticação multifator",
    "autenticacao multifator",
    "código de verificação",
    "codigo de verificacao",
    "token enviado",
    "confirme sua identidade",
)
CAPTCHA_WORDS = ("captcha", "recaptcha", "não sou um robô", "nao sou um robo", "cloudflare")
LOGIN_ERROR_WORDS = (
    "usuário ou senha inválidos",
    "usuario ou senha invalidos",
    "senha incorreta",
    "conta bloqueada",
    "acesso negado",
)
LOGIN_WORDS = ("entrar", "login", "acessar", "usuário", "usuario", "senha", "password")
LOGOUT_WORDS = ("sair", "logout", "encerrar sessão", "encerrar sessao")


class PortalLoginError(RuntimeError):
    """Falha de autenticação com mensagem sem credenciais ou texto integral do portal."""


class PortalBrowser:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.session: DynamicSession | None = None
        self.username = settings.username
        self.password = settings.password
        self.passphrase: str | None = None
        self._authenticated = False

    def __enter__(self) -> PortalBrowser:
        self.session = DynamicSession(
            headless=self.settings.browser_headless,
            timeout=self.settings.timeout_ms,
            retries=self.settings.max_retries,
            max_pages=1,
            network_idle=False,
            disable_resources=False,
        )
        self.session.start()
        if self.settings.session_persist and self.settings.session_storage_path.exists():
            self.passphrase = getpass.getpass("Frase secreta da sessão local: ")
            state = load_encrypted_state(self.settings.session_storage_path, self.passphrase)
            restore_context_state(self.session.context, state)
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        if self.session:
            self.session.close()
        self.session = None
        # Senhas são removidas das referências assim que o navegador fecha.
        self.password = None
        self.passphrase = None

    def authenticate(self) -> str:
        if not self.session:
            raise RuntimeError("O navegador não foi iniciado.")
        callback_error: list[Exception] = []

        def action(page: Any) -> None:
            try:
                self._login_or_confirm(page)
            except Exception as error:  # a exceção externa é substituída para impedir eco de seletor/valor
                callback_error.append(error)

        response = self.session.fetch(self.settings.portal_url, page_action=action, timeout=self.settings.timeout_ms)
        final_url = str(getattr(response, "url", self.settings.portal_url))
        if callback_error:
            if isinstance(callback_error[0], PortalLoginError):
                raise callback_error[0]
            raise PortalLoginError("O navegador não conseguiu verificar a sessão do Portal FECAP.") from None
        if urlparse(final_url).hostname != "portal.fecap.br":
            raise PortalLoginError("O login não retornou ao domínio do Portal Educacional FECAP.")
        if not self._authenticated:
            raise PortalLoginError("A sessão do Portal FECAP não foi confirmada.")
        if self.settings.session_persist:
            self._persist_state()
        return "authenticated"

    def _login_or_confirm(self, page: Any) -> None:
        # TOTVS pode manter formulário desktop/mobile duplicado no DOM; só interagir com controles visíveis.
        password = page.locator('input[type="password"]:visible')
        if password.count() == 0 and not self._has_authenticated_route(page):
            # A rota inicial é uma SPA; aguarda o redirecionamento interno para a tela de login.
            try:
                password.first.wait_for(state="visible", timeout=min(15_000, self.settings.timeout_ms))
            except Exception:
                pass
        password_count = password.count()
        if password_count:
            text = self._visible_text(page).lower()
            if any(word in text for word in LOGIN_ERROR_WORDS):
                raise PortalLoginError("O Portal FECAP informou falha de autenticação. Confira o usuário e a senha.")
            if self.settings.auth_mode == "manual":
                self._wait_for_human_login(page, "modo manual configurado")
                return
            self._fill_login(page, password)
            return

        text = self._visible_text(page).lower()
        if any(word in text for word in LOGIN_ERROR_WORDS):
            raise PortalLoginError("O Portal FECAP informou falha de autenticação.")
        if any(word in text for word in CAPTCHA_WORDS) or any(word in text for word in MFA_WORDS):
            reason = "captcha detectado" if any(word in text for word in CAPTCHA_WORDS) else "MFA detectado"
            self._wait_for_human_login(page, reason)
            return
        if self._has_logout_or_account_marker(page, text):
            self._mark_authenticated(page)
            return
        if self._has_authenticated_route(page):
            self._mark_authenticated(page)
            return
        # SSO pode iniciar em outro domínio e concluir com uma confirmação humana.
        self._wait_for_human_login(page, "formulário de login/SSO não identificado")

    def _fill_login(self, page: Any, password_locator: Any) -> None:
        if self.password is None:
            self.password = getpass.getpass("Senha do Portal FECAP (entrada oculta): ")
        if self.username is None:
            self.username = input("Usuário, RA ou e-mail institucional: ").strip()
        if not self.password or not self.username:
            raise PortalLoginError("Usuário e senha são necessários para iniciar a autenticação.")
        inputs = page.locator("input")
        descriptors = inputs.evaluate_all(
            "els => els.map((e,i)=>({i,type:(e.type||'').toLowerCase(),name:e.name||'',id:e.id||'',"
            "label:e.getAttribute('aria-label')||'',placeholder:e.placeholder||'',autocomplete:e.autocomplete||'',"
            "visible:!!(e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden')}))"
        )
        password_index = password_locator.first.evaluate(
            "e => Array.from(document.querySelectorAll('input')).indexOf(e)"
        )
        candidates = [
            item
            for item in descriptors
            if item["visible"]
            and item["i"] != password_index
            and item["type"] not in {"hidden", "submit", "button", "checkbox"}
        ]
        if not candidates:
            self._wait_for_human_login(page, "campo de usuário não identificado no formulário")
            return

        def rank(item: dict[str, Any]) -> int:
            return sum(
                1
                for key in (item["name"], item["id"], item["label"], item["placeholder"], item["autocomplete"])
                if any(word in key.lower() for word in ("user", "usu", "login", "email", "e-mail", "ra", "mail"))
            ) + (3 if item["type"] == "email" else 0)

        username_input = max(candidates, key=rank)
        inputs.nth(username_input["i"]).fill(self.username)
        password_locator.first.fill(self.password)
        form = password_locator.first.locator("xpath=ancestor::form[1]")
        submit = form.locator('button[type="submit"]:visible, input[type="submit"]:visible')
        if submit.count():
            submit.first.click()
        else:
            password_locator.first.press("Enter")
        try:
            page.wait_for_function(
                """() => {
                  const body = (document.body?.innerText || '').toLowerCase();
                  const route = location.hash.split('?')[0].replace(/\\/$/, '').toLowerCase();
                  const authenticatedRoute = ['/main','/home'].includes(route) &&
                    !!document.querySelector('nav,[role="navigation"],[data-testid*="user" i]');
                  const authError = [
                    'usuário ou senha inválidos','usuario ou senha invalidos','senha incorreta',
                    'conta bloqueada','acesso negado','captcha','recaptcha','autenticação multifator',
                    'autenticacao multifator','código de verificação','codigo de verificacao'
                  ].some(word => body.includes(word));
                  return authenticatedRoute || authError;
                }""",
                timeout=min(12_000, self.settings.timeout_ms),
            )
        except Exception:
            pass
        text = self._visible_text(page).lower()
        if any(word in text for word in LOGIN_ERROR_WORDS):
            raise PortalLoginError("O Portal FECAP informou falha de autenticação. Confira o usuário e a senha.")
        if (
            any(word in text for word in CAPTCHA_WORDS)
            or any(word in text for word in MFA_WORDS)
            or page.locator('input[type="password"]:visible').count()
        ):
            if any(word in text for word in CAPTCHA_WORDS):
                reason = "captcha detectado após o envio"
            elif any(word in text for word in MFA_WORDS):
                reason = "MFA detectado após o envio"
            else:
                reason = "formulário de login permanece visível após o envio"
            self._wait_for_human_login(page, reason)
            return
        if self._has_logout_or_account_marker(page, text):
            self._mark_authenticated(page)
            return
        if self._has_authenticated_route(page):
            self._mark_authenticated(page)
            return
        self._wait_for_human_login(page, "estado pós-login sem indicador reconhecido")

    def _wait_for_human_login(self, page: Any, reason: str) -> None:
        if self.settings.browser_headless:
            raise PortalLoginError(f"O portal exige verificação manual ({reason}); autenticação não confirmada.")
        print("Conclua o login, MFA ou CAPTCHA na janela aberta do portal. Não cole códigos na saída do programa.")
        while True:
            try:
                input("Depois que o portal mostrar a área autenticada, pressione Enter para verificar. ")
            except EOFError:
                raise PortalLoginError(
                    f"Verificação manual necessária ({reason}); terminal sem entrada interativa."
                ) from None
            try:
                page.wait_for_timeout(300)
            except Exception:
                pass
            text = self._visible_text(page).lower()
            if any(word in text for word in LOGIN_ERROR_WORDS):
                print("O portal ainda mostra uma mensagem de falha de autenticação.")
                continue
            if page.locator('input[type="password"]:visible').count():
                print("A página ainda apresenta o formulário de senha; conclua o login antes de continuar.")
                continue
            if self._has_logout_or_account_marker(page, text):
                self._mark_authenticated(page)
                return
            if self._has_authenticated_route(page):
                self._mark_authenticated(page)
                return
            confirmation = input(
                "Não encontrei um indicador automático de sessão. Confirme a área autenticada digitando CONFIRMO: "
            )
            if confirmation.strip() == "CONFIRMO":
                self._mark_authenticated(page)
                return

    @staticmethod
    def _has_logout_or_account_marker(page: Any, text: str) -> bool:
        if any(word in text for word in LOGOUT_WORDS):
            return True
        return page.locator('[aria-label*="conta" i], [aria-label*="perfil" i], [data-testid*="user" i]').count() > 0

    @staticmethod
    def _has_authenticated_route(page: Any) -> bool:
        """Reconhece a rota principal observada do Portal apenas quando há navegação renderizada."""
        parsed = urlparse(page.url)
        fragment_path, _, fragment_query = parsed.fragment.partition("?")
        route = fragment_path.rstrip("/").lower()
        if parsed.hostname != "portal.fecap.br" or route not in {"/main", "/home"}:
            return False
        has_navigation = page.locator('nav, [role="navigation"], [data-testid*="user" i]').count() > 0
        has_portal_key = bool(dict(parse_qsl(fragment_query, keep_blank_values=True)).get("key"))
        return has_navigation or has_portal_key

    def _mark_authenticated(self, page: Any) -> None:
        self.wait_for_page_ready(page, timeout_ms=min(20_000, self.settings.timeout_ms))
        self._complete_course_context_if_present(page)
        self._authenticated = True

    @staticmethod
    def wait_for_page_ready(page: Any, *, timeout_ms: int = 20_000) -> None:
        """Espera a aplicação acadêmica sair do estado de carregamento do SPA."""
        page.wait_for_function(
            """() => {
              const body = (document.body?.innerText || '').trim();
              const loading = /\\b(carregando|loading)\\b/i.test(body);
              return document.readyState === 'complete' && body.length > 40 && !loading;
            }""",
            timeout=timeout_ms,
        )

    def _complete_course_context_if_present(self, page: Any) -> None:
        """Seleciona apenas a turma explicitamente solicitada, se o portal exibir essa tela."""
        selects = page.locator("select:visible")
        controls = selects.evaluate_all(
            """elements => elements.map((element,index) => {
              const labels = Array.from(document.querySelectorAll('label[for]'))
                .filter(label => label.htmlFor === element.id).map(label => label.innerText);
              const wrapping = element.closest('label');
              if (wrapping) labels.push(wrapping.innerText);
              const nearby = element.closest('.form-group,.form-field,.field,.row')?.querySelector('label');
              if (nearby) labels.push(nearby.innerText);
              return {
                index,
                label: [element.getAttribute('aria-label'), ...labels, element.name, element.id]
                  .filter(Boolean).join(' ').replace(/\\s+/g,' ').trim().toLowerCase(),
                options: Array.from(element.options).map(option =>
                  (option.textContent || '').replace(/\\s+/g,' ').trim()
                ),
                selected: (element.selectedOptions[0]?.textContent || '').replace(/\\s+/g,' ').trim()
              };
            })"""
        )
        desired_course = "Graduação em Ciência da Computação (Noturno)"
        course_option_present = any(
            desired_course.casefold() in option.casefold() for item in controls for option in item["options"]
        )
        if not course_option_present:
            return

        targets = (
            (("curso", "graduação", "graduacao", "programa"), desired_course, "exact"),
            (("habilitação", "habilitacao"), "Ciência da Computação", "exact"),
            (("grade curricular", "grade"), "Ciência da Computação (2024-2)", "exact"),
            (("turma", "class"), "5NACOMP_S", "exact"),
            (("período letivo", "periodo letivo", "ano letivo"), "2026-2", "exact"),
            (("período", "periodo", "semester"), "5", "period"),
        )
        used: set[int] = set()
        for label_terms, expected, match_mode in targets:
            controls = page.locator("select:visible").evaluate_all(
                """elements => elements.map((element,index) => {
                  const labels = Array.from(document.querySelectorAll('label[for]'))
                    .filter(label => label.htmlFor === element.id).map(label => label.innerText);
                  const wrapping = element.closest('label');
                  if (wrapping) labels.push(wrapping.innerText);
                  const nearby = element.closest('.form-group,.form-field,.field,.row')?.querySelector('label');
                  if (nearby) labels.push(nearby.innerText);
                  return {
                    index,
                    label: [element.getAttribute('aria-label'), ...labels, element.name, element.id]
                      .filter(Boolean).join(' ').replace(/\\s+/g,' ').trim().toLowerCase(),
                    options: Array.from(element.options).map(option =>
                      (option.textContent || '').replace(/\\s+/g,' ').trim()
                    ),
                    selected: (element.selectedOptions[0]?.textContent || '').replace(/\\s+/g,' ').trim()
                  };
                })"""
            )

            def label_matches(label: str, label_terms: tuple[str, ...] = label_terms) -> bool:
                if "período" in label_terms or "periodo" in label_terms:
                    is_term = "letivo" in label
                    wants_term = any("letivo" in term or "ano letivo" in term for term in label_terms)
                    if is_term != wants_term:
                        return False
                return any(term in label for term in label_terms)

            match = next(
                (
                    item
                    for item in controls
                    if item["index"] not in used
                    and label_matches(item["label"])
                    and any(
                        (
                            option.strip() == expected
                            if match_mode != "period"
                            else option.strip() in {"5", "5º", "5º período"}
                        )
                        for option in item["options"]
                    )
                ),
                None,
            )
            if match is None:
                raise PortalLoginError(
                    "A tela de seleção de curso apareceu, mas os campos não puderam ser validados com segurança."
                )
            option_label = next(
                option
                for option in match["options"]
                if (
                    option.strip() == expected
                    if match_mode != "period"
                    else option.strip() in {"5", "5º", "5º período"}
                )
            )
            selects = page.locator("select:visible")
            selects.nth(match["index"]).select_option(label=option_label)
            page.wait_for_timeout(250)
            used.add(match["index"])

        # O portal exibe a confirmação ao final da seleção como "Confirmar".
        # Exigir um único botão exato evita acionar outro formulário ou uma ação ambígua.
        button = page.get_by_role("button", name=re.compile(r"^\s*Confirmar\s*$", re.IGNORECASE))
        if button.count() == 0:
            button = page.locator('input[type="submit"][value="Confirmar"]:visible')
        if button.count() != 1:
            raise PortalLoginError(
                "A seleção de curso foi preenchida, mas o botão Confirmar não pôde ser identificado unicamente."
            )
        button.click(timeout=3000)
        page.wait_for_timeout(500)

    @staticmethod
    def _visible_text(page: Any) -> str:
        try:
            return page.locator("body").inner_text(timeout=1500)[:20_000]
        except Exception:
            return ""

    def fetch(self, url: str, *, page_action: Callable[[Any], None] | None = None) -> Any:
        if not self.session or not self._authenticated:
            raise PortalLoginError("Confirme a autenticação antes de navegar.")
        if page_action:
            return self.session.fetch(url, page_action=page_action, timeout=self.settings.timeout_ms)
        return self.session.fetch(url, timeout=self.settings.timeout_ms)

    def _persist_state(self) -> None:
        if not self.session:
            return
        self.passphrase = self.passphrase or getpass.getpass("Crie/digite a frase secreta para cifrar a sessão local: ")
        if len(self.passphrase) < 12:
            raise ValueError("Use uma frase secreta com pelo menos 12 caracteres para persistir a sessão.")
        state = self.session.context.storage_state()
        save_encrypted_state(self.settings.session_storage_path, state, self.passphrase)

    def clear_persistent_state(self) -> None:
        self.settings.session_storage_path.unlink(missing_ok=True)
