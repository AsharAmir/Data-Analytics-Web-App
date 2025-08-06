import oracledb
import pandas as pd
from typing import List, Dict, Any
from config import settings
import logging
import time
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class DatabaseManager:
    def __init__(self):
        # Oracle connection string for oracledb
        self.dsn = oracledb.makedsn(
            settings.DB_HOST, settings.DB_PORT, service_name=settings.DB_SERVICE_NAME
        )
        self.username = settings.DB_USERNAME
        self.password = settings.DB_PASSWORD
        
        # Connection pool for better performance
        try:
            self.pool = oracledb.create_pool(
                user=self.username,
                password=self.password,
                dsn=self.dsn,
                min=2,  # Minimum connections
                max=10,  # Maximum connections  
                increment=1,  # Connection increment
                connectiontype=oracledb.Connection,
                getmode=oracledb.POOL_GETMODE_WAIT,
                timeout=30,  # Pool timeout
                wait_timeout=5000  # Wait timeout in milliseconds
            )
            logger.info("Database connection pool created successfully")
        except Exception as e:
            logger.error(f"Failed to create connection pool: {e}")
            self.pool = None

    @contextmanager
    def get_connection(self):
        """Get database connection from pool with proper cleanup"""
        conn = None
        try:
            if self.pool:
                conn = self.pool.acquire()
            else:
                # Fallback to direct connection
                conn = oracledb.connect(
                    user=self.username, password=self.password, dsn=self.dsn
                )
            yield conn
        except Exception as e:
            logger.error(f"Database connection error: {e}")
            raise
        finally:
            if conn:
                try:
                    if self.pool:
                        self.pool.release(conn)
                    else:
                        conn.close()
                except Exception as e:
                    logger.error(f"Error closing connection: {e}")

    def execute_query(
        self, query: str, params: tuple = None, fetch_size: int = 10000, timeout: int = 45
    ) -> List[Dict[str, Any]]:
        """Execute query and return results as list of dictionaries with timeout"""
        start_time = time.time()
        
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()

                # Set fetch size for large datasets
                cursor.arraysize = fetch_size

                # Execute with timeout monitoring
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)

                # Get column names
                columns = [column[0] for column in cursor.description]

                # Fetch results in chunks for memory efficiency with optional timeout check
                results = []
                while True:
                    # Check for timeout only if timeout > 0 (0 means unlimited)
                    if timeout > 0 and time.time() - start_time > timeout:
                        logger.warning(f"Query execution timeout after {timeout}s")
                        cursor.close()
                        raise TimeoutError(f"Query execution exceeded {timeout} seconds")
                    
                    rows = cursor.fetchmany(fetch_size)
                    if not rows:
                        break

                    for row in rows:
                        # Convert Oracle LOB objects to plain strings
                        converted: Dict[str, Any] = {}
                        for col, val in zip(columns, row):
                            if isinstance(val, oracledb.LOB):
                                try:
                                    converted[col] = val.read()
                                except Exception:
                                    converted[col] = str(val)
                            else:
                                converted[col] = val
                        results.append(converted)

                execution_time = time.time() - start_time
                if timeout == 0:
                    logger.info(f"Query executed successfully in {execution_time:.2f}s, returned {len(results)} rows (unlimited timeout)")
                else:
                    logger.info(f"Query executed successfully in {execution_time:.2f}s, returned {len(results)} rows")
                return results

        except TimeoutError:
            raise
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Query execution error after {execution_time:.2f}s: {e}")
            raise

    def execute_query_pandas(self, query: str, params: tuple = None, timeout: int = 45) -> pd.DataFrame:
        """Execute query and return pandas DataFrame for large datasets with timeout"""
        try:
            # Use the timeout-enabled execute_query method
            results = self.execute_query(query, params, timeout=timeout)
            df = pd.DataFrame(results)
            if timeout == 0:
                logger.info(f"DataFrame created with {len(df)} rows, {len(df.columns)} columns (unlimited timeout)")
            else:
                logger.info(f"DataFrame created with {len(df)} rows, {len(df.columns)} columns")
            return df
        except TimeoutError:
            if timeout > 0:
                logger.error(f"Pandas query execution timeout after {timeout}s")
            raise
        except Exception as e:
            logger.error(f"Pandas query execution error: {e}")
            raise

    def execute_non_query(self, query: str, params: tuple = None) -> int:
        """Execute non-query (INSERT, UPDATE, DELETE) and return affected rows"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)

                affected_rows = cursor.rowcount
                conn.commit()
                return affected_rows

        except Exception as e:
            logger.error(f"Non-query execution error: {e}")
            raise


# Global database manager instance
db_manager = DatabaseManager()


# Initialize database with required tables for the application
def init_database():
    """Initialize database with required tables for dynamic menus, queries, etc."""

    # Create users table for authentication
    create_users_table = """
    CREATE TABLE app_users (
        id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        username VARCHAR2(50) UNIQUE NOT NULL,
        email VARCHAR2(100) UNIQUE NOT NULL,
        password_hash VARCHAR2(255) NOT NULL,
        role VARCHAR2(20) DEFAULT 'user' NOT NULL,
        is_active NUMBER(1) DEFAULT 1,
        must_change_password NUMBER(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """

    # Create menu items table for dynamic sidebar
    create_menu_items_table = """
    CREATE TABLE app_menu_items (
        id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        name VARCHAR2(100) NOT NULL,
        type VARCHAR2(20) NOT NULL,
        icon VARCHAR2(50),
        parent_id NUMBER,
        sort_order NUMBER DEFAULT 0,
        is_active NUMBER(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_menu_parent FOREIGN KEY (parent_id) REFERENCES app_menu_items(id)
    )
    """

    # Create queries table for storing SQL queries
    create_queries_table = """
    CREATE TABLE app_queries (
        id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        name VARCHAR2(200) NOT NULL,
        description CLOB,
        sql_query CLOB NOT NULL,
        chart_type VARCHAR2(50),
        chart_config CLOB,
        menu_item_id NUMBER,
        role VARCHAR2(20) DEFAULT 'user',
        is_active NUMBER(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_query_menu FOREIGN KEY (menu_item_id) REFERENCES app_menu_items(id)
    )
    """

    # Create query-menu junction table for many-to-many relationships
    create_query_menu_table = """
    CREATE TABLE app_query_menu_items (
        id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        query_id NUMBER NOT NULL,
        menu_item_id NUMBER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_qmi_query FOREIGN KEY (query_id) REFERENCES app_queries(id) ON DELETE CASCADE,
        CONSTRAINT fk_qmi_menu FOREIGN KEY (menu_item_id) REFERENCES app_menu_items(id) ON DELETE CASCADE,
        CONSTRAINT uk_query_menu UNIQUE (query_id, menu_item_id)
    )
    """

    # Create dashboard widgets table
    create_dashboard_widgets_table = """
    CREATE TABLE app_dashboard_widgets (
        id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        title VARCHAR2(200) NOT NULL,
        query_id NUMBER NOT NULL,
        position_x NUMBER DEFAULT 0,
        position_y NUMBER DEFAULT 0,
        width NUMBER DEFAULT 6,
        height NUMBER DEFAULT 4,
        is_active NUMBER(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_widget_query FOREIGN KEY (query_id) REFERENCES app_queries(id)
    )
    """

    create_roles_table = """
    CREATE TABLE app_roles (
        id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        name VARCHAR2(50) UNIQUE NOT NULL,
        is_system NUMBER(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """

    # Create processes table for standalone scripts
    create_processes_table = """
    CREATE TABLE app_processes (
        id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        name VARCHAR2(200) NOT NULL,
        description CLOB,
        script_path VARCHAR2(500) NOT NULL,
        role VARCHAR2(255) DEFAULT 'user',
        is_active NUMBER(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """

    # Create process parameters table
    create_process_params_table = """
    CREATE TABLE app_process_params (
        id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        process_id NUMBER NOT NULL,
        name VARCHAR2(100) NOT NULL,
        label VARCHAR2(200),
        input_type VARCHAR2(20) DEFAULT 'text',
        default_value CLOB,
        dropdown_values CLOB,
        sort_order NUMBER DEFAULT 0,
        CONSTRAINT fk_process_param_proc FOREIGN KEY (process_id) REFERENCES app_processes(id) ON DELETE CASCADE
    )
    """

    try:
        # Create tables
        tables = [
            ("app_users", create_users_table),
            ("app_roles", create_roles_table),
            ("app_menu_items", create_menu_items_table),
            ("app_queries", create_queries_table),
            ("app_query_menu_items", create_query_menu_table),
            ("app_dashboard_widgets", create_dashboard_widgets_table),
            ("app_processes", create_processes_table),
            ("app_process_params", create_process_params_table),
        ]

        for table_name, table_sql in tables:
            try:
                # Check if table exists first
                check_query = f"SELECT COUNT(*) FROM user_tables WHERE table_name = UPPER('{table_name}')"
                result = db_manager.execute_query(check_query)

                if result[0]["COUNT(*)"] == 0:
                    db_manager.execute_non_query(table_sql)
                    logger.info(f"Created table: {table_name}")
                else:
                    logger.info(f"Table already exists: {table_name}")

            except Exception as e:
                logger.warning(f"Table creation warning for {table_name}: {e}")
        try:
            # Initialize all system roles from the frontend enum
            system_roles = ["ADMIN", "CEO", "FINANCE_USER", "TECH_USER", "USER"]
            
            for sys_role in system_roles:
                try:
                    # Check if role exists
                    check_query = "SELECT COUNT(*) FROM app_roles WHERE UPPER(name) = UPPER(:1)"
                    exists = db_manager.execute_query(check_query, (sys_role,))
                    
                    if not exists or exists[0]["COUNT(*)"] == 0:
                        db_manager.execute_non_query(
                            "INSERT INTO app_roles (name, is_system) VALUES (:1, 1)",
                            (sys_role,),
                        )
                        logger.info(f"Created system role: {sys_role}")
                except Exception as e:
                    logger.warning(f"Could not insert system role {sys_role}: {e}")
        except Exception as exc:
            logger.warning(f"Error ensuring default roles: {exc}")

        # Check and add role & must_change_password columns to existing app_users table if missing
        try:
            check_column_query = """
                SELECT COUNT(*) FROM user_tab_columns 
                WHERE table_name = 'APP_USERS' AND column_name = 'ROLE'
            """
            result = db_manager.execute_query(check_column_query)

            if result[0]["COUNT(*)"] == 0:
                # Add role column to existing table
                alter_table_sql = """
                    ALTER TABLE app_users ADD (role VARCHAR2(20) DEFAULT 'user' NOT NULL)
                """
                db_manager.execute_non_query(alter_table_sql)
                logger.info("Added role column to app_users table")

                # Update admin user to have admin role
                update_admin_sql = """
                    UPDATE app_users SET role = 'admin' WHERE username = 'admin'
                """
                db_manager.execute_non_query(update_admin_sql)
                logger.info("Updated admin user with admin role")
            else:
                logger.info("Role column already exists in app_users table")

            # Ensure must_change_password column exists
            check_mcp_query = """
                SELECT COUNT(*) FROM user_tab_columns 
                WHERE table_name = 'APP_USERS' AND column_name = 'MUST_CHANGE_PASSWORD'
            """
            mcp_result = db_manager.execute_query(check_mcp_query)

            if mcp_result[0]["COUNT(*)"] == 0:
                db_manager.execute_non_query(
                    "ALTER TABLE app_users ADD (must_change_password NUMBER(1) DEFAULT 1)"
                )
                logger.info("Added must_change_password column to app_users table")
            else:
                logger.info("must_change_password column already exists in app_users table")

        except Exception as e:
            logger.warning(f"Error updating app_users table schema: {e}")

        # Ensure ROLE column exists in APP_QUERIES
        try:
            check_role_query = """
                SELECT COUNT(*) FROM user_tab_columns 
                WHERE table_name = 'APP_QUERIES' AND column_name = 'ROLE'
            """
            role_result = db_manager.execute_query(check_role_query)
            if role_result[0]["COUNT(*)"] == 0:
                db_manager.execute_non_query("ALTER TABLE app_queries ADD (role VARCHAR2(20) DEFAULT 'user')")
                logger.info("Added role column to app_queries table")
            else:
                logger.info("Role column already exists in app_queries table")
        except Exception as e:
            logger.warning(f"Error updating app_queries table schema: {e}")

        # Insert default data
        insert_default_data()
        logger.info("Database initialized successfully")

    except Exception as e:
        logger.error(f"Database initialization error: {e}")
        raise


def insert_default_data():
    """Insert default menu items and sample queries"""

    try:
        # Check if data already exists
        result = db_manager.execute_query("SELECT COUNT(*) FROM app_menu_items")
        if result[0]["COUNT(*)"] > 0:
            logger.info("Default data already exists")
            return

        # Insert default menu items
        default_menus = [
            ("Dashboard", "dashboard", "dashboard", None, 1),
            ("Reports", "report", "chart-bar", None, 2),
            ("Processes", "process", "play-circle", None, 3),
            ("Excel Compare", "excel-compare", "document-duplicate", None, 4),
            ("Financial Overview", "report", "chart-line", 2, 1),
            ("Risk Analysis", "report", "shield-exclamation", 2, 2),
        ]

        for name, type_, icon, parent_id, sort_order in default_menus:
            try:
                db_manager.execute_non_query(
                    "INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order) VALUES (:1, :2, :3, :4, :5)",
                    (name, type_, icon, parent_id, sort_order),
                )
            except Exception as e:
                logger.warning(f"Menu item insertion warning: {e}")

        # Insert sample queries based on SAMPLE_BT table
        sample_queries = [
            (
                "Record Count by Report Type",
                "Analysis of records by report type",
                "SELECT REP_TYPE, COUNT(*) as record_count FROM SAMPLE_BT GROUP BY REP_TYPE ORDER BY record_count DESC",
                "bar",
                '{"responsive": true, "plugins": {"legend": {"position": "top"}}}',
                3,
            ),
            (
                "Product Type Distribution",
                "Distribution of records by product type",
                "SELECT CT_PRINACT, COUNT(*) as count FROM SAMPLE_BT WHERE CT_PRINACT IS NOT NULL GROUP BY CT_PRINACT ORDER BY count DESC",
                "pie",
                '{"responsive": true}',
                3,
            ),
            (
                "Financial Value Analysis",
                "Analysis of FCC_BKV values over records",
                "SELECT CASE WHEN FCC_BKV = 0 THEN 'Zero' WHEN FCC_BKV > 0 AND FCC_BKV <= 1000 THEN 'Low' WHEN FCC_BKV > 1000 AND FCC_BKV <= 10000 THEN 'Medium' ELSE 'High' END as value_range, COUNT(*) as record_count FROM SAMPLE_BT GROUP BY CASE WHEN FCC_BKV = 0 THEN 'Zero' WHEN FCC_BKV > 0 AND FCC_BKV <= 1000 THEN 'Low' WHEN FCC_BKV > 1000 AND FCC_BKV <= 10000 THEN 'Medium' ELSE 'High' END ORDER BY record_count DESC",
                "line",
                '{"responsive": true, "scales": {"y": {"beginAtZero": true}}}',
                4,
            ),
        ]

        for (
            name,
            description,
            sql_query,
            chart_type,
            chart_config,
            menu_item_id,
        ) in sample_queries:
            try:
                db_manager.execute_non_query(
                    "INSERT INTO app_queries (name, description, sql_query, chart_type, chart_config, menu_item_id) VALUES (:1, :2, :3, :4, :5, :6)",
                    (
                        name,
                        description,
                        sql_query,
                        chart_type,
                        chart_config,
                        menu_item_id,
                    ),
                )
            except Exception as e:
                logger.warning(f"Query insertion warning: {e}")

        # Note: Default dashboard widgets creation removed to allow clean customization
        # Users can create widgets through the admin panel as needed

        logger.info("Default data inserted successfully")

    except Exception as e:
        logger.error(f"Error inserting default data: {e}")


if __name__ == "__main__":
    init_database()
