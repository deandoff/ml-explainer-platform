from getpass import getpass

from app.core.auth import hash_password
from app.core.database import SessionLocal
from app.models.user import User


def main() -> None:
    email = input("Email: ").strip().lower()
    password = getpass("Password (12+ characters): ")
    confirmation = getpass("Confirm password: ")

    if not email:
        raise SystemExit("Email is required")
    if len(password) < 12:
        raise SystemExit("Password must contain at least 12 characters")
    if password != confirmation:
        raise SystemExit("Passwords do not match")

    database = SessionLocal()
    try:
        if database.query(User).filter(User.email == email).first():
            raise SystemExit("User already exists")

        database.add(User(email=email, hashed_password=hash_password(password)))
        database.commit()
    finally:
        database.close()

    print(f"Created user {email}")


if __name__ == "__main__":
    main()
