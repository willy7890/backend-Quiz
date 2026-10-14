import sys

from .database import SessionLocal
from .models import User


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.bootstrap_super_admin <registered-email>")
    email = sys.argv[1].strip().lower()
    db = SessionLocal()
    try:
        if db.query(User.id).filter(User.role == "SUPER_ADMIN", User.is_active.is_(True)).first():
            raise SystemExit("Super Admin bootstrap has already been used.")
        user = db.query(User).filter(User.email.ilike(email), User.is_active.is_(True)).first()
        if not user:
            raise SystemExit("No active account found for that email. Register the account first.")
        user.role = "SUPER_ADMIN"
        db.commit()
        print(f"Super Admin role granted to {user.email}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
