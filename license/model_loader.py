#!/usr/bin/env python3
import base64
import io
import subprocess
from pathlib import Path
from typing import Any, Dict

import torch

MAGIC = b"CCMODEL1"
VERSION = 1
IV_LENGTH = 16


def _read_license_key_hex(license_path: str) -> str:
    raw = Path(license_path).read_text(encoding="utf-8").strip()
    if not raw:
        raise ValueError("license 文件为空")
    try:
        decoded = base64.b64decode(raw)
    except Exception as exc:
        raise ValueError("license 文件不是有效的 base64 密钥") from exc
    if len(decoded) != 32:
        raise ValueError("license 密钥长度不正确")
    return decoded.hex()


def _decrypt_model_bytes(model_path: str, model_key_base64: str) -> bytes:
    encrypted_bytes = Path(model_path).read_bytes()
    if len(encrypted_bytes) <= len(MAGIC) + 1 + IV_LENGTH:
        raise ValueError("加密模型文件长度不正确")
    if encrypted_bytes[: len(MAGIC)] != MAGIC:
        raise ValueError("不是受支持的加密模型格式")
    if encrypted_bytes[len(MAGIC)] != VERSION:
        raise ValueError("不支持的加密模型版本")

    iv = encrypted_bytes[len(MAGIC) + 1 : len(MAGIC) + 1 + IV_LENGTH]
    ciphertext = encrypted_bytes[len(MAGIC) + 1 + IV_LENGTH :]
    key_hex = base64.b64decode(model_key_base64).hex()
    iv_hex = iv.hex()

    result = subprocess.run(
        ["openssl", "enc", "-d", "-aes-256-cbc", "-K", key_hex, "-iv", iv_hex],
        input=ciphertext,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError("解密失败，请确认 model 文件和 license 文件匹配")
    return result.stdout


def load_encrypted_checkpoint(model_path: str, license_path: str, map_location: str = "cpu") -> Dict[str, Any]:
    license_key_hex = _read_license_key_hex(license_path)
    plaintext = _decrypt_model_bytes(model_path, base64.b64encode(bytes.fromhex(license_key_hex)).decode("utf-8"))
    return torch.load(io.BytesIO(plaintext), map_location=map_location, weights_only=False)


def load_state_dict_into(model: torch.nn.Module, model_path: str, license_path: str, map_location: str = "cpu") -> Dict[str, Any]:
    checkpoint = load_encrypted_checkpoint(model_path, license_path, map_location=map_location)
    state_dict = checkpoint.get("state_dict")
    if state_dict is None:
        raise ValueError("checkpoint 中未找到 state_dict")
    model.load_state_dict(state_dict)
    return checkpoint
