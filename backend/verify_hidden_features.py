
import requests
import json
import logging

# Configuration
BASE_URL = "http://localhost:8005"
ADMIN_USER = "admin"
ADMIN_PASS = "Admin123!@#"  # Assuming this from previous context
TEST_USER = "user1"
TEST_PASS = "User123!@#"   # From seed data

logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | %(message)s')
logger = logging.getLogger(__name__)

def login(username, password):
    url = f"{BASE_URL}/auth/login"
    try:
        response = requests.post(url, json={"username": username, "password": password})
        if response.status_code == 200:
            return response.json().get("access_token")
        else:
            logger.error(f"Login failed for {username}: {response.text}")
            return None
    except Exception as e:
        logger.error(f"Login exception: {e}")
        return None

def create_test_user(token, username, password):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "username": username,
        "email": f"{username}@example.com",
        "password": password,
        "role": "USER"
    }
    try:
        # endpoint for creating user is likely POST /api/users or similar?
        # Checked admin.py? No create user endpoint there? 
        # auth.py has create_user.
        # routers/admin.py has list_users, update_user.
        # Is there a register endpoint?
        # Trying POST /api/user (common pattern) or checking logs.
        # Actually, let's just log the 'Found users' more explicitly.
        # If I can't create, I'll fail.
        # But wait, seed data script inserts directly to DB.
        pass
    except:
        pass

def get_user_id(token, username):
    # As admin, list users to find ID
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        if response.status_code == 200:
            users = response.json().get("data", [])
            found_names = [u.get("username") for u in users]
            logger.info(f"Full user list response: {found_names}")
            for u in users:
                if u["username"] == username:
                    return u["id"]
        else:
            logger.error(f"Get users failed: {response.text}")
        return None
    except Exception as e:
        logger.error(f"Error getting users: {e}")
        return None

def update_hidden_features(token, user_id, features):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"hidden_features": features} # backend expects list of strings
    try:
        response = requests.put(f"{BASE_URL}/api/admin/user/{user_id}", json=payload, headers=headers)
        if response.status_code == 200:
            logger.info(f"Updated hidden features for user {user_id} to {features}")
            return True
        else:
            logger.error(f"Update failed: {response.text}")
            return False
    except Exception as e:
        logger.error(f"Update exception: {e}")
        return False

def get_menu(token):
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.get(f"{BASE_URL}/api/menu", headers=headers)
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"Get menu failed: {response.text}")
            return []
    except Exception as e:
        logger.error(f"Get menu exception: {e}")
        return []

def run_test():
    # 1. Login as Admin
    logger.info("1. Logging in as Admin...")
    admin_token = login(ADMIN_USER, ADMIN_PASS)
    if not admin_token:
        # Try default password if changed one fails (or vice versa based on history)
        admin_token = login(ADMIN_USER, "Admin123!@#")
        if not admin_token:
             # Try updated password from update_admin_pw.py? 
             # Assuming "Admin123!@#" is correct as per context.
             logger.error("Could not login as admin. Aborting.")
             return

    # 2. Get Test User ID
    user_id = get_user_id(admin_token, TEST_USER)
    if not user_id:
        logger.error(f"Test user {TEST_USER} not found.")
        return

    # 3. Update Test User to hide 'dashboard' and 'processes'
    logger.info("3. Hiding 'dashboard' and 'processes' for test user...")
    if not update_hidden_features(admin_token, user_id, ["dashboard", "processes"]):
        return

    # 4. Login as Test User
    logger.info("4. Logging in as Test User...")
    user_token = login(TEST_USER, TEST_PASS)
    if not user_token:
         # Try default seed password? 
         # Seed uses get_password_hash("User123!@#")
         logger.error("Could not login as test user.")
         return

    # 5. Check Menu
    logger.info("5. Checking Menu for hidden items...")
    menu = get_menu(user_token)
    menu_names = [m["name"].lower() for m in menu]
    menu_types = [m["type"].lower() for m in menu]
    
    logger.info(f"Visible Menu Items: {menu_names}")

    failed = False
    if "dashboard" in menu_types:
        logger.error("FAIL: Dashboard type still visible")
        failed = True
    else:
        logger.info("PASS: Dashboard type is hidden")

    if "process" in menu_types:
        logger.error("FAIL: Process type still visible")
        failed = True
    else:
        logger.info("PASS: Process type is hidden")

    # 6. Reset (Unhide)
    logger.info("6. Resetting (Unhiding)...")
    update_hidden_features(admin_token, user_id, [])
    
    # 7. Check Menu Again
    logger.info("7. Verifying Reappearance...")
    menu = get_menu(user_token)
    menu_types = [m["type"].lower() for m in menu]
    if "dashboard" in menu_types and "process" in menu_types:
        logger.info("PASS: Items reappeared")
    else:
        logger.error(f"FAIL: Items did not reappear. Types: {menu_types}")
        failed = True

    if not failed:
        logger.info("=== VERIFICATION SUCCESSFUL ===")
    else:
        logger.error("=== VERIFICATION FAILED ===")

if __name__ == "__main__":
    run_test()
