import requests
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | %(message)s')
logger = logging.getLogger(__name__)

BASE_URL = "http://localhost:8005"

def test_apis():
    session = requests.Session()
    
    # 1. Login
    logger.info("--- 1. Testing Login ---")
    login_data = {"username": "admin", "password": "Admin123!@#"}
    try:
        resp = session.post(f"{BASE_URL}/auth/login", json=login_data)
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            logger.info("Login SUCCESS. Token received.")
            session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            logger.error(f"Login FAILED. Status: {resp.status_code}, Resp: {resp.text}")
            return
    except Exception as e:
        logger.error(f"Login Exception: {e}")
        return

    # 2. Test Endpoints
    endpoints = [
        ("/auth/me", "Current User Info"),
        ("/api/users", "List Users"),
        ("/api/menu", "List Menu Items"),
        ("/api/queries", "List Queries"),
        ("/api/processes", "List Processes"),
        ("/api/dashboard", "Dashboard Widgets"),
        ("/api/kpis", "KPIs")
    ]
    
    for endpoint, desc in endpoints:
        logger.info(f"--- Testing {desc} ({endpoint}) ---")
        try:
            resp = session.get(f"{BASE_URL}{endpoint}")
            if resp.status_code == 200:
                json_resp = resp.json()
                # Check for APIResponse structure {"success": ..., "data": ...}
                actual_data = json_resp.get("data") if isinstance(json_resp, dict) else json_resp
                
                count = len(actual_data) if isinstance(actual_data, list) else "N/A (Dict/Obj)"
                logger.info(f"SUCCESS: {desc} returned 200 OK. Count: {count}")
                if isinstance(actual_data, list) and not actual_data:
                     logger.warning(f"  -> WARNING: {desc} returned empty list!")
                elif isinstance(actual_data, list) and actual_data:
                     logger.info(f"  -> First Item keys: {list(actual_data[0].keys())}")
            else:
                logger.error(f"FAILURE: {desc} returned {resp.status_code}. Resp: {resp.text}")
        except Exception as e:
            logger.error(f"Exception testing {endpoint}: {e}")

if __name__ == "__main__":
    test_apis()
