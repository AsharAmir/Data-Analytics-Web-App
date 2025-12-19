-- -------------------------------------------------------------------
-- Create database
-- -------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS analytics
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE analytics;

-- -------------------------------------------------------------------
-- 1. Roles
-- -------------------------------------------------------------------
CREATE TABLE app_roles (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  is_system   TINYINT(1) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO app_roles (name, is_system) VALUES
  ('ADMIN',        1),
  ('IT_USER',      1),
  ('CEO',          1),
  ('FINANCE_USER', 1),
  ('TECH_USER',    1),
  ('USER',         1);

-- -------------------------------------------------------------------
-- 2. Users
-- -------------------------------------------------------------------
CREATE TABLE app_users (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username             VARCHAR(50)  NOT NULL UNIQUE,
  email                VARCHAR(100) NOT NULL UNIQUE,
  password_hash        VARCHAR(255) NOT NULL,
  role                 VARCHAR(20)  NOT NULL DEFAULT 'USER',
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  must_change_password TINYINT(1)   NOT NULL DEFAULT 1,
  hidden_features      VARCHAR(255) NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- NOTE: replace REPLACE_WITH_BCRYPT_ADMIN123 with a real bcrypt hash for 'admin123'
INSERT INTO app_users (username, email, password_hash, role, is_active, must_change_password, hidden_features)
VALUES
  ('admin', 'admin@example.com', 'REPLACE_WITH_BCRYPT_ADMIN123', 'ADMIN', 1, 0, NULL);

-- -------------------------------------------------------------------
-- 3. Menu items (side bar structure)
-- -------------------------------------------------------------------
CREATE TABLE app_menu_items (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name                     VARCHAR(100) NOT NULL,
  type                     VARCHAR(20)  NOT NULL, -- 'dashboard' or 'report'
  icon                     VARCHAR(50)  NULL,
  parent_id                BIGINT UNSIGNED NULL,
  sort_order               INT          NOT NULL DEFAULT 0,
  role                     VARCHAR(255) NULL,
  is_active                TINYINT(1)   NOT NULL DEFAULT 1,
  created_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_interactive_dashboard TINYINT(1)   NOT NULL DEFAULT 0,
  interactive_template     LONGTEXT     NULL,
  CONSTRAINT fk_menu_parent
    FOREIGN KEY (parent_id) REFERENCES app_menu_items(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Seed: basic menus
INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order, role, is_active, is_interactive_dashboard)
VALUES
  ('Default Dashboard', 'dashboard', 'home',      NULL, 1, 'ADMIN,USER,CEO,FINANCE_USER', 1, 0),
  ('Reports',           'report',    'document',  NULL, 2, 'ADMIN,USER,CEO,FINANCE_USER', 1, 0),
  ('Interactive Demo',  'dashboard', 'sparkles',  NULL, 3, 'ADMIN,CEO',                   1, 1);

-- Example interactive layout (very simple) bound to query IDs 1 and 2
UPDATE app_menu_items
SET interactive_template = '
<div class="grid grid-cols-2 gap-4">
  <div data-query-id="1" data-widget-type="chart" data-chart-type="bar"></div>
  <div data-query-id="2" data-widget-type="table"></div>
  <div>
    <label>Status</label>
    <select data-filter data-query-id="2" data-column="STATUS" data-operator="eq">
      <option value="">All</option>
      <option value="OPEN">Open</option>
      <option value="CLOSED">Closed</option>
    </select>
  </div>
</div>'
WHERE name = 'Interactive Demo';

-- -------------------------------------------------------------------
-- 4. Queries (reports + KPIs + form reports)
-- -------------------------------------------------------------------
CREATE TABLE app_queries (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(200) NOT NULL,
  description         LONGTEXT     NULL,
  sql_query           LONGTEXT     NOT NULL,
  chart_type          VARCHAR(50)  NULL,
  chart_config        LONGTEXT     NULL,
  menu_item_id        BIGINT UNSIGNED NULL,
  role                VARCHAR(255) NOT NULL DEFAULT 'USER',
  is_kpi              TINYINT(1)   NOT NULL DEFAULT 0,
  is_default_dashboard TINYINT(1)  NOT NULL DEFAULT 0,
  is_form_report      TINYINT(1)   NOT NULL DEFAULT 0,
  form_template       LONGTEXT     NULL,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                   ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_query_menu
    FOREIGN KEY (menu_item_id) REFERENCES app_menu_items(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- Example simple demo queries (adapt SQL to your real schema)
INSERT INTO app_queries
  (name, description, sql_query, chart_type, chart_config,
   menu_item_id, role, is_kpi, is_default_dashboard, is_form_report, form_template)
VALUES
  -- Dashboard KPI
  ('Total Orders (Demo)',
   'Total number of orders in demo schema',
   'SELECT COUNT(*) AS total_orders FROM demo_orders',
   'kpi',
   '{}',
   (SELECT id FROM app_menu_items WHERE name = ''Default Dashboard'' LIMIT 1),
   'ADMIN,CEO,USER',
   1,
   1,
   0,
   NULL),

  -- Chart report
  ('Orders by Status (Demo)',
   'Bar chart of orders grouped by status',
   'SELECT status, COUNT(*) AS cnt FROM demo_orders GROUP BY status ORDER BY cnt DESC',
   'bar',
   '{}',
   (SELECT id FROM app_menu_items WHERE name = ''Default Dashboard'' LIMIT 1),
   'ADMIN,CEO,USER',
   0,
   1,
   0,
   NULL),

  -- Form-based report
  ('Orders Filter (Demo)',
   'Form-based report to filter orders by date and status',
   'SELECT id, customer_name, status, order_date, total_amount
    FROM demo_orders
    WHERE (@DATE_FROM IS NULL OR order_date >= @DATE_FROM)
      AND (@DATE_TO   IS NULL OR order_date <= @DATE_TO)',
   'table',
   '{}',
   (SELECT id FROM app_menu_items WHERE name = ''Reports'' LIMIT 1),
   'ADMIN,USER',
   0,
   0,
   1,
   '<form>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label>Date from</label>
          <input type="date" data-column="ORDER_DATE" data-operator="gte" />
        </div>
        <div>
          <label>Date to</label>
          <input type="date" data-column="ORDER_DATE" data-operator="lte" />
        </div>
        <div>
          <label>Status</label>
          <select data-column="STATUS" data-operator="eq">
            <option value="">All</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>
      <button type="submit">Run report</button>
    </form>');

-- -------------------------------------------------------------------
-- 5. Query ↔ Menu junction (many-to-many)
-- -------------------------------------------------------------------
CREATE TABLE app_query_menu_items (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  query_id    BIGINT UNSIGNED NOT NULL,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_qmi_query
    FOREIGN KEY (query_id) REFERENCES app_queries(id) ON DELETE CASCADE,
  CONSTRAINT fk_qmi_menu
    FOREIGN KEY (menu_item_id) REFERENCES app_menu_items(id) ON DELETE CASCADE,
  CONSTRAINT uk_query_menu UNIQUE (query_id, menu_item_id)
) ENGINE=InnoDB;

-- Optional: link form-based demo report explicitly to Reports menu
INSERT INTO app_query_menu_items (query_id, menu_item_id)
SELECT q.id, m.id
FROM app_queries q
JOIN app_menu_items m ON m.name = 'Reports'
WHERE q.name = 'Orders Filter (Demo)'
LIMIT 1;

-- -------------------------------------------------------------------
-- 6. Dashboard widgets
-- -------------------------------------------------------------------
CREATE TABLE app_dashboard_widgets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  query_id    BIGINT UNSIGNED NOT NULL,
  position_x  INT NOT NULL DEFAULT 0,
  position_y  INT NOT NULL DEFAULT 0,
  width       INT NOT NULL DEFAULT 6,
  height      INT NOT NULL DEFAULT 4,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_widget_query
    FOREIGN KEY (query_id) REFERENCES app_queries(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Simple widgets based on demo queries
INSERT INTO app_dashboard_widgets (title, query_id, position_x, position_y, width, height)
SELECT 'Total Orders', id, 0, 0, 4, 3
FROM app_queries WHERE name = 'Total Orders (Demo)' LIMIT 1;

INSERT INTO app_dashboard_widgets (title, query_id, position_x, position_y, width, height)
SELECT 'Orders by Status', id, 4, 0, 8, 6
FROM app_queries WHERE name = 'Orders by Status (Demo)' LIMIT 1;

-- -------------------------------------------------------------------
-- 7. Processes (background scripts) and parameters
-- -------------------------------------------------------------------
CREATE TABLE app_processes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description LONGTEXT     NULL,
  script_path VARCHAR(500) NOT NULL,
  role        VARCHAR(255) NOT NULL DEFAULT 'USER',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE app_process_params (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  process_id       BIGINT UNSIGNED NOT NULL,
  name             VARCHAR(100) NOT NULL,
  label            VARCHAR(200) NULL,
  input_type       VARCHAR(20)  NOT NULL DEFAULT 'text',
  default_value    LONGTEXT     NULL,
  dropdown_values  LONGTEXT     NULL,
  sort_order       INT          NOT NULL DEFAULT 0,
  CONSTRAINT fk_process_param_proc
    FOREIGN KEY (process_id) REFERENCES app_processes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Example process (adjust script_path to your environment)
INSERT INTO app_processes (name, description, script_path, role, is_active)
VALUES
  ('Demo Data Export',
   'Example process to export demo data',
   'scripts/data_export_demo.py',
   'ADMIN',
   1);

INSERT INTO app_process_params (process_id, name, label, input_type, default_value, dropdown_values, sort_order)
SELECT id, 'target_dir', 'Target directory', 'text', '/tmp', NULL, 0
FROM app_processes WHERE name = 'Demo Data Export' LIMIT 1;

-- -------------------------------------------------------------------
-- 8. Example demo business table (optional)
-- -------------------------------------------------------------------
-- This is only to make the demo queries above valid; adapt to your real schema.
CREATE TABLE demo_orders (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(100) NOT NULL,
  status        VARCHAR(20)  NOT NULL,
  order_date    DATE         NOT NULL,
  total_amount  DECIMAL(12,2) NOT NULL
) ENGINE=InnoDB;

INSERT INTO demo_orders (customer_name, status, order_date, total_amount) VALUES
  ('Alice', 'OPEN',   CURDATE() - INTERVAL 3 DAY, 120.50),
  ('Bob',   'OPEN',   CURDATE() - INTERVAL 1 DAY,  75.00),
  ('Cara',  'CLOSED', CURDATE() - INTERVAL 7 DAY, 540.00),
  ('Derek', 'OPEN',   CURDATE(),                   33.33),
  ('Eve',   'CLOSED', CURDATE() - INTERVAL 2 DAY, 210.10);

  