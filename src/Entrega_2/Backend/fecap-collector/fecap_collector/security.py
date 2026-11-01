from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken


def ensure_private_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        path.chmod(0o700)
    except OSError:
        pass


def _fernet(passphrase: str, salt: bytes) -> Fernet:
    key = hashlib.pbkdf2_hmac("sha256", passphrase.encode("utf-8"), salt, 600_000, dklen=32)
    return Fernet(base64.urlsafe_b64encode(key))


def save_encrypted_state(path: Path, state: dict[str, Any], passphrase: str) -> None:
    ensure_private_directory(path.parent)
    salt = secrets.token_bytes(16)
    token = _fernet(passphrase, salt).encrypt(json.dumps(state, separators=(",", ":")).encode("utf-8"))
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_bytes(b"ASA-PORTAL-STATE-1\n" + base64.b64encode(salt) + b"\n" + token)
    try:
        temp.chmod(0o600)
    except OSError:
        pass
    os.replace(temp, path)
    try:
        path.chmod(0o600)
    except OSError:
        pass


def load_encrypted_state(path: Path, passphrase: str) -> dict[str, Any]:
    payload = path.read_bytes().splitlines()
    if len(payload) != 3 or payload[0] != b"ASA-PORTAL-STATE-1":
        raise ValueError("Arquivo de sessão inválido ou versão não suportada.")
    try:
        salt = base64.b64decode(payload[1], validate=True)
        raw = _fernet(passphrase, salt).decrypt(payload[2])
        state = json.loads(raw)
    except (InvalidToken, ValueError, json.JSONDecodeError) as error:
        raise ValueError("Não foi possível abrir a sessão cifrada. Confira a frase secreta.") from error
    if not isinstance(state, dict):
        raise ValueError("Conteúdo de sessão inválido.")
    return state


def restore_context_state(context: Any, state: dict[str, Any]) -> None:
    cookies = state.get("cookies", [])
    if cookies:
        context.add_cookies(cookies)
    origins = state.get("origins", [])
    if origins:
        serialized = json.dumps(origins, ensure_ascii=True, separators=(",", ":"))
        context.add_init_script(
            script=(
                "(function(){const wanted=__ASA_ORIGINS__;"
                "const o=wanted.find(x=>x.origin===location.origin);"
                "if(o){for(const i of o.localStorage||[]){localStorage.setItem(i.name,i.value)}}})()"
            ).replace("__ASA_ORIGINS__", serialized)
        )
