#!/usr/bin/env python3
import base64
import binascii
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
        raise ValueError("license file is empty")
    try:
        decoded = base64.b64decode(raw, validate=True)
    except binascii.Error as exc:
        raise ValueError("license file is not valid base64") from exc
    if len(decoded) != 32:
        raise ValueError("license key must be exactly 32 bytes")
    return decoded.hex()


def _decrypt_model_bytes(model_path: str, model_key_base64: str) -> bytes:
    encrypted_bytes = Path(model_path).read_bytes()
    if len(encrypted_bytes) <= len(MAGIC) + 1 + IV_LENGTH:
        raise ValueError("encrypted model file is too short")
    if encrypted_bytes[: len(MAGIC)] != MAGIC:
        raise ValueError("unsupported encrypted model format")
    if encrypted_bytes[len(MAGIC)] != VERSION:
        raise ValueError("unsupported encrypted model version")

    iv = encrypted_bytes[len(MAGIC) + 1 : len(MAGIC) + 1 + IV_LENGTH]
    ciphertext = encrypted_bytes[len(MAGIC) + 1 + IV_LENGTH :]
    key_hex = base64.b64decode(model_key_base64).hex()
    iv_hex = iv.hex()

    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    except ImportError:
        pass
    else:
        decryptor = Cipher(algorithms.AES(bytes.fromhex(key_hex)), modes.CBC(bytes.fromhex(iv_hex))).decryptor()
        padded = decryptor.update(ciphertext) + decryptor.finalize()
        if not padded:
            raise ValueError("decrypt failed, produced empty plaintext")
        padding_len = padded[-1]
        if padding_len < 1 or padding_len > 16:
            raise ValueError("decrypt failed, invalid PKCS7 padding")
        if padded[-padding_len:] != bytes([padding_len]) * padding_len:
            raise ValueError("decrypt failed, invalid PKCS7 padding")
        return padded[:-padding_len]

    try:
        result = subprocess.run(
            ["openssl", "enc", "-d", "-aes-256-cbc", "-K", key_hex, "-iv", iv_hex],
            input=ciphertext,
            capture_output=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "decrypt requires either `pip install cryptography` or an `openssl` executable in PATH"
        ) from exc
    if result.returncode != 0:
        raise ValueError("decrypt failed, please confirm the .model and license match")
    return result.stdout


def load_encrypted_checkpoint(model_path: str, license_path: str, map_location: str = "cpu") -> Dict[str, Any]:
    license_key_hex = _read_license_key_hex(license_path)
    plaintext = _decrypt_model_bytes(model_path, base64.b64encode(bytes.fromhex(license_key_hex)).decode("utf-8"))
    return torch.load(io.BytesIO(plaintext), map_location=map_location, weights_only=False)


def load_state_dict_into(
    model: torch.nn.Module,
    model_path: str,
    license_path: str,
    map_location: str = "cpu",
) -> Dict[str, Any]:
    checkpoint = load_encrypted_checkpoint(model_path, license_path, map_location=map_location)
    state_dict = checkpoint.get("state_dict")
    if state_dict is None:
        raise ValueError("checkpoint does not contain state_dict")
    model.load_state_dict(state_dict)
    return checkpoint
