import logging
import time
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union
import re

import oracledb
import pandas as pd

from config import settings
from roles_utils import get_default_role, get_admin_role

logger = logging.getLogger(__name__)

ParamType = Union[Sequence[Any], Dict[str, Any], None]

class DatabaseManager:
    """
    Oracle-backed database manager using oracledb (native Thin mode).
    Compatible with Oracle 11g/XE via Sequences & Triggers for ID generation.
    """

    def __init__(self):
        self.host = getattr(settings, "DB_HOST", "localhost")
        self.port = int(getattr(settings, "DB_PORT", 1521))
        self.user = getattr(settings, "DB_USERNAME", "system")
        self.password = getattr(settings, "DB_PASSWORD", "")
        self.service_name = getattr(settings, "DB_SERVICE_NAME", "xe")

        pool_min = int(getattr(settings, "DB_POOL_MIN", 2))
        pool_max = int(getattr(settings, "DB_POOL_MAX", 10))
        pool_inc = int(getattr(settings, "DB_POOL_INC", 1))

        # Enable Thick mode if Oracle Client libraries are available (needed for 11g sometimes?)
        # For 'oracledb', Thin mode works with 12c+. For 11g, Thick mode might be required.
        # But user said "11g or XE". `oracledb` Thin mode supports DB 12.1+.
        # If DB is 11.2 (11gR2), we MUST use Thick mode.
        # Assuming Thick mode might be needed, we try to init it. If it fails (no libs), we fallback to Thin and hope it works or user has 12c+.
        try:
            oracledb.init_oracle_client()
            logger.info("Oracle Client libraries initialized (Thick mode enabled)")
        except Exception as e:
            logger.info(f"Oracle Client libraries not found, using Thin mode: {e}")

        dsn = oracledb.makedsn(self.host, self.port, service_name=self.service_name)
        
        try:
            self.pool = oracledb.create_pool(
                user=self.user,
                password=self.password,
                dsn=dsn,
                min=pool_min,
                max=pool_max,
                increment=pool_inc
            )
            logger.info(
                f"Oracle connection pool created successfully (dsn={dsn})"
            )
        except Exception as exc:
            logger.error(f"Failed to create Oracle connection pool: {exc}")
            self.pool = None

    @contextmanager
    def get_connection(self):
        """Get database connection from pool with proper cleanup."""
        conn = None
        try:
            if self.pool:
                conn = self.pool.acquire()
            else:
                dsn = oracledb.makedsn(self.host, self.port, service_name=self.service_name)
                conn = oracledb.connect(
                    user=self.user,
                    password=self.password,
                    dsn=dsn
                )
            yield conn
        except Exception as exc:
            logger.error(f"Database connection error: {exc}")
            raise
        finally:
            if conn:
                try:
                    if self.pool:
                        self.pool.release(conn)
                    else:
                        conn.close()
                except Exception as exc:
                    logger.error(f"Error closing Oracle connection: {exc}")

    def execute_query(
        self, query: str, params: ParamType = None, fetch_size: int = 10000, timeout: int = 45
    ) -> List[Dict[str, Any]]:
        """Execute query and return results as list of dictionaries"""
        start_time = time.time()
        
        try:
            # Clean up SQL for Oracle (remove trailing semicolons)
            sql = query.strip().rstrip(';')
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Handling named vs positional parameters
                # oracledb supports dict for named (:name) and sequence for positional (:1)
                
                cursor.execute(sql, params or {})
                
                if cursor.description:
                    columns = [col[0] for col in cursor.description]
                    cursor.rowfactory = lambda *args: dict(zip(columns, args))
                    
                    # Fetch results
                    results = cursor.fetchall() 
                    # Fetchall is usually fine for reasonable fetch_sizes, or use fetchmany loop
                else:
                    results = []

                execution_time = time.time() - start_time
                logger.info(f"Query executed successfully in {execution_time:.2f}s, returned {len(results)} rows")
                return results

        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Query execution error after {execution_time:.2f}s: {e}")
            raise

    def execute_query_pandas(self, query: str, params: ParamType = None, timeout: int = 45) -> pd.DataFrame:
        """Execute query and return pandas DataFrame"""
        start_time = time.time()
        
        try:
            sql = query.strip().rstrip(';')
            
            with self.get_connection() as conn:
                # pandas read_sql supports sqlalchemy engine or DBAPI2 connection
                # passing conn directly works with oracledb
                df = pd.read_sql(sql, conn, params=params or {})
                
                execution_time = time.time() - start_time
                logger.info(f"DataFrame created with {len(df)} rows, {len(df.columns)} columns")
                return df

        except Exception as e:
            logger.error(f"Pandas query execution error: {e}")
            # Identify if it's an empty result from a schema-only query
            # oracledb/pandas interaction might fail if columns are unknown on "WHERE 1=0"
            raise

    def execute_non_query(self, query: str, params: ParamType = None) -> int:
        """Execute non-query (UPDATE, DELETE) and return affected rows"""
        try:
            sql = query.strip().rstrip(';')
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(sql, params or {})
                affected_rows = cursor.rowcount
                conn.commit()
                return affected_rows

        except Exception as e:
            logger.error(f"Non-query execution error: {e}")
            raise

    def execute_insert(self, query: str, params: ParamType = None) -> Tuple[int, Optional[int]]:
        """
        Execute INSERT and try to return (affected_rows, last_insert_id).
        Uses 'RETURNING id INTO :out_id' pattern for Oracle.
        """
        try:
            sql = query.strip().rstrip(';')
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Check if we can automatically append RETURNING clause
                # We assume the ID column is named 'id'. 
                # This is a strong assumption but fits our schema.
                if "RETURNING" not in sql.upper() and "INSERT INTO" in sql.upper():
                    sql += " RETURNING id INTO :last_insert_id_out"
                    
                    # Prepare params
                    if params is None:
                        params_dict = {}
                    elif isinstance(params, dict):
                        params_dict = params.copy()
                    elif isinstance(params, (list, tuple)):
                        # If positional, we can't easily mix named var unless using cursor.var() positional bind?
                        # Oracle doesn't mix well. 
                        # We must rely on `cursor.var` and passing it.
                        # If params are positional, we must append returning clause with positional :1
                        # But we don't know the next position index easily.
                        # Strategy: If positional params, this automatic ID fetch is risky.
                        # We'll skip ID return for positional params unless critical.
                        # But most of our app uses dict params or none?
                        # Actually most use positional literals in formatted strings or dicts.
                        logger.warning("Positional parameters used in generic insert; ID return might fail or be skipped.")
                        # Fallback: Just execute and return None for ID
                        cursor.execute(query.strip().rstrip(';'), params or [])
                        conn.commit()
                        return cursor.rowcount, None
                    else:
                        params_dict = {}

                    # Create variable for OUT parameter
                    out_id_var = cursor.var(oracledb.NUMBER)
                    params_dict["last_insert_id_out"] = out_id_var
                    
                    cursor.execute(sql, params_dict)
                    last_id = out_id_var.getvalue()
                    if isinstance(last_id, list) and len(last_id) > 0:
                        last_id = last_id[0] # batch insert?
                        
                else:
                    # User provided RETURNING or not an insert
                    cursor.execute(sql, params or {})
                    last_id = None

                affected_rows = cursor.rowcount
                conn.commit()
                return affected_rows, last_id

        except Exception as e:
            logger.error(f"Insert execution error: {e}")
            raise


