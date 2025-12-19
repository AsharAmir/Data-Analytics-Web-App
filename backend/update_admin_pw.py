import logging
from auth import get_password_hash
from database import db_manager

# Setup simple logging to see output
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def update_admin_password():
    password = "Admin123!@#"
    hashed_password = get_password_hash(password)
    logger.info(f"Generated Hash for '{password}': {hashed_password}")
    
    try:
        # Check if user exists
        check_query = "SELECT id, username FROM app_users WHERE username = %s"
        users = db_manager.execute_query(check_query, ("admin",))
        
        if not users:
            logger.info("User 'admin' not found. Creating it...")
            create_query = """
                INSERT INTO app_users (username, email, password_hash, role, is_active, must_change_password)
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            db_manager.execute_non_query(create_query, ("admin", "admin@example.com", hashed_password, "ADMIN", 1, 0))
            logger.info("User 'admin' created successfully.")
        else:
            logger.info(f"User 'admin' found (ID: {users[0]['id']}). Updating password...")
            update_query = "UPDATE app_users SET password_hash = %s, must_change_password = 0 WHERE username = %s"
            db_manager.execute_non_query(update_query, (hashed_password, "admin"))
            logger.info("User 'admin' password updated successfully.")
            
    except Exception as e:
        logger.error(f"Error updating database: {e}")

if __name__ == "__main__":
    update_admin_password()
