"""Find who a message mentions: @Display Name of a conversation member, or @channel / @all."""

import re
import uuid

EVERYONE = ("channel", "all", "tous", "الكل")


def mentioned_ids(body: str, members: dict[uuid.UUID, str]) -> set[uuid.UUID]:
    """Members whose name follows an @ (case-insensitive, whole name), or everyone for @channel."""
    text = body.casefold()
    if any(re.search(rf"(?<!\w)@{re.escape(word)}(?!\w)", text) for word in EVERYONE):
        return set(members)
    found: set[uuid.UUID] = set()
    # Longest names first, so "@Amina Benali" is not also read as "@Amina".
    for uid, name in sorted(members.items(), key=lambda item: -len(item[1])):
        pattern = rf"(?<!\w)@{re.escape(name.casefold())}(?!\w)"
        if re.search(pattern, text):
            found.add(uid)
            text = re.sub(pattern, " ", text)
    return found
