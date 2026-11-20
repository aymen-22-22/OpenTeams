from collections.abc import AsyncIterator
from dataclasses import dataclass
from urllib.parse import quote

import pytest
from httpx import AsyncClient, Response

from tests.conftest import FakeClock, logged_in


@dataclass
class Room:
    amina: AsyncClient
    lucas: AsyncClient
    karim: AsyncClient  # outsider
    conversation_id: str


@pytest.fixture
async def room() -> AsyncIterator[Room]:
    amina, _ = await logged_in("amina@example.com")
    lucas, lucas_user = await logged_in("lucas@example.com")
    karim, _ = await logged_in("karim@example.com")
    r = await amina.post("/api/v1/conversations/direct", json={"user_id": str(lucas_user.id)})
    yield Room(amina, lucas, karim, r.json()["id"])
    for c in (amina, lucas, karim):
        await c.aclose()


async def upload(client: AsyncClient, conv: str, name: str, data: bytes = b"hello") -> Response:
    return await client.post(
        f"/api/v1/conversations/{conv}/files",
        content=data,
        headers={"X-File-Name": quote(name), "Content-Type": "application/octet-stream"},
    )


async def download(client: AsyncClient, file_id: str, **params: int) -> bytes:
    link = await client.get(f"/api/v1/files/{file_id}/download-url", params=params)
    assert link.status_code == 200
    r = await client.get(link.json()["url"])
    assert r.status_code == 200
    return r.content


async def test_upload_list_download(room: Room) -> None:
    r = await upload(room.amina, room.conversation_id, "rapport été.pdf", b"%PDF-1.7 data")
    assert r.status_code == 201
    file = r.json()
    assert file["name"] == "rapport été.pdf"
    assert file["kind"] == "pdf"
    assert file["size"] == 13
    listed = (await room.lucas.get(f"/api/v1/conversations/{room.conversation_id}/files")).json()
    assert [f["id"] for f in listed] == [file["id"]]
    assert await download(room.lucas, file["id"]) == b"%PDF-1.7 data"


async def test_download_is_forced_attachment(room: Room) -> None:
    file = (await upload(room.amina, room.conversation_id, "photo.png")).json()
    link = (await room.amina.get(f"/api/v1/files/{file['id']}/download-url")).json()
    r = await room.amina.get(link["url"])
    assert r.headers["content-disposition"].startswith("attachment;")
    assert r.headers["content-type"] == "application/octet-stream"
    assert r.headers["x-content-type-options"] == "nosniff"


async def test_same_name_creates_version(room: Room) -> None:
    v1 = (await upload(room.amina, room.conversation_id, "budget.xlsx", b"one")).json()
    v2 = (await upload(room.lucas, room.conversation_id, "budget.xlsx", b"two!")).json()
    assert v2["id"] == v1["id"]
    assert v2["current_version"] == 2
    assert v2["size"] == 4
    assert await download(room.amina, v1["id"]) == b"two!"
    assert await download(room.amina, v1["id"], version=1) == b"one"


async def test_filter_by_kind(room: Room) -> None:
    await upload(room.amina, room.conversation_id, "a.pdf")
    await upload(room.amina, room.conversation_id, "b.png")
    url = f"/api/v1/conversations/{room.conversation_id}/files"
    images = (await room.amina.get(url, params={"kind": "image"})).json()
    assert [f["name"] for f in images] == ["b.png"]
    assert (await room.amina.get(url, params={"kind": "exe"})).status_code == 422


async def test_path_in_name_is_stripped(room: Room) -> None:
    r = await upload(room.amina, room.conversation_id, "../../etc/notes.txt")
    assert r.json()["name"] == "notes.txt"


async def test_disallowed_types_rejected(room: Room) -> None:
    for name in ("virus.exe", "page.html", "image.svg", "script.sh", "noextension"):
        r = await upload(room.amina, room.conversation_id, name)
        assert r.status_code == 415, name


async def test_upload_validation(room: Room) -> None:
    url = f"/api/v1/conversations/{room.conversation_id}/files"
    assert (await room.amina.post(url, content=b"x")).status_code == 422  # no X-File-Name
    assert (await upload(room.amina, room.conversation_id, "...")).status_code == 422
    assert (await upload(room.amina, room.conversation_id, "empty.txt", b"")).status_code == 422


async def test_too_large_rejected_and_not_stored(room: Room) -> None:
    big = b"x" * (1024 * 1024 + 1)  # limit is 1 MB in tests
    assert (await upload(room.amina, room.conversation_id, "big.zip", big)).status_code == 413
    files = (await room.amina.get(f"/api/v1/conversations/{room.conversation_id}/files")).json()
    assert files == []


async def test_outsider_cannot_upload_list_or_download(room: Room) -> None:
    file = (await upload(room.amina, room.conversation_id, "secret.pdf")).json()
    assert (await upload(room.karim, room.conversation_id, "x.pdf")).status_code == 404
    url = f"/api/v1/conversations/{room.conversation_id}/files"
    assert (await room.karim.get(url)).status_code == 404
    assert (await room.karim.get(f"/api/v1/files/{file['id']}/download-url")).status_code == 404


async def test_files_require_auth(client: AsyncClient, room: Room) -> None:
    assert (
        await client.get(f"/api/v1/conversations/{room.conversation_id}/files")
    ).status_code == 401
    assert (await upload(client, room.conversation_id, "a.pdf")).status_code == 401


async def test_download_link_expires(room: Room, fake_clock: FakeClock) -> None:
    file = (await upload(room.amina, room.conversation_id, "a.pdf")).json()
    link = (await room.amina.get(f"/api/v1/files/{file['id']}/download-url")).json()
    fake_clock.advance(minutes=6)
    assert (await room.amina.get(link["url"])).status_code == 410


async def test_forged_download_token(room: Room) -> None:
    assert (await room.amina.get("/api/v1/files/download?token=abc")).status_code == 403


async def test_unknown_version(room: Room) -> None:
    file = (await upload(room.amina, room.conversation_id, "a.pdf")).json()
    r = await room.amina.get(f"/api/v1/files/{file['id']}/download-url", params={"version": 9})
    assert r.status_code == 404
