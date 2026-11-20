"""Admin commands. Usage: python -m app.cli create-admin EMAIL "Display Name" """

import asyncio
import getpass
import sys

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.users.models import Role, User


async def create_admin(email: str, display_name: str, password: str) -> None:
    async with SessionLocal() as db:
        db.add(
            User(
                email=email.lower(),
                display_name=display_name,
                password_hash=hash_password(password),
                role=Role.ADMIN,
            )
        )
        await db.commit()


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[1] != "create-admin":
        sys.exit(__doc__)
    password = getpass.getpass("Password (12+ characters): ")
    if len(password) < 12:
        sys.exit("Password too short")
    asyncio.run(create_admin(sys.argv[2], sys.argv[3], password))
    print("Admin created")


if __name__ == "__main__":
    main()
