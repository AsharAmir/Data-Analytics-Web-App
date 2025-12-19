## Overview

This document describes the **new features** and **bug fixes** implemented on top of the original Data Analytics Platform, with a focus on:

- How an **admin** can configure the system from the UI.
- How an **end user** experiences the changes on the frontend.
- What **database / SQL changes** were made so that DBAs can validate the schema.

---

## 1. Previously Reported Issues – What Was Fixed

### 1.1 Role‑based visibility of dashboards / queries / processes

**Problem:** Items assigned to roles like CEO/Admin were still visible to normal users.

**Fix (backend logic):**
- Menus (`/api/menu`), dashboard widgets (`/api/dashboard`), queries, KPIs, and processes now consistently check the user’s role against the **comma‑separated role list** stored in the database.
- For non‑admin users, only items whose `role` list includes their role are returned.
- Admins (`role = ADMIN`) continue to see everything.

**How to use (admin):**
1. Go to **Admin → Users** and ensure each user has the correct `Role` (Admin, CEO, Finance User, etc.).
2. In **Admin → Queries / Menus / Processes / KPIs**, use the **Role** fields to specify which roles can see each item.
3. Log in as a normal `USER` and confirm CEO/Admin‑only items are hidden.

---

### 1.2 Default Dashboard queries not appearing

**Problem:** Queries assigned to “Default Dashboard” were not showing on the main dashboard.

**Fix:**
- When a query is created or edited in **Admin → Queries**, selecting **“Default Dashboard”** now:
  - Sets `is_default_dashboard = 1` on the query.
  - Stores `menu_item_id = NULL` (DB‑level convention).
- The dashboard and KPI services use `is_default_dashboard = 1` to load widgets/metrics for the default view.

**How to use (admin):**
1. In **Admin → Queries**, edit or create a query.
2. In the **Basic Info / Assignment** section:
   - Check **“Default Dashboard”** if it should appear on the main dashboard.
3. Add widgets in **Admin → Dashboard Widgets** that point to that query.
4. When users open `/dashboard` without selecting a specific menu, these widgets will be visible.

---

### 1.3 Processes still failing with generic error 500

**Problem:** Running processes sometimes returned “Request failed with status code 500” without useful detail.

**Fix:**
- The process runner now:
  - Validates that the configured `script_path` exists on disk.
  - Logs clear errors (script not found, exit code, stderr, timeout).
  - Returns human‑readable messages such as:
    - “Configured script not found on server: …”
    - “Process failed with exit code X: …”
    - “Process execution timed out after N seconds”.

**How to use (admin):**
1. In **Admin → Processes**:
   - Ensure each process `Script` path points to a valid `.py` file under `backend/scripts/` (or an absolute path).
2. If a process fails:
   - Check the toast / dialog message for the reason.
   - Open `backend/logs/app.log` and look for the most recent “External process …” entries for detailed context.

---

### 1.4 Log files per day vs. size‑based rotation

**Problem:** A new `app.log.YYYY-MM-DD` file was being created each day.

**Fix:**
- Logging is now handled by a **RotatingFileHandler** that:
  - Writes to `logs/app.log`.
  - Rotates by **file size** (5 MB), keeping 1 backup file (`app.log.1`).
  - Does **not** create date‑suffixed log files.

**What to do (ops/DBA):**
1. Old date‑suffixed files can be archived or deleted manually.
2. After restart, confirm that new logs are written only to `logs/app.log` and `logs/app.log.1`.

---

## 2. New Feature: Per‑User Feature Visibility (Hide Left‑Nav Items)

### 2.1 What this does

For each user, an admin can **hide or show** the following left‑sidebar items:

- Dashboard
- Data Explorer
- Excel Compare
- Processes

Hidden items simply **do not appear** for that user, even if their role would normally allow access.

### 2.2 How the admin configures it

1. Log in as **Admin**.
2. Go to **Admin → Users**.
3. Click **Edit** on the desired user.
4. In the **User Form**:
   - Open the **Permissions** tab.
   - Under **Feature Visibility**, you will see switches for:
     - Dashboard
     - Data Explorer
     - Excel Compare
     - Processes
   - Turn a switch **ON** to hide that feature from the user.
   - Turn it **OFF** to show it.
5. Click **Save / Update User**.

### 2.3 What the user sees

