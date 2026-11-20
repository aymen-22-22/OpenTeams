"""Nextcloud backend against a fake WebDAV server (httpx MockTransport)."""

from collections.abc import AsyncIterator

import httpx

from app.core.storage import NextcloudStorage


async def chunks(*parts: bytes) -> AsyncIterator[bytes]:
    for p in parts:
        yield p


async def test_nextcloud_save_open_delete() -> None:
    stored: dict[str, bytes] = {}
    seen: list[tuple[str, str]] = []

    def webdav(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path))
        assert request.headers["authorization"].startswith("Basic ")
        path = request.url.path
        if request.method == "MKCOL":
            return httpx.Response(201)
        if request.method == "PUT":
            stored[path] = request.read()
            return httpx.Response(201)
        if request.method == "GET":
            return (
                httpx.Response(200, content=stored[path]) if path in stored else httpx.Response(404)
            )
        if request.method == "DELETE":
            stored.pop(path, None)
            return httpx.Response(204)
        return httpx.Response(405)

    nc = NextcloudStorage(
        "https://cloud.local/",
        "bot",
        "app-pass",
        "/OpenTeams/",
        transport=httpx.MockTransport(webdav),
    )
    await nc.save("abc", chunks(b"hel", b"lo"))
    await nc.save("def", chunks(b"x"))
    assert stored == {
        "/remote.php/dav/files/bot/OpenTeams/abc": b"hello",
        "/remote.php/dav/files/bot/OpenTeams/def": b"x",
    }
    assert [m for m, _ in seen].count("MKCOL") == 1  # folder created once
    assert b"".join([c async for c in nc.open("abc")]) == b"hello"
    await nc.delete("abc")
    await nc.delete("missing")  # 404 is fine
    assert "/remote.php/dav/files/bot/OpenTeams/abc" not in stored


async def test_nextcloud_existing_folder_is_ok() -> None:
    def webdav(request: httpx.Request) -> httpx.Response:
        return httpx.Response(405 if request.method == "MKCOL" else 201)

    nc = NextcloudStorage(
        "https://cloud.local", "bot", "p", "OpenTeams", transport=httpx.MockTransport(webdav)
    )
    await nc.save("k", chunks(b"data"))
