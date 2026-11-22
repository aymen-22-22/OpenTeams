"""Admin commands.

    python -m app.cli create-admin EMAIL "Display Name"
    python -m app.cli create-user EMAIL "Display Name" [--role employee|manager|admin]
    python -m app.cli vapid-keys      (prints new keys for web push, to put in .env)

The password is asked interactively, or read from OPENTEAMS_PASSWORD (for automation).
"""

import asyncio
import getpass
import os
import sys

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.users.models import Role, User


async def create_user(email: str, display_name: str, password: str, role: Role) -> None:
    async with SessionLocal() as db:
        db.add(
            User(
                email=email.lower(),
                display_name=display_name,
                password_hash=hash_password(password),
                role=role,
            )
        )
        await db.commit()


async def create_admin(email: str, display_name: str, password: str) -> None:
    await create_user(email, display_name, password, Role.ADMIN)


def main() -> None:
    args = sys.argv[1:]
    if args == ["vapid-keys"]:
        from app.reminders.push import generate_vapid_keys

        public, private = generate_vapid_keys()
        print(f"VAPID_PUBLIC_KEY={public}\nVAPID_PRIVATE_KEY={private}")
        return
    role = Role.ADMIN
    if "--role" in args:
        i = args.index("--role")
        role = Role(args[i + 1])
        del args[i : i + 2]
    if len(args) != 3 or args[0] not in ("create-admin", "create-user"):
        sys.exit(__doc__)
    if args[0] == "create-user" and "--role" not in sys.argv:
        role = Role.EMPLOYEE
    password = os.environ.get("OPENTEAMS_PASSWORD") or getpass.getpass(
        "Password (12+ characters): "
    )
    if len(password) < 12:
        sys.exit("Password too short")
    asyncio.run(create_user(args[1], args[2], password, role))
    print(f"{role.value.capitalize()} created")


if __name__ == "__main__":
    main()