- After saving, the user must **log out and log in** again (or reload the app).
- The hidden items will be **removed** from the left navigation, while everything else remains unchanged.

### 2.4 Database changes

- Table `APP_USERS`:
  - Added column:

    ```sql
    ALTER TABLE app_users ADD (hidden_features VARCHAR2(255));
    ```

  - This stores a comma‑separated list of feature codes (e.g. `dashboard,data_explorer`).

---

## 3. New Feature: Form‑Based Reports

### 3.1 What this does

A **form‑based report** is a report where:

- The admin defines a **custom HTML form** layout (inputs, labels, sections).
- When an authorized user opens the report:
  - They see the **form instead of just a table/chart**.
  - Submitting the form (or changing filters) runs the underlying query with **safe filters** and shows the results in a table.

### 3.2 How the admin creates a form‑based report

1. Log in as **Admin**.
2. Go to **Admin → Queries**.
3. Click **Create Query** (or edit an existing one).
4. In the **Basic Info** tab:
   - Enter **Name**, **Description**, and **SQL Query** (must be a `SELECT`).
5. **Enable “Form‑based report”:**
   - Check the **“Form-based report”** checkbox.
   - (Optional) Set `Chart Type` to `table` – form reports generally start with a table view.
6. Open the **“Form Layout”** tab:
   - Paste or design an HTML form using standard `<form>`, `<input>`, `<select>`, etc.
   - For each field you want to act as a filter, add attributes:
     - `data-column="COLUMN_NAME"` – the DB column to filter.
     - `data-operator="eq|ne|gt|lt|gte|lte|like|in"` – comparison operator.
   - Example:

     ```html
     <form>
       <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
         <div>
           <label>Date from</label>
           <input
             type="date"
             name="date_from"
             data-column="TXN_DATE"
             data-operator="gte"
           />
         </div>
         <div>
           <label>Date to</label>
           <input
             type="date"
             name="date_to"
             data-column="TXN_DATE"
             data-operator="lte"
           />
         </div>
         <div>
           <label>Customer</label>
           <input
             type="text"
             name="customer"
             data-column="CUSTOMER_NAME"
             data-operator="like"
           />
         </div>
       </div>
       <button type="submit">Run report</button>
     </form>
     ```

7. In the **Permissions** / **Access** tab:
   - Assign the roles that are allowed to view this report (e.g. `CEO`, `FINANCE_USER`).
8. Save the query and attach it to a **menu** as usual (via Menu / Queries configuration).

### 3.3 How the user runs a form‑based report (frontend flow)

1. Navigate to **Reports** from the sidebar.
2. Choose the appropriate **report category** and click the desired report (which may open in a new tab `/report/{id}`).
3. If it is configured as **form‑based**:
   - The first section of the report detail page displays the **custom form** defined by the admin.
   - The user fills in the fields (dates, dropdowns, text inputs, etc.).
   - On **Submit**, the app:
     - Reads all inputs with `data-column` / `data-operator`.
     - Builds filter conditions safely.
     - Calls the backend filtered query endpoint.
   - The **results table** appears below the form.
   - The user can then **export** the results (Excel/CSV) just like a normal report.

### 3.4 Database changes

- Table `APP_QUERIES`:

  ```sql
  ALTER TABLE app_queries ADD (is_form_report   NUMBER(1) DEFAULT 0);
  ALTER TABLE app_queries ADD (form_template    CLOB);
  ```

---

## 4. New Feature: Interactive Dashboards (Template‑Driven)

### 4.1 Concept

An **Interactive Dashboard** is a special type of **dashboard menu** where:

- The admin designs a **full HTML layout** (grid, cards, charts placeholders, filters).
- Elements in the layout are bound to **saved queries** via `data-*` attributes.
- When a user interacts with filters (dropdowns, date pickers, etc.), all relevant charts/tables **update dynamically**.

This allows designing any “free‑form” dashboard without hard‑coding layout in React.

### 4.2 How the admin creates an interactive dashboard

1. Log in as **Admin**.
2. Go to **Admin → Menus**.
3. Click **Add Menu** (top‑level item):
   - **Type:** `Dashboard`.
   - **Parent:** leave empty (top‑level).
   - Set **Name**, **Icon**, and **Sort Order** as desired.
4. Under **Interactive Dashboard**:
   - Enable the **“Interactive dashboard”** checkbox.
