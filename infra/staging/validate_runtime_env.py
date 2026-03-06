#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

INVALID_ENVIRONMENTS = {"", "local", "development", "dev", "test"}
INVALID_SECRETS = {"change-me", "dev-secret-change-me", "dev-internal"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0"}


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def parse_origins(value: str) -> list[str]:
    stripped = value.strip()
    if not stripped:
        return []
    if stripped.startswith("["):
        parsed = json.loads(stripped)
        if isinstance(parsed, list):
            return [str(item).strip().rstrip("/") for item in parsed if str(item).strip()]
    return [item.strip().rstrip("/") for item in stripped.split(",") if item.strip()]


def is_local_url(value: str) -> bool:
    try:
        host = (urlsplit(value).hostname or "").strip().lower()
    except Exception:
        return True
    return host in LOCAL_HOSTS


def normalize_origin(url: str) -> str:
    parsed = urlsplit(url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"invalid URL: {url}")
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate non-local staging/runtime env values.")
    parser.add_argument("--env-file", required=True, help="Path to .env-style file")
    parser.add_argument("--expected-api-base-url", default="", help="Expected NEXT_PUBLIC_API_URL value")
    parser.add_argument("--expected-web-base-url", default="", help="Expected web app base URL for CORS inclusion")
    args = parser.parse_args()

    env_file = Path(args.env_file)
    if not env_file.exists():
        print(f"ERROR: env file not found: {env_file}", file=sys.stderr)
        return 1

    values = load_env_file(env_file)
    errors: list[str] = []

    environment = values.get("ENVIRONMENT", "").strip().lower()
    if environment in INVALID_ENVIRONMENTS:
        errors.append("ENVIRONMENT must be set to a non-local value for staging/prod.")

    jwt_secret = values.get("JWT_SECRET", "").strip()
    if not jwt_secret or jwt_secret in INVALID_SECRETS:
        errors.append("JWT_SECRET must be populated with a non-default secret.")

    internal_token = values.get("INTERNAL_TOKEN", "").strip()
    if not internal_token or internal_token in INVALID_SECRETS:
        errors.append("INTERNAL_TOKEN must be populated with a non-default secret.")

    api_base_url = values.get("NEXT_PUBLIC_API_URL", "").strip().rstrip("/")
    if not api_base_url:
        errors.append("NEXT_PUBLIC_API_URL must be set.")
    elif is_local_url(api_base_url):
        errors.append("NEXT_PUBLIC_API_URL must not point to localhost/127.0.0.1.")

    expected_api_base_url = args.expected_api_base_url.strip().rstrip("/")
    if expected_api_base_url and api_base_url and api_base_url != expected_api_base_url:
        errors.append(
            f"NEXT_PUBLIC_API_URL ({api_base_url}) does not match expected API base URL ({expected_api_base_url})."
        )

    cors_raw = values.get("CORS_ALLOWED_ORIGINS", "")
    cors_origins = parse_origins(cors_raw)
    if not cors_origins:
        errors.append("CORS_ALLOWED_ORIGINS must contain at least one trusted origin.")
    elif "*" in cors_origins:
        errors.append("CORS_ALLOWED_ORIGINS cannot contain '*'.")

    expected_web_base_url = args.expected_web_base_url.strip()
    if expected_web_base_url:
        try:
            expected_origin = normalize_origin(expected_web_base_url)
        except ValueError as exc:
            errors.append(str(exc))
        else:
            if expected_origin not in cors_origins:
                errors.append(
                    f"CORS_ALLOWED_ORIGINS must include the staging web origin ({expected_origin})."
                )

    if errors:
        print("Runtime env validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"Validated runtime env: {env_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
