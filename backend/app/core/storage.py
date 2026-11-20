"""File storage interface with two backends: Nextcloud (WebDAV) and a local folder.

Keys are random ids chosen by the server, never user-provided names.
"""

from collections.abc import AsyncIterator
from functools import lru_cache
from pathlib import Path
from typing import Protocol

import httpx

from app.core.settings import get_settings

CHUNK = 1024 * 1024


class Storage(Protocol):
    async def save(self, key: str, chunks: AsyncIterator[bytes]) -> None: ...
    def open(self, key: str) -> AsyncIterator[bytes]: ...
    async def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, root: Path) -> None:
        self.root = root
        root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self.root / key

    async def save(self, key: str, chunks: AsyncIterator[bytes]) -> None:
        with self._path(key).open("wb") as f:
            async for chunk in chunks:
                f.write(chunk)

    async def open(self, key: str) -> AsyncIterator[bytes]:
        with self._path(key).open("rb") as f:
            while chunk := f.read(CHUNK):
                yield chunk

    async def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class NextcloudStorage:
    """Stores files in a Nextcloud folder through WebDAV, streaming in both directions."""

    def __init__(
        self,
        base_url: str,
        user: str,
        app_password: str,
        folder: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.folder_url = f"{base_url.rstrip('/')}/remote.php/dav/files/{user}/{folder.strip('/')}"
        self.client = httpx.AsyncClient(
            auth=(user, app_password), timeout=httpx.Timeout(30, read=300), transport=transport
        )
        self._folder_ready = False

    async def _ensure_folder(self) -> None:
        if self._folder_ready:
            return
        r = await self.client.request("MKCOL", self.folder_url)
        if r.status_code not in (201, 405):  # 405 = already exists
            r.raise_for_status()
        self._folder_ready = True

    async def save(self, key: str, chunks: AsyncIterator[bytes]) -> None:
        await self._ensure_folder()
        r = await self.client.put(f"{self.folder_url}/{key}", content=chunks)
        r.raise_for_status()

    async def open(self, key: str) -> AsyncIterator[bytes]:
        async with self.client.stream("GET", f"{self.folder_url}/{key}") as r:
            r.raise_for_status()
            async for chunk in r.aiter_bytes(CHUNK):
                yield chunk

    async def delete(self, key: str) -> None:
        r = await self.client.delete(f"{self.folder_url}/{key}")
        if r.status_code != 404:
            r.raise_for_status()


@lru_cache
def get_storage() -> Storage:
    s = get_settings()
    if s.storage_backend == "nextcloud":
        return NextcloudStorage(
            s.nextcloud_url, s.nextcloud_user, s.nextcloud_app_password, s.nextcloud_folder
        )
    return LocalStorage(Path(s.local_storage_dir))
