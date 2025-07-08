#!/usr/bin/env python3
"""
Simple script to create normal users for the Data Analytics Web App
Run this script to add new users to your system.
"""

import sys
import os

sys.path.append("backend")

from backend.auth import create_user, get_password_hash
from backend.models import UserCreate
from backend.database import db_manager


def create_normal_user():
    """Interactive script to create a normal user"""
    print("🔐 Create New User for Data Analytics Web App")
    print("=" * 50)

    # Get user input
    username = input("Enter username: ").strip()
    email = input("Enter email: ").strip()
    password = input("Enter password: ").strip()
    role = input("Enter role (user/admin) [user]: ").strip().lower() or "user"
    if role not in ("user", "admin"):
        print("❌ Invalid role. Must be 'user' or 'admin'.")
        return

    if not username or not email or not password:
        print("❌ All fields are required!")
        return

    try:
        # Create user using the existing function
        user_data = UserCreate(username=username, email=email, password=password)
        new_user = create_user(user_data, role=role)
        if new_user:
            print(f"✅ User '{username}' created successfully!")
            print(f"   Email: {email}")
            print(f"   Role: {role}")
            print(f"   User ID: {new_user.id}")
            print(f"   Created: {new_user.created_at}")
            print("\n🎉 User can now login with their credentials!")
        else:
            print("❌ Failed to create user")
    except Exception as e:
        print(f"❌ Error creating user: {e}")


def list_users():
    """List all existing users"""
    try:
        result = db_manager.execute_query(
            "SELECT username, email, is_active, created_at FROM app_users ORDER BY created_at DESC"
        )

        print("\n📋 Existing Users:")
        print("-" * 60)
        for user in result:
            status = "✅ Active" if user["IS_ACTIVE"] else "❌ Inactive"
            print(f"👤 {user['USERNAME']} ({user['EMAIL']}) - {status}")
            print(f"   Created: {user['CREATED_AT']}")
            print()

    except Exception as e:
        print(f"❌ Error listing users: {e}")


if __name__ == "__main__":
    print("Data Analytics Web App - User Management")
    print("=" * 50)

    while True:
        print("\nChoose an option:")
        print("1. Create new user")
        print("2. List existing users")
        print("3. Exit")

        choice = input("\nEnter choice (1-3): ").strip()

        if choice == "1":
            create_normal_user()
        elif choice == "2":
            list_users()
        elif choice == "3":
            print("👋 Goodbye!")
            break
        else:
            print("❌ Invalid choice. Please enter 1, 2, or 3.")
