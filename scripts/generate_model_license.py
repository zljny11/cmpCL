#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export the fixed base64 model key as a user-bound license file")
    parser.add_argument("--model-file", required=True, help="Path to encrypted .model file")
    parser.add_argument("--output", required=True, help="Output license file path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    model_file = Path(args.model_file).resolve()
    repo_root = Path(__file__).resolve().parent.parent
    metadata_path = Path(f"{model_file}.license.json")
    if not metadata_path.exists():
        raise FileNotFoundError(f"Metadata file not found: {metadata_path}")

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if not metadata.get("authorizedUserId"):
        raise ValueError("Model metadata is missing authorizedUserId; please re-upload this delivery with the latest backend")
    if not metadata.get("modelKey"):
        raise ValueError("Model metadata is missing modelKey")

    config_path = repo_root / "license" / "user-licenses.json"
    if not config_path.exists():
        raise FileNotFoundError(f"User license config not found: {config_path}")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    users = config.get("users")
    if not isinstance(users, dict):
        raise ValueError("User license config is missing users")
    configured_key = users.get(metadata["authorizedUserId"])
    if not configured_key:
        raise ValueError(f"User {metadata['authorizedUserId']} is missing a configured license key")
    if configured_key.strip() != metadata["modelKey"]:
        raise ValueError("Configured user license key does not match this encrypted model")

    output_path = Path(args.output).resolve()
    output_path.write_text(f"{configured_key.strip()}\n", encoding="utf-8")
    print(output_path)


if __name__ == "__main__":
    main()