5. In **Interactive Layout Template (HTML)**:
   - Paste an HTML layout that:
     - Contains **containers** for widgets using `data-query-id`:

       ```html
       <div
         class="h-64"
         data-query-id="101"
         data-widget-type="chart"
         data-chart-type="bar"
       ></div>

       <div
         class="mt-4"
         data-query-id="102"
         data-widget-type="table"
       ></div>
       ```

     - Contains **interactive filters** like:

       ```html
       <label>Status</label>
       <select
         data-filter
         data-query-id="101"
         data-column="STATUS"
         data-operator="eq"
       >
         <option value="">All</option>
         <option value="OPEN">Open</option>
         <option value="CLOSED">Closed</option>
       </select>
       ```

     - Optionally wraps filters in `<form>` tags; submitting the form will also refresh data.
6. Save the menu.
7. Ensure there are corresponding **queries** (in **Admin → Queries**) with IDs matching the `data-query-id` values used in the template.

### 4.3 How the user works with an interactive dashboard (frontend flow)

1. The user logs in and sees the new **dashboard menu** in the sidebar.
2. Clicking the menu opens `/interactive-dashboard?menu={menu_id}`.
3. The page:
   - Loads the menu tree and finds the selected menu item.
   - Renders the admin’s **HTML template**.
   - Scans the layout for:
     - All widgets (`[data-query-id]`) to know which queries to execute.
     - All filters (`[data-filter][data-query-id][data-column]`) to know how filters map to queries.
4. When:
   - A filter input with `data-filter` changes, or
   - The user submits a `<form>` in the layout,
   the frontend:
   - Collects all filter values per query (column/operator/value).
   - Calls the backend filtered query endpoint for each query ID.
   - Stores the results in memory, ready for charts/tables.
5. Charts / tables:
   - The current version wires up data fetching and leaves layout rendering flexible.
   - Containers with `data-query-id` hold the place where charts/tables can be injected; the underlying query results are fetched and can be visualized as `Chart.js` charts or data tables based on `data-widget-type` and `data-chart-type`.

### 4.4 Database changes

- Table `APP_MENU_ITEMS`:

  ```sql
  ALTER TABLE app_menu_items ADD (is_interactive_dashboard NUMBER(1) DEFAULT 0);
  ALTER TABLE app_menu_items ADD (interactive_template     CLOB);
  ```

---

## 5. SQL Summary (for DBAs)

The following columns are new or may have been added automatically by `init_database()`:

- `APP_USERS`
  - `HIDDEN_FEATURES VARCHAR2(255)`
- `APP_QUERIES`
  - `IS_KPI NUMBER(1) DEFAULT 0` (existing feature, kept)
  - `IS_DEFAULT_DASHBOARD NUMBER(1) DEFAULT 0` (existing, used for default dashboard)
  - `IS_FORM_REPORT NUMBER(1) DEFAULT 0`
  - `FORM_TEMPLATE CLOB`
- `APP_MENU_ITEMS`
  - `ROLE VARCHAR2(255)` (for role‑based menus)
  - `IS_INTERACTIVE_DASHBOARD NUMBER(1) DEFAULT 0`
  - `INTERACTIVE_TEMPLATE CLOB`
- `APP_PROCESSES`
  - `ROLE VARCHAR2(255)` (for role‑based processes; existing but clarified)

If the environment is initialized through `backend/database.py:init_database()`, these columns are **created/checked automatically**. A DBA can still verify by querying `USER_TAB_COLUMNS` for each table.

---

## 6. Frontend Entry Points (Where to Click)

- **Admin Panel:** `/admin`
  - **Users tab:** per‑user feature visibility + roles.
  - **Queries tab:** standard and form‑based reports.
  - **Menus tab:** standard dashboards/reports and interactive dashboards.
  - **Processes tab:** background scripts.
  - **Stats/KPIs tab:** KPI queries.
- **Reports:** `/reports` → click a report → `/report/{id}`
  - Form‑based reports show an input form then results table.
- **Interactive Dashboards:** `/interactive-dashboard?menu={menu_id}`
  - Reached by clicking a dashboard menu item configured as interactive.

With these building blocks, the client can:

- Control **who sees which left‑nav features**.
- Build **rich form‑based reports** that guide user input.
- Design **fully interactive dashboards** using HTML templates bound to stored queries and filters. 