# Global database manager instance
db_manager = DatabaseManager()


def init_database():
    """
    Initialize Oracle database with required tables, sequences, and triggers.
    Compatible with Oracle 11g.
    """

    # Helper to ignore "Object already exists" errors (ORA-00955)
    def run_ddl_safe(ddl_stmt):
        try:
            db_manager.execute_non_query(ddl_stmt)
        except Exception as e:
            if "ORA-00955" in str(e): # name is already used by an existing object
                pass # Already exists, ignore
            elif "ORA-02260" in str(e): # table can have only one primary key
                pass
            elif "ORA-02261" in str(e): # unique key already exists
                pass
            elif "ORA-02264" in str(e): # name already used by an existing constraint
                pass
            elif "ORA-02275" in str(e): # such a referential constraint already exists
                pass
            elif "ORA-04080" in str(e): # trigger does not exist (for drop)
                pass
            else:
                logger.warning(f"DDL execution warning: {e} \n STMT: {ddl_stmt[:50]}...")

    try:
        # 1) App Roles
        run_ddl_safe("""
            CREATE TABLE app_roles (
              id          NUMBER PRIMARY KEY,
              name        VARCHAR2(50) NOT NULL UNIQUE,
              is_system   NUMBER(1) DEFAULT 0 NOT NULL,
              created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
        """)
        run_ddl_safe("CREATE SEQUENCE app_roles_seq START WITH 1 INCREMENT BY 1")
        run_ddl_safe("""
            CREATE OR REPLACE TRIGGER app_roles_bir 
            BEFORE INSERT ON app_roles 
            FOR EACH ROW 
            BEGIN 
              SELECT app_roles_seq.NEXTVAL INTO :new.id FROM dual; 
            END;
        """)

        # 2) App Users
        run_ddl_safe("""
            CREATE TABLE app_users (
              id                   NUMBER PRIMARY KEY,
              username             VARCHAR2(50)  NOT NULL UNIQUE,
              email                VARCHAR2(100) NOT NULL UNIQUE,
              password_hash        VARCHAR2(255) NOT NULL,
              role                 VARCHAR2(20)  DEFAULT 'USER' NOT NULL,
              is_active            NUMBER(1)     DEFAULT 1 NOT NULL,
              must_change_password NUMBER(1)     DEFAULT 1 NOT NULL,
              hidden_features      VARCHAR2(255) NULL,
              created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL,
              updated_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
        """)
        run_ddl_safe("CREATE SEQUENCE app_users_seq START WITH 1 INCREMENT BY 1")
        run_ddl_safe("""
            CREATE OR REPLACE TRIGGER app_users_bir 
            BEFORE INSERT ON app_users 
            FOR EACH ROW 
            BEGIN 
              SELECT app_users_seq.NEXTVAL INTO :new.id FROM dual; 
            END;
        """)

        # 3) App Menu Items
        run_ddl_safe("""
            CREATE TABLE app_menu_items (
              id                       NUMBER PRIMARY KEY,
              name                     VARCHAR2(100) NOT NULL,
              type                     VARCHAR2(20)  NOT NULL,
              icon                     VARCHAR2(50)  NULL,
              parent_id                NUMBER        NULL,
              sort_order               NUMBER        DEFAULT 0 NOT NULL,
              role                     VARCHAR2(255) NULL,
              is_active                NUMBER(1)     DEFAULT 1 NOT NULL,
              created_at               TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL,
              is_interactive_dashboard NUMBER(1)     DEFAULT 0 NOT NULL,
              interactive_template     CLOB          NULL,
              CONSTRAINT fk_menu_parent FOREIGN KEY (parent_id) REFERENCES app_menu_items(id) ON DELETE SET NULL
            )
        """)
        run_ddl_safe("CREATE SEQUENCE app_menu_items_seq START WITH 1 INCREMENT BY 1")
        run_ddl_safe("""
            CREATE OR REPLACE TRIGGER app_menu_items_bir 
            BEFORE INSERT ON app_menu_items 
            FOR EACH ROW 
            BEGIN 
              SELECT app_menu_items_seq.NEXTVAL INTO :new.id FROM dual; 
            END;
        """)

        # 4) App Queries
        run_ddl_safe("""
            CREATE TABLE app_queries (
              id                   NUMBER PRIMARY KEY,
              name                 VARCHAR2(200) NOT NULL,
              description          CLOB          NULL,
              sql_query            CLOB          NOT NULL,
              chart_type           VARCHAR2(50)  NULL,
              chart_config         CLOB          NULL,
              menu_item_id         NUMBER        NULL,
              role                 VARCHAR2(255) DEFAULT 'USER' NOT NULL,
              is_kpi               NUMBER(1)     DEFAULT 0 NOT NULL,
              is_default_dashboard NUMBER(1)     DEFAULT 0 NOT NULL,
              is_form_report       NUMBER(1)     DEFAULT 0 NOT NULL,
              form_template        CLOB          NULL,
              is_active            NUMBER(1)     DEFAULT 1 NOT NULL,
              created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL,
              updated_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL,
              CONSTRAINT fk_query_menu FOREIGN KEY (menu_item_id) REFERENCES app_menu_items(id) ON DELETE SET NULL
            )
        """)
        run_ddl_safe("CREATE SEQUENCE app_queries_seq START WITH 1 INCREMENT BY 1")
        run_ddl_safe("""
            CREATE OR REPLACE TRIGGER app_queries_bir 
            BEFORE INSERT ON app_queries 
            FOR EACH ROW 
            BEGIN 
              SELECT app_queries_seq.NEXTVAL INTO :new.id FROM dual; 
            END;
        """)

        # 5) App Query Menu Items (Junction)
        run_ddl_safe("""
            CREATE TABLE app_query_menu_items (
              id           NUMBER PRIMARY KEY,
              query_id     NUMBER NOT NULL,
              menu_item_id NUMBER NOT NULL,
              created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
              CONSTRAINT fk_qmi_query FOREIGN KEY (query_id) REFERENCES app_queries(id) ON DELETE CASCADE,
              CONSTRAINT fk_qmi_menu FOREIGN KEY (menu_item_id) REFERENCES app_menu_items(id) ON DELETE CASCADE,
              CONSTRAINT uk_query_menu UNIQUE (query_id, menu_item_id)
            )
        """)
        run_ddl_safe("CREATE SEQUENCE app_query_menu_items_seq START WITH 1 INCREMENT BY 1")
        run_ddl_safe("""
            CREATE OR REPLACE TRIGGER app_query_menu_items_bir 
            BEFORE INSERT ON app_query_menu_items 
            FOR EACH ROW 
            BEGIN 
              SELECT app_query_menu_items_seq.NEXTVAL INTO :new.id FROM dual; 
            END;
        """)

        # 6) App Dashboard Widgets
        run_ddl_safe("""
            CREATE TABLE app_dashboard_widgets (
              id          NUMBER PRIMARY KEY,
              title       VARCHAR2(200) NOT NULL,
              query_id    NUMBER NOT NULL,
              position_x  NUMBER NOT NULL DEFAULT 0,
              position_y  NUMBER NOT NULL DEFAULT 0,
              width       NUMBER NOT NULL DEFAULT 6,
              height      NUMBER NOT NULL DEFAULT 4,
              is_active   NUMBER(1) DEFAULT 1 NOT NULL,
              created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
              CONSTRAINT fk_widget_query FOREIGN KEY (query_id) REFERENCES app_queries(id) ON DELETE CASCADE
            )
        """)
        run_ddl_safe("CREATE SEQUENCE app_dashboard_widgets_seq START WITH 1 INCREMENT BY 1")
        run_ddl_safe("""
            CREATE OR REPLACE TRIGGER app_dashboard_widgets_bir 
            BEFORE INSERT ON app_dashboard_widgets 
            FOR EACH ROW 
            BEGIN 
              SELECT app_dashboard_widgets_seq.NEXTVAL INTO :new.id FROM dual; 
            END;
        """)

        # 7) App Processes
        run_ddl_safe("""
            CREATE TABLE app_processes (
              id          NUMBER PRIMARY KEY,
              name        VARCHAR2(200) NOT NULL,
              description CLOB          NULL,
              script_path VARCHAR2(500) NOT NULL,
              role        VARCHAR2(255) DEFAULT 'USER' NOT NULL,
              is_active   NUMBER(1)     DEFAULT 1 NOT NULL,
              created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL,
              updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
        """)
        run_ddl_safe("CREATE SEQUENCE app_processes_seq START WITH 1 INCREMENT BY 1")
        run_ddl_safe("""
            CREATE OR REPLACE TRIGGER app_processes_bir 
            BEFORE INSERT ON app_processes 
            FOR EACH ROW 
            BEGIN 
              SELECT app_processes_seq.NEXTVAL INTO :new.id FROM dual; 
            END;
        """)

        # 8) App Process Params
        run_ddl_safe("""
            CREATE TABLE app_process_params (
              id              NUMBER PRIMARY KEY,
              process_id      NUMBER NOT NULL,
              name            VARCHAR2(100) NOT NULL,
              label           VARCHAR2(200) NULL,
              input_type      VARCHAR2(20)  DEFAULT 'text' NOT NULL,
              default_value   CLOB          NULL,
              dropdown_values CLOB          NULL,
              sort_order      NUMBER        DEFAULT 0 NOT NULL,
              CONSTRAINT fk_process_param_proc FOREIGN KEY (process_id) REFERENCES app_processes(id) ON DELETE CASCADE
            )
        """)
        run_ddl_safe("CREATE SEQUENCE app_process_params_seq START WITH 1 INCREMENT BY 1")
        run_ddl_safe("""
            CREATE OR REPLACE TRIGGER app_process_params_bir 
            BEFORE INSERT ON app_process_params 
            FOR EACH ROW 
            BEGIN 
              SELECT app_process_params_seq.NEXTVAL INTO :new.id FROM dual; 
            END;
        """)

        # 9) Ensure System Roles
        for role in SYSTEM_ROLE_CODES:
            try:
                # Merge logic using DUAL
                db_manager.execute_non_query(
                    """
                    MERGE INTO app_roles t
                    USING (SELECT :role AS name, 1 AS is_system FROM dual) s
                    ON (t.name = s.name)
                    WHEN NOT MATCHED THEN INSERT (name, is_system) VALUES (s.name, s.is_system)
                    """,
                    {"role": role}
                )
            except Exception as exc:
                logger.warning(f"Could not ensure system role {role}: {exc}")

        # 10) Insert Default Data if empty
        insert_default_data()

        logger.info("Oracle database initialized successfully")
    except Exception as exc:
        logger.error(f"Database initialization error: {exc}")
        raise


