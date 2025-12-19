
import requests
import json
import logging
import random
import string

# Configuration
BASE_URL = "http://localhost:8005"
ADMIN_USER = "admin"
ADMIN_PASS = "Admin123!@#" 

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

def create_interactive_dashboard_menu(token):
    headers = {"Authorization": f"Bearer {token}"}
    suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
    
    payload = {
        "name": f"Interactive Dash {suffix}",
        "type": "dashboard",
        "icon": "chart-pie",
        "is_interactive_dashboard": True,
        "interactive_template": """
            <div class="grid grid-cols-2">
                <div data-query-id="101" data-widget-type="chart"></div>
                <div data-query-id="102" data-widget-type="table"></div>
            </div>
            <select data-filter data-query-id="101" data-column="role">
                <option value="ADMIN">Admin</option>
            </select>
        """,
        "sort_order": 99,
        "role": "ADMIN"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/admin/menu", json=payload, headers=headers)
        if response.status_code == 200:
            logger.info(f"Create Response: {response.text}")
            data = response.json().get("data")
            if data and "menu_id" in data:
                logger.info(f"Created Menu ID: {data['menu_id']}")
                return data["menu_id"]
            else:
                logger.error(f"Menu ID not found in response data: {data}")
                return None
        else:
            logger.error(f"Create Menu failed: {response.text}")
            return None
    except Exception as e:
        logger.error(f"Create Menu exception: {e}")
        return None

def verify_menu_structure(token, new_menu_id):
    headers = {"Authorization": f"Bearer {token}"}
    try:
        # Fetch user menu structure
        response = requests.get(f"{BASE_URL}/api/menu", headers=headers)
        if response.status_code == 200:
            menu_items = response.json()
            # Find our new menu item
            found = False
            for item in menu_items:
                if item["id"] == new_menu_id:
                    found = True
                    if item.get("is_interactive_dashboard") and item.get("interactive_template"):
                        logger.info("PASS: Menu item found with interactive template")
                        logger.info(f"Template content start: {item['interactive_template'][:50]}...")
                    else:
                        logger.error(f"FAIL: Menu item found but missing interactive fields: {item}")
                    break
            if not found:
                 logger.error(f"FAIL: New menu item {new_menu_id} not found in /api/menu response")
        else:
             logger.error(f"Get Menu failed: {response.text}")

    except Exception as e:
        logger.error(f"Verify structure exception: {e}")

def run_test():
    logger.info("1. Login as Admin")
    token = login(ADMIN_USER, ADMIN_PASS)
    if not token:
        return

    logger.info("2. Create Interactive Dashboard Menu")
    menu_id = create_interactive_dashboard_menu(token)
    if not menu_id:
        return
    
    logger.info(f"3. Verify Menu Structure (ID: {menu_id})")
    verify_menu_structure(token, menu_id)

if __name__ == "__main__":
    run_test()
