import logging
import time
from auth import verify_password, authenticate_user
from database import db_manager

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_login_verification():
    username = "admin"
    password = "Admin123!@#"
    
    logger.info(f"Testing login for user: {username}")
    
    try:
        # 1. Direct DB Check
        logger.info("--- 1. Direct Database Check ---")
        query = "SELECT id, username, password_hash, is_active FROM app_users WHERE username = %s"
        result = db_manager.execute_query(query, (username,))
        
        if not result:
            logger.error(f"User '{username}' NOT FOUND in database!")
            return
            
        user_data = result[0]
        stored_hash = user_data.get("password_hash") or user_data.get("PASSWORD_HASH")
        logger.info(f"User Found. ID: {user_data.get('id')}")
        logger.info(f"Stored Hash (first 20 chars): {stored_hash[:20]}...")
        
        # 2. Verify Password Manually
        logger.info("--- 2. Manual Password Verification ---")
        is_valid = verify_password(password, stored_hash)
        logger.info(f"bcrypt.checkpw result: {is_valid}")
        
        if is_valid:
            logger.info("SUCCESS: Password hash matches!")
        else:
            logger.error("FAILURE: Password hash does NOT match!")
            
        # 3. Test authenticate_user function
        logger.info("--- 3. Testing authenticate_user() function ---")
        user = authenticate_user(username, password)
        if user:
            logger.info(f"SUCCESS: authenticate_user returned user: {user.username}")
        else:
            logger.error("FAILURE: authenticate_user returned None")
            
    except Exception as e:
        logger.error(f"An error occurred: {e}")

if __name__ == "__main__":
    test_login_verification()
