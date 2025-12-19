
import requests
import json
import logging
import random
import string

# Configuration
BASE_URL = "http://localhost:8005"
ADMIN_USER = "admin"
ADMIN_PASS = "Admin123!@#"  # Assuming this from previous context or update_admin_pw

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

def create_form_report(token):
    headers = {"Authorization": f"Bearer {token}"}
    
    # Random suffix to avoid name collision
    suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
    
    # 1. Create Query with is_form_report=True
    payload = {
        "name": f"Test Form Report {suffix}",
        "description": "A test report with filters",
        "sql_query": "SELECT * FROM app_users", # Query simple table
        "chart_type": "table",
        "is_form_report": True,
        "form_template": """
            <form>
                <input name="username" data-column="username" data-operator="like">
                <input name="role" data-column="role" data-operator="eq">
            </form>
        """,
        "role": "ADMIN"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/admin/query", json=payload, headers=headers)
        if response.status_code == 200:
            logger.info(f"Create Query Response: {response.text}")
            data = response.json().get("data")
            if data and "query_id" in data:
                logger.info(f"Created Form Report Query ID: {data['query_id']}")
                return data["query_id"]
            else:
                logger.error(f"ID not found in data: {data}")
                return None
        else:
            logger.error(f"Create Query failed: {response.text}")
            return None
    except Exception as e:
        logger.error(f"Create Query exception: {e}")
        return None

def verify_report_execution(token, query_id):
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Execute without filters (Should return all)
    logger.info("...Executing without filters...")
    payload_all = {
        "query_id": query_id,
        "limit": 10,
        "offset": 0
    }
    try:
        resp = requests.post(f"{BASE_URL}/api/query/filtered", json=payload_all, headers=headers)
        if resp.status_code == 200:
            count = resp.json().get("data", {}).get("total_count", 0)
            logger.info(f"Unfiltered Count: {count}")
        else:
            logger.error(f"Unfiltered exec failed: {resp.text}")
    except Exception as e:
        logger.error(e)

    # 3. Execute with Filter (role = 'ADMIN')
    logger.info("...Executing with Filter role='ADMIN'...")
    payload_filter = {
        "query_id": query_id,
        "filters": {
            "conditions": [
                {"column": "role", "operator": "eq", "value": "ADMIN"}
            ],
            "logic": "AND"
        },
        "limit": 10,
        "offset": 0
    }
    try:
        resp = requests.post(f"{BASE_URL}/api/query/filtered", json=payload_filter, headers=headers)
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            rows = data.get("data", [])
            logger.info(f"Filtered Rows Count: {len(rows)}")
            # Verify all rows have role ADMIN
            # Note: app_users columns: id, username, email, password_hash, role...
            # The order depends on SELECT *
            # We need to find the index of 'role'.
            cols = data.get("columns", [])
            if "role" in cols:
                role_idx = cols.index("role")
                all_admin = all(row[role_idx] == "ADMIN" for row in rows)
                if all_admin and len(rows) > 0:
                     logger.info("PASS: All rows have role='ADMIN'")
                elif len(rows) == 0:
                     logger.warning("WARN: No rows returned for filter")
                else:
                     logger.error("FAIL: Some rows do not have role='ADMIN'")
            else:
                logger.error("FAIL: 'role' column not found in result")

        else:
            logger.error(f"Filtered exec failed: {resp.text}")
    except Exception as e:
         logger.error(e)

def run_test():
    logger.info("1. Login as Admin")
    token = login(ADMIN_USER, ADMIN_PASS)
    if not token:
        return

    logger.info("2. Create Form Report")
    query_id = create_form_report(token)
    if not query_id:
        return
    
    logger.info(f"3. Verify Execution (Query ID: {query_id})")
    verify_report_execution(token, query_id)

if __name__ == "__main__":
    run_test()
