import logging
import random
from database import db_manager
from auth import get_password_hash

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def seed_data():
    logger.info("Starting data seeding...")

    # 1. Seed Users (5 users)
    logger.info("Seeding Users...")
    roles = ["USER", "ADMIN", "FINANCE_USER", "HR_USER", "IT_USER"]
    password_hash = get_password_hash("User123!@#")
    
    for i in range(1, 6):
        username = f"user{i}"
        email = f"user{i}@example.com"
        role = roles[i-1] if i-1 < len(roles) else "USER"
        
        try:
            # Check existence
            exists = db_manager.execute_query("SELECT id FROM app_users WHERE username = %s", (username,))
            if not exists:
                db_manager.execute_non_query(
                    """INSERT INTO app_users (username, email, password_hash, role, is_active, must_change_password) 
                       VALUES (%s, %s, %s, %s, 1, 0)""",
                    (username, email, password_hash, role)
                )
                logger.info(f"Created user: {username}")
            else:
                logger.info(f"User {username} already exists.")
        except Exception as e:
            logger.error(f"Failed to seed user {username}: {e}")

    # 2. Seed Menu Items (5 items)
    logger.info("Seeding Menu Items...")
    menus = [
        ("Sales Reports", "report", "currency-dollar"),
        ("HR Analytics", "dashboard", "users"),
        ("IT Operations", "process", "server"),
        ("Audit Logs", "report", "clipboard-list"),
        ("Settings", "settings", "cog")
    ]
    
    menu_ids = []
    for i, (name, mtype, icon) in enumerate(menus):
        try:
            exists = db_manager.execute_query("SELECT id FROM app_menu_items WHERE name = %s", (name,))
            if not exists:
                db_manager.execute_non_query(
                    "INSERT INTO app_menu_items (name, type, icon, sort_order) VALUES (%s, %s, %s, %s)",
                    (name, mtype, icon, i+10) # +10 to sort after defaults
                )
                new_id = db_manager.execute_query("SELECT id FROM app_menu_items WHERE name = %s", (name,))[0]['id']
                menu_ids.append(new_id)
                logger.info(f"Created menu: {name}")
            else:
                menu_ids.append(exists[0]['id']) # Use existing ID or 'ID' depending on case fix (api uses lowercase now)
                logger.info(f"Menu {name} already exists.")
        except Exception as e:
            logger.error(f"Failed to seed menu {name}: {e}")
            # Try to fetch lowercase 'id' if 'ID' failed? 
            # The db_manager returns dicts with keys matching DB columns. 
            # In MySQL connector with dictionary=True, it usually returns column case or lowercase.
            # My previous fix in auth.py confirms we should expect lowercase 'id' 
            # if the select query was lowercase, OR handle both.

    # 3. Seed Queries (5 queries)
    logger.info("Seeding Queries...")
    sample_queries = [
        ("Monthly Sales", "SELECT * FROM app_users", "bar"), # Dummy select
        ("Active User Count", "SELECT COUNT(*) as cnt FROM app_users WHERE is_active=1", "metric"),
        ("Role Distribution", "SELECT role, COUNT(*) as cnt FROM app_users GROUP BY role", "pie"),
        ("Recent Logins", "SELECT username, created_at FROM app_users ORDER BY created_at DESC LIMIT 10", "table"),
        ("System Health", "SELECT 1 as status", "status")
    ]
    
    query_ids = []
    for i, (name, sql, chart) in enumerate(sample_queries):
        try:
            exists = db_manager.execute_query("SELECT id FROM app_queries WHERE name = %s", (name,))
            
            # Determine flags
            is_kpi = 1 if chart in ["metric", "status"] else 0
            is_default = 1 # Make all seed queries default for visibility
            
            if not exists:
                menu_id = menu_ids[i % len(menu_ids)] if menu_ids else None
                db_manager.execute_non_query(
                    """INSERT INTO app_queries (name, description, sql_query, chart_type, menu_item_id, is_active, is_kpi, is_default_dashboard) 
                       VALUES (%s, 'Auto-generated test query', %s, %s, %s, 1, %s, %s)""",
                    (name, sql, chart, menu_id, is_kpi, is_default)
                )
                new_q = db_manager.execute_query("SELECT id FROM app_queries WHERE name = %s", (name,))
                if new_q:
                    query_ids.append(new_q[0]['id'])
                logger.info(f"Created query: {name}")
            else:
                 q_id = exists[0]['id']
                 query_ids.append(q_id)
                 # Update flags to ensure they show up
                 db_manager.execute_non_query(
                     "UPDATE app_queries SET is_active=1, is_kpi=%s, is_default_dashboard=%s WHERE id=%s",
                     (is_kpi, is_default, q_id)
                 )
                 logger.info(f"Query {name} updated with active flags.")
        except Exception as e:
            logger.error(f"Failed to seed query {name}: {e}")

    # 4. Seed Processes (5 processes)
    logger.info("Seeding Processes...")
    for i in range(1, 6):
        proc_name = f"Process {i}"
        try:
            exists = db_manager.execute_query("SELECT id FROM app_processes WHERE name = %s", (proc_name,))
            if not exists:
                db_manager.execute_non_query(
                    "INSERT INTO app_processes (name, description, script_path) VALUES (%s, %s, %s)",
                    (proc_name, f"Description for process {i}", f"scripts/process_{i}.py")
                )
                logger.info(f"Created process: {proc_name}")
            else:
                 logger.info(f"Process {proc_name} already exists.")
        except Exception as e:
            logger.error(f"Failed to seed process {proc_name}: {e}")

    # 5. Seed Dashboard Widgets (5 widgets)
    logger.info("Seeding Dashboard Widgets...")
    if query_ids:
        for i in range(1, 6):
            title = f"Widget {i}"
            try:
                # Basic check if title exists to avoid duplicates
                check = db_manager.execute_query("SELECT id FROM app_dashboard_widgets WHERE title = %s", (title,))
                if not check:
                    q_id = query_ids[i % len(query_ids)]
                    db_manager.execute_non_query(
                        """INSERT INTO app_dashboard_widgets (title, query_id, position_x, position_y, width, height) 
                           VALUES (%s, %s, %s, %s, 6, 4)""",
                        (title, q_id, (i % 2) * 6, (i // 2) * 4)
                    )
                    logger.info(f"Created widget: {title}")
                else:
                    logger.info(f"Widget {title} already exists.")
            except Exception as e:
                logger.error(f"Failed to seed widget {title}: {e}")

    logger.info("Data seeding completed!")

if __name__ == "__main__":
    seed_data()
