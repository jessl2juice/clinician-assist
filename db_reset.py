from app import app
from extensions import db

def reset_database():
    with app.app_context():
        print("Dropping all tables...")
        db.drop_all()
        print("Creating all tables with updated schema...")
        db.create_all()
        print("Database schema updated successfully!")

if __name__ == "__main__":
    reset_database()
