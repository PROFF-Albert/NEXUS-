"""Storage backend selection and R2 client creation."""
from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import BinaryIO, Protocol

from ...config import (R2_ACCESS_KEY_ID, R2_BUCKET, R2_ENDPOINT_URL,
                       R2_SECRET_ACCESS_KEY, R2_REGION_NAME)
from ... import storage_local


class StorageBackend(Protocol):
    def put_bytes(self, data: bytes) -> tuple[str, int, bool]: ...
    def put_stream(self, stream: BinaryIO, chunk: int = 1024 * 1024) -> tuple[str, int, bool]: ...
    def get_bytes(self, sha: str) -> bytes: ...
    def get_path(self, sha: str) -> Path: ...
    def exists(self, sha: str) -> bool: ...
    def delete(self, sha: str) -> bool: ...
    def physical_usage(self) -> int: ...
    def download_url(self, sha: str, filename: str = "", expires_in: int = 3600,
                     download: bool = False) -> str | None: ...


@dataclass(frozen=True)
class R2Config:
    endpoint_url: str
    access_key_id: str
    secret_access_key: str
    bucket: str
    region_name: str = "auto"


def load_r2_config() -> R2Config | None:
    if not (R2_ENDPOINT_URL and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET):
        return None
    return R2Config(
        endpoint_url=R2_ENDPOINT_URL,
        access_key_id=R2_ACCESS_KEY_ID,
        secret_access_key=R2_SECRET_ACCESS_KEY,
        bucket=R2_BUCKET,
        region_name=R2_REGION_NAME,
    )


class LocalStorageBackend:
    def put_bytes(self, data: bytes) -> tuple[str, int, bool]:
        return storage_local.put_bytes(data)

    def put_stream(self, stream: BinaryIO, chunk: int = 1024 * 1024) -> tuple[str, int, bool]:
        return storage_local.put_stream(stream, chunk)

    def get_bytes(self, sha: str) -> bytes:
        return storage_local.get_bytes(sha)

    def get_path(self, sha: str) -> Path:
        return storage_local.get_path(sha)

    def exists(self, sha: str) -> bool:
        return storage_local.exists(sha)

    def delete(self, sha: str) -> bool:
        return storage_local.delete(sha)

    def physical_usage(self) -> int:
        return storage_local.physical_usage()

    def download_url(self, sha: str, filename: str = "", expires_in: int = 3600,
                     download: bool = False) -> str | None:
        return None


class R2StorageBackend:
    def __init__(self, cfg: R2Config):
        self.cfg = cfg
        self._client = None

    def _client_or_raise(self):
        if self._client is not None:
            return self._client
        try:
            import boto3
            from botocore.config import Config
            from botocore.exceptions import ClientError
        except Exception as exc:  # pragma: no cover - optional dependency
            raise RuntimeError("boto3 is required for R2 storage") from exc
        self._client = boto3.client(
            "s3",
            endpoint_url=self.cfg.endpoint_url,
            aws_access_key_id=self.cfg.access_key_id,
            aws_secret_access_key=self.cfg.secret_access_key,
            region_name=self.cfg.region_name,
            config=Config(signature_version="s3v4"),
        )
        self._client_error = ClientError
        return self._client

    def _key(self, sha: str) -> str:
        return f"blobs/{sha[:2]}/{sha[2:4]}/{sha}"

    def put_bytes(self, data: bytes) -> tuple[str, int, bool]:
        from .hashing import calculate_sha256

        sha = calculate_sha256(data)
        client = self._client_or_raise()
        key = self._key(sha)
        try:
            client.head_object(Bucket=self.cfg.bucket, Key=key)
            return sha, len(data), True
        except Exception:
            client.put_object(Bucket=self.cfg.bucket, Key=key, Body=data)
            return sha, len(data), False

    def put_stream(self, stream: BinaryIO, chunk: int = 1024 * 1024) -> tuple[str, int, bool]:
        client = self._client_or_raise()
        with tempfile.NamedTemporaryFile("wb", delete=False) as tmp:
            size = 0
            import hashlib
            hasher = hashlib.sha256()
            while True:
                buf = stream.read(chunk)
                if not buf:
                    break
                hasher.update(buf)
                tmp.write(buf)
                size += len(buf)
            tmp_path = tmp.name
        sha = hasher.hexdigest()
        key = self._key(sha)
        try:
            client.head_object(Bucket=self.cfg.bucket, Key=key)
            os.unlink(tmp_path)
            return sha, size, True
        except Exception:
            with open(tmp_path, "rb") as fh:
                client.upload_fileobj(fh, self.cfg.bucket, key)
            os.unlink(tmp_path)
            return sha, size, False

    def get_bytes(self, sha: str) -> bytes:
        client = self._client_or_raise()
        obj = client.get_object(Bucket=self.cfg.bucket, Key=self._key(sha))
        return obj["Body"].read()

    def get_path(self, sha: str) -> Path:
        import tempfile

        data = self.get_bytes(sha)
        tmp = tempfile.NamedTemporaryFile("wb", delete=False)
        try:
            tmp.write(data)
            tmp.flush()
        finally:
            tmp.close()
        return Path(tmp.name)

    def exists(self, sha: str) -> bool:
        client = self._client_or_raise()
        try:
            client.head_object(Bucket=self.cfg.bucket, Key=self._key(sha))
            return True
        except Exception:
            return False

    def delete(self, sha: str) -> bool:
        client = self._client_or_raise()
        client.delete_object(Bucket=self.cfg.bucket, Key=self._key(sha))
        return True

    def physical_usage(self) -> int:
        client = self._client_or_raise()
        total = 0
        token = None
        while True:
            kwargs = {"Bucket": self.cfg.bucket}
            if token:
                kwargs["ContinuationToken"] = token
            resp = client.list_objects_v2(**kwargs)
            for obj in resp.get("Contents", []):
                total += int(obj.get("Size", 0))
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
        return total

    def download_url(self, sha: str, filename: str = "", expires_in: int = 3600,
                     download: bool = False) -> str | None:
        client = self._client_or_raise()
        params = {"Bucket": self.cfg.bucket, "Key": self._key(sha)}
        if filename:
            kind = "attachment" if download else "inline"
            params["ResponseContentDisposition"] = f'{kind}; filename="{filename}"'
        return client.generate_presigned_url("get_object", Params=params, ExpiresIn=expires_in)


@lru_cache(maxsize=1)
def get_backend() -> StorageBackend:
    cfg = load_r2_config()
    if cfg:
        return R2StorageBackend(cfg)
    return LocalStorageBackend()
