"""Antivirus hook. Replace `scan` with a real scanner (e.g. ClamAV) when available."""


async def scan(storage_key: str) -> bool:
    """Return False to reject the file. The default accepts everything."""
    return True