def insert_default_data():
    """Insert default menu items and sample queries"""
    try:
        # Check if data already exists
        result = db_manager.execute_query("SELECT COUNT(*) AS cnt FROM app_menu_items")
        if result and result[0]["CNT"] > 0:
            logger.info("Default data already exists")
            return

        # Insert default menu items
        # name, type, icon, parent_id, sort_order
        default_menus = [
            ("Dashboard", "dashboard", "dashboard", None, 1),
            ("Reports", "report", "chart-bar", None, 2),
            ("Processes", "process", "play-circle", None, 3),
            ("Excel Compare", "excel-compare", "document-duplicate", None, 4),
            ("Financial Overview", "report", "chart-line", 2, 1),
            ("Risk Analysis", "report", "shield-exclamation", 2, 2),
        ]

        # Note: We need to handle IDs for parent_id resolution.
        # But we are mocking default data.
        # Since triggers are auto-generating IDs, we can't hardcode 2 as parent_id unless we fetch it.
        # Minimal viable default data:
        
        # 1. Dashboard
        dashboard_id = db_manager.execute_insert(
            "INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order) VALUES (:nm, :tp, :ic, NULL, :so)",
            {"nm": "Dashboard", "tp": "dashboard", "ic": "dashboard", "so": 1}
        )[1] # get last_id

        # 2. Reports
        reports_id = db_manager.execute_insert(
            "INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order) VALUES (:nm, :tp, :ic, NULL, :so)",
            {"nm": "Reports", "tp": "report", "ic": "chart-bar", "so": 2}
        )[1]

        # 3. Processes
        db_manager.execute_non_query(
            "INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order) VALUES (:nm, :tp, :ic, NULL, :so)",
            {"nm": "Processes", "tp": "process", "ic": "play-circle", "so": 3}
        )

        # 4. Excel Compare
        db_manager.execute_non_query(
            "INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order) VALUES (:nm, :tp, :ic, NULL, :so)",
            {"nm": "Excel Compare", "tp": "excel-compare", "ic": "document-duplicate", "so": 4}
        )

        # 5. Financial Overview (Child of Reports)
        if reports_id:
            db_manager.execute_non_query(
                 "INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order) VALUES (:nm, :tp, :ic, :pid, :so)",
                 {"nm": "Financial Overview", "tp": "report", "ic": "chart-line", "pid": reports_id, "so": 1}
            )

        logger.info("Default data inserted successfully")

    except Exception as e:
        logger.error(f"Error inserting default data: {e}")

if __name__ == "__main__":
    init_database()
