#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
LICENSE_DIR="$ROOT_DIR/license"
PRIVATE_KEY_PATH="${1:-$LICENSE_DIR/private.pem}"
PUBLIC_KEY_PATH="${2:-$LICENSE_DIR/public.pem}"

mkdir -p "$LICENSE_DIR"
openssl genrsa -out "$PRIVATE_KEY_PATH" 2048
openssl rsa -in "$PRIVATE_KEY_PATH" -pubout -out "$PUBLIC_KEY_PATH"

printf 'private key: %s\n' "$PRIVATE_KEY_PATH"
printf 'public key: %s\n' "$PUBLIC_KEY_PATH"
