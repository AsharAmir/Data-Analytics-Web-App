from roles_utils import get_admin_role, get_default_role
import pandas as pd
import json
import io
import time
from typing import List, Dict, Optional
from datetime import datetime
from database import db_manager
from models import (
    ChartData,
    DashboardWidget,
    FilteredQueryRequest,
    KPI,
    MenuItem,
    Query,
    QueryResult,
    TableData,
    RoleType,
    TableFilter,
    ProcessCreate, 
    Process,
)
import logging
from sql_utils import escape_literal

logger = logging.getLogger(__name__)


class DataService:

    @staticmethod
    def execute_query_for_chart(
        query: str, chart_type: str = None, chart_config: Dict = None, timeout: int = 45
    ) -> QueryResult:
        start_time = time.time()

        try:
            df = db_manager.execute_query_pandas(query, timeout=timeout)

            if df.empty:
                return QueryResult(
                    success=False,
                    error="Query returned no data",
                    execution_time=time.time() - start_time,
                )

            if chart_type == "kpi":
                try:
                    first_val = None
                    if not df.empty:
                        first_row = df.iloc[0]
                        first_val = first_row.iloc[0] if len(first_row) > 0 else None
                    try:
                        num_val = float(first_val)
                    except (TypeError, ValueError):
                        num_val = 0
                    chart_data = ChartData(labels=["KPI"], datasets=[{"data": [num_val]}])
                except Exception:
                    chart_data = ChartData(labels=["KPI"], datasets=[{"data": [0]}])
            else:
                chart_data = DataService._format_chart_data(df, chart_type)

            return QueryResult(
                success=True,
                data=chart_data,
                chart_type=chart_type,
                chart_config=chart_config or {},
                execution_time=time.time() - start_time,
            )

        except TimeoutError as e:
            logger.error(f"Chart query timeout: {e}")
            return QueryResult(
                success=False, 
                error=f"Query timed out after {timeout} seconds. Try reducing data range or complexity.",
                execution_time=time.time() - start_time
            )
        except Exception as e:
            logger.error(f"Query execution error: {e}")
            error_msg = "Query execution failed. Please check your SQL syntax and try again."
            if "ORA-00907" in str(e) or "ORA-00936" in str(e) or "missing right parenthesis" in str(e):
                error_msg = "SQL syntax error: Please check your query syntax."
            elif "ORA-00942" in str(e) or "table or view does not exist" in str(e):
                error_msg = "Table or view not found. Please verify the table name."
            elif "ORA-00904" in str(e) or "invalid identifier" in str(e):
                error_msg = "Column not found. Please verify the column names."
            return QueryResult(
                success=False, error=error_msg, execution_time=time.time() - start_time
            )

    @staticmethod
    def execute_query_for_table(
        query: str, limit: int = 1000, offset: int = 0, timeout: int = 45
    ) -> QueryResult:
        start_time = time.time()

        try:
            # Apply limit and offset for pagination
            paginated_query = f"""
            SELECT * FROM (
                SELECT ROWNUM as rn, sub.* FROM (
                    {query}
                ) sub
                WHERE ROWNUM <= {offset + limit}
            )
            WHERE rn > {offset}
            """

            df = db_manager.execute_query_pandas(paginated_query, timeout=timeout)

            if df.empty:
                logger.info("Query returned no data, attempting to get column structure")
                try:
                    structure_query = f"SELECT * FROM ({query}) WHERE 1=0"
                    structure_df = db_manager.execute_query_pandas(structure_query, timeout=10)
                    if len(structure_df.columns) > 0:
                        df = pd.DataFrame(columns=structure_df.columns)
                        logger.info(f"Got column structure: {list(df.columns)}")
                except Exception as e:
                    logger.warning(f"Could not get column structure for empty result: {e}")

            count_query = f"SELECT COUNT(*) as total_count FROM ({query})"
            try:
                count_result = db_manager.execute_query(count_query, timeout=min(timeout, 30))
                total_count = count_result[0]["TOTAL_COUNT"] if count_result else 0
            except TimeoutError:
                logger.warning("Count query timed out, using current page size as estimate")
                total_count = len(df) + offset

            table_data = TableData(
                columns=df.columns.tolist(),
                data=df.values.tolist(),
                total_count=total_count,
            )

            return QueryResult(
                success=True, data=table_data, execution_time=time.time() - start_time
            )

        except TimeoutError as e:
            logger.error(f"Table query timeout: {e}")
            return QueryResult(
                success=False, 
                error=f"Query timed out after {timeout} seconds. Try reducing data range or adding more specific filters.",
                execution_time=time.time() - start_time
            )
        except Exception as e:
            logger.error(f"Table query execution error: {e}")
            error_msg = "Query execution failed. Please check your SQL syntax and try again."
            if "ORA-00907" in str(e) or "ORA-00936" in str(e) or "missing right parenthesis" in str(e):
                error_msg = "SQL syntax error: Please check your query syntax."
            elif "ORA-00942" in str(e) or "table or view does not exist" in str(e):
                error_msg = "Table or view not found. Please verify the table name."
            elif "ORA-00904" in str(e) or "invalid identifier" in str(e):
                error_msg = "Column not found. Please verify the column names."
            return QueryResult(
                success=False, error=error_msg, execution_time=time.time() - start_time
            )

    @staticmethod
    def execute_filtered_query(request: FilteredQueryRequest) -> QueryResult:
        start_time = time.time()

        try:
            base_query = ""
            if request.query_id:
                query_obj = QueryService.get_query_by_id(request.query_id)
                if not query_obj:
                    raise ValueError("Query not found")
                base_query = query_obj.sql_query.strip().rstrip(";")
                from sql_utils import validate_sql
                validate_sql(base_query)
            elif request.sql_query:
                base_query = request.sql_query.strip().rstrip(";")
                from sql_utils import validate_sql
                validate_sql(base_query)
            else:
                raise ValueError("Either query_id or sql_query must be provided")

            filtered_query = DataService.apply_filters(base_query, request.filters)

            count_query = f"SELECT COUNT(*) as total_count FROM ({filtered_query})"
            count_result = db_manager.execute_query(count_query)
            total_count = count_result[0]["TOTAL_COUNT"] if count_result else 0

            if request.sort_column:
                direction = "DESC" if request.sort_direction and request.sort_direction.upper() == "DESC" else "ASC"
                safe_sort_column = "".join(c for c in request.sort_column if c.isalnum() or c == '_')
                sorted_query = f"{filtered_query} ORDER BY {safe_sort_column} {direction}"
            else:
                sorted_query = filtered_query

            paginated_query = f"""
            SELECT * FROM (
                SELECT ROWNUM as rn, sub.* FROM (
                    {sorted_query}
                ) sub
                WHERE ROWNUM <= {request.offset + request.limit}
            )
            WHERE rn > {request.offset}
            """

            df = db_manager.execute_query_pandas(paginated_query)

            if df.empty:
                logger.info("Filtered query returned no data, attempting to get column structure")
                try:
                    structure_query = f"SELECT * FROM ({filtered_query}) WHERE 1=0"
                    structure_df = db_manager.execute_query_pandas(structure_query, timeout=10)
                    if len(structure_df.columns) > 0:
                        df = pd.DataFrame(columns=structure_df.columns)
                        logger.info(f"Got column structure: {list(df.columns)}")
                except Exception as e:
                    logger.warning(f"Could not get column structure for empty filtered result: {e}")

            table_data = TableData(
                columns=df.columns.tolist(),
                data=df.values.tolist(),
                total_count=total_count,
            )

            return QueryResult(
                success=True, data=table_data, execution_time=time.time() - start_time
            )

        except Exception as e:
            logger.error(f"Filtered query execution error: {e}")
            return QueryResult(
                success=False, error=str(e), execution_time=time.time() - start_time
            )

    @staticmethod
    def _format_chart_data(df: pd.DataFrame, chart_type: str) -> ChartData:

        if chart_type in ["pie", "doughnut"]:
            if len(df.columns) >= 2:
                labels = df.iloc[:, 0].astype(str).tolist()
                values = (
                    pd.to_numeric(df.iloc[:, 1], errors="coerce").fillna(0).tolist()
                )

                datasets = [
                    {
                        "data": values,
                        "backgroundColor": DataService._generate_colors(len(labels)),
                        "borderWidth": 1,
                    }
                ]
            else:
                labels = df.index.astype(str).tolist()
                values = (
                    pd.to_numeric(df.iloc[:, 0], errors="coerce").fillna(0).tolist()
                )
                datasets = [
                    {
                        "data": values,
                        "backgroundColor": DataService._generate_colors(len(labels)),
                        "borderWidth": 1,
                    }
                ]

        elif chart_type in ["bar", "line"]:
            labels = df.iloc[:, 0].astype(str).tolist()
            datasets = []

            colors = DataService._generate_colors(len(df.columns) - 1)

            for i, col in enumerate(df.columns[1:]):
                values = pd.to_numeric(df[col], errors="coerce").fillna(0).tolist()

                safe_label = str(col).strip() or f"Series {i+1}"

                dataset = {
                    "label": safe_label,
                    "data": values,
                    "borderColor": colors[i % len(colors)],
                    "backgroundColor": colors[i % len(colors)]
                    + "80",
                    "borderWidth": 2,
                }

                if chart_type == "line":
                    dataset["fill"] = False

                datasets.append(dataset)

        else:
            labels = df.iloc[:, 0].astype(str).tolist()
            values = (
                pd.to_numeric(df.iloc[:, 1], errors="coerce").fillna(0).tolist()
                if len(df.columns) > 1
                else []
            )

            default_label = (
                str(df.columns[1]).strip() if len(df.columns) > 1 and str(df.columns[1]).strip() else "Value"
            )

            datasets = [
                {
                    "label": default_label,
                    "data": values,
                    "backgroundColor": DataService._generate_colors(1)[0],
                    "borderWidth": 1,
                }
            ]

        return ChartData(labels=labels, datasets=datasets)

    @staticmethod
    def _generate_colors(count: int) -> List[str]:
        base_colors = [
            "#FF6384",
            "#36A2EB",
            "#FFCE56",
            "#4BC0C0",
            "#9966FF",
            "#FF9F40",
            "#FF6384",
            "#C9CBCF",
            "#4BC0C0",
            "#FF6384",
        ]

        colors = []
        for i in range(count):
            colors.append(base_colors[i % len(base_colors)])

        return colors

    @staticmethod
    def apply_filters(base_query: str, filters: TableFilter) -> str:
        if not filters or not filters.conditions:
            return base_query

        where_conditions = []

        for condition in filters.conditions:
            column = condition.column
            operator = condition.operator.lower()
            value = condition.value

            def _as_sql_literal(val):
                return val if isinstance(val, (int, float)) else escape_literal(str(val))

            if operator == "eq":
                where_conditions.append(f"{column} = {_as_sql_literal(value)}")
            elif operator == "ne":
                where_conditions.append(f"{column} != {_as_sql_literal(value)}")
            elif operator == "gt":
                where_conditions.append(f"{column} > {_as_sql_literal(value)}")
            elif operator == "lt":
                where_conditions.append(f"{column} < {_as_sql_literal(value)}")
            elif operator == "gte":
                where_conditions.append(f"{column} >= {_as_sql_literal(value)}")
            elif operator == "lte":
                where_conditions.append(f"{column} <= {_as_sql_literal(value)}")
            elif operator == "like":
                where_conditions.append(f"{column} LIKE '%' || {_as_sql_literal(value)} || '%'")
            elif operator == "in" and isinstance(value, list):
                in_values = ", ".join(_as_sql_literal(v) for v in value)
                where_conditions.append(f"{column} IN ({in_values})")

        if where_conditions:
            logic_operator = f" {filters.logic} "
            where_clause = logic_operator.join(where_conditions)

            if "WHERE" in base_query.upper():
                filtered_query = f"{base_query} AND ({where_clause})"
            else:
                filtered_query = f"{base_query} WHERE {where_clause}"

            return filtered_query

        return base_query


class ExportService:

    @staticmethod
    def export_to_excel(df: pd.DataFrame, filename: str = None) -> bytes:
        if filename is None:
            filename = f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

        logger.info(f"Starting Excel export for {len(df)} rows, {len(df.columns)} columns")
        output = io.BytesIO()

        try:
            if df.empty:
                logger.info("Creating empty Excel file with original headers for empty dataset")
                if len(df.columns) == 0:
                    df = pd.DataFrame(columns=["No Data Available"])
                logger.info(f"Empty Excel will have columns: {list(df.columns)}")
                
            with pd.ExcelWriter(
                output,
                engine="xlsxwriter",
                engine_kwargs={"options": {"remove_timezone": True}},
            ) as writer:
                chunk_size = 50000
                if len(df) > chunk_size:
                    logger.info(f"Large dataset detected, processing in chunks of {chunk_size}")
                    for i in range(0, len(df), chunk_size):
                        chunk = df.iloc[i:i+chunk_size]
                        if i == 0:
                            chunk.to_excel(writer, sheet_name="Data", index=False, startrow=0)
                        else:
                            chunk.to_excel(writer, sheet_name="Data", index=False, startrow=i, header=False)
                        logger.info(f"Processed chunk {i//chunk_size + 1}/{(len(df)//chunk_size) + 1}")
                else:
                    df.to_excel(writer, sheet_name="Data", index=False)

                workbook = writer.book
                worksheet = writer.sheets["Data"]

                header_format = workbook.add_format({
                    "bold": True,
                    "text_wrap": True,
                    "valign": "top",
                    "fg_color": "#D7E4BC",
                    "border": 1,
                })

                for col_num, value in enumerate(df.columns.values):
                    worksheet.write(0, col_num, value, header_format)

                for i, col in enumerate(df.columns):
                    max_length = max(
                        df[col].astype(str).map(len).max() if not df[col].empty else 0,
                        len(str(col))
                    )
                    adjusted_width = min(max_length + 2, 50)
                    worksheet.set_column(i, i, adjusted_width)

            output.seek(0)
            result = output.read()
            logger.info(f"Excel export completed, file size: {len(result)} bytes")
            return result

        except Exception as e:
            logger.error(f"Error during Excel export: {e}")
            try:
                output = io.BytesIO()
                fallback_df = pd.DataFrame({"Error": [f"Export failed: Please try again or contact support"]})
                fallback_df.to_excel(output, index=False, engine='xlsxwriter')
                output.seek(0)
                return output.read()
            except:
                raise e
        finally:
            if 'output' in locals():
                output.close()

    @staticmethod
    def export_to_csv(df: pd.DataFrame, filename: str = None) -> str:
        if filename is None:
            filename = f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

        logger.info(f"Starting CSV export for {len(df)} rows, {len(df.columns)} columns")
        
        try:
            if df.empty:
                logger.info("Creating empty CSV file with original headers for empty dataset")
                if len(df.columns) == 0:
                    df = pd.DataFrame(columns=["No Data Available"])
                logger.info(f"Empty CSV will have columns: {list(df.columns)}")
            
            output = io.StringIO()
            
            df.to_csv(
                output,
                index=False,
                encoding="utf-8",
                lineterminator="\n",
                chunksize=10000,
            )
            
            result = output.getvalue()
            logger.info(f"CSV export completed, size: {len(result)} characters")
            return result
            
        except Exception as e:
            logger.error(f"Error during CSV export: {e}")
            try:
                return "Error\nExport failed: Please try again or contact support\n"
            except:
                raise e
        finally:
            if 'output' in locals():
                output.close()


class MenuService:

    @staticmethod
    def get_menu_structure(user_role: str = None) -> List[MenuItem]:
        try:
            query = """
            SELECT id, name, type, icon, parent_id, sort_order, is_active, role
            FROM app_menu_items
            WHERE is_active = 1
            ORDER BY sort_order, name
            """

            result = db_manager.execute_query(query)

            all_items = []
            for row in result:
                menu_roles = row.get("ROLE")
                if menu_roles:
                    menu_roles = [r.strip().upper() for r in menu_roles.split(",") if r.strip()]
                
                if user_role and menu_roles and str(user_role).strip().upper() not in menu_roles:
                    continue
                
                item = MenuItem(
                    id=row["ID"],
                    name=row["NAME"],
                    type=row["TYPE"],
                    icon=row["ICON"],
                    parent_id=row["PARENT_ID"],
                    sort_order=row["SORT_ORDER"],
                    is_active=bool(row["IS_ACTIVE"]),
                    role=menu_roles,
                    children=[],
                )
                all_items.append(item)

            menu_dict = {item.id: item for item in all_items}
            root_items = []

            for item in all_items:
                if item.parent_id and item.parent_id in menu_dict:
                    menu_dict[item.parent_id].children.append(item)
                else:
                    root_items.append(item)

            return root_items

        except Exception as e:
            logger.error(f"Error getting menu structure: {e}")
            return []


class QueryService:

    @staticmethod
    def get_queries_by_menu_item(menu_item_id: int) -> List[Query]:
        try:
            base_sql = """
            SELECT id, name, description, sql_query, chart_type, chart_config,
                   menu_item_id, role, is_active, created_at
            FROM app_queries
            WHERE is_active = 1 AND (menu_item_id = :menu_id)
            """

            junction_sql = """
            SELECT q.id, q.name, q.description, q.sql_query, q.chart_type,
                   q.chart_config, q.menu_item_id, q.role, q.is_active, q.created_at
            FROM app_queries q
            JOIN app_query_menu_items j ON j.query_id = q.id
            WHERE q.is_active = 1 AND j.menu_item_id = :menu_id
            """

            combined_sql = f"{base_sql}\nUNION ALL\n{junction_sql}\nORDER BY name"

            result = db_manager.execute_query(combined_sql, {"menu_id": menu_item_id})

            queries = []
            for row in result:
                chart_config = {}
                if row["CHART_CONFIG"]:
                    try:
                        chart_config = json.loads(row["CHART_CONFIG"])
                    except:
                        chart_config = {}

                query_obj = Query(
                    id=row["ID"],
                    name=row["NAME"],
                    description=row["DESCRIPTION"],
                    sql_query=row["SQL_QUERY"],
                    chart_type=row["CHART_TYPE"],
                    chart_config=chart_config,
                    menu_item_id=row["MENU_ITEM_ID"],
                    role=row["ROLE"],
                    is_active=bool(row["IS_ACTIVE"]),
                    created_at=row["CREATED_AT"],
                )
                queries.append(query_obj)

            return queries

        except Exception as e:
            logger.error(f"Error getting queries by menu item: {e}")
            return []

    @staticmethod
    def get_query_by_id(query_id: int) -> Optional[Query]:
        try:
            query = """
            SELECT id, name, description, sql_query, chart_type, chart_config, 
                   menu_item_id, role, is_active, created_at
            FROM app_queries
            WHERE id = :1 AND is_active = 1
            """

            result = db_manager.execute_query(query, (query_id,))

            if result:
                row = result[0]
                chart_config = {}
                if row["CHART_CONFIG"]:
                    try:
                        chart_config = json.loads(row["CHART_CONFIG"])
                    except:
                        chart_config = {}

                return Query(
                    id=row["ID"],
                    name=row["NAME"],
                    description=row["DESCRIPTION"],
                    sql_query=row["SQL_QUERY"],
                    chart_type=row["CHART_TYPE"],
                    chart_config=chart_config,
                    menu_item_id=row["MENU_ITEM_ID"],
                    role=row["ROLE"],
                    is_active=bool(row["IS_ACTIVE"]),
                    created_at=row["CREATED_AT"],
                )

            return None

        except Exception as e:
            logger.error(f"Error getting query by ID: {e}")
            return None

    @staticmethod
    def get_queries_by_menu(menu_item_id: int) -> List[Query]:
        return QueryService.get_queries_by_menu_item(menu_item_id)


class DashboardService:

    @staticmethod
    def get_dashboard_layout(menu_id: int = None) -> List[DashboardWidget]:
        try:
            if menu_id:
                query = """
                SELECT DISTINCT w.id, w.title, w.query_id, w.position_x, w.position_y, 
                       w.width, w.height, w.is_active,
                       q.name as query_name, q.chart_type, q.menu_item_id
                FROM app_dashboard_widgets w
                JOIN app_queries q ON w.query_id = q.id
                LEFT JOIN app_query_menu_items qmi ON q.id = qmi.query_id
                WHERE w.is_active = 1 AND q.is_active = 1 
                AND (q.menu_item_id = :1 OR qmi.menu_item_id = :1)
                ORDER BY w.position_y, w.position_x
                """
                result = db_manager.execute_query(query, (menu_id, menu_id))
            else:
                query = """
                SELECT DISTINCT w.id, w.title, w.query_id, w.position_x, w.position_y,
                       w.width, w.height, w.is_active,
                       q.name as query_name, q.chart_type, q.menu_item_id
                FROM app_dashboard_widgets w
                JOIN app_queries q ON w.query_id = q.id
                WHERE w.is_active = 1 AND q.is_active = 1 
                AND COALESCE(q.is_default_dashboard, 0) = 1
                ORDER BY w.position_y, w.position_x
                """
                result = db_manager.execute_query(query)

            widgets = []
            for row in result:
                query_obj = Query(
                    id=row["QUERY_ID"],
                    name=row["QUERY_NAME"],
                    description="",
                    sql_query="",
                    chart_type=row["CHART_TYPE"] or "bar",
                    chart_config={},
                    menu_item_id=row.get("MENU_ITEM_ID"),
                    is_active=True,
                    created_at=datetime.now(),
                )

                widget = DashboardWidget(
                    id=row["ID"],
                    title=row["TITLE"],
                    query_id=row["QUERY_ID"],
                    position_x=row["POSITION_X"],
                    position_y=row["POSITION_Y"],
                    width=row["WIDTH"],
                    height=row["HEIGHT"],
                    is_active=bool(row["IS_ACTIVE"]),
                    query=query_obj,
                )
                widgets.append(widget)

            return widgets

        except Exception as e:
            logger.error(f"Error getting dashboard layout: {e}")
            return []


class KPIService:
    """Service class for managing KPI operations with professional practices"""
    
    # Constants for better maintainability
    class KPIQueries:
        """SQL queries for KPI operations"""
        
        BY_MENU = """
        SELECT id, name, sql_query, role 
        FROM app_queries 
        WHERE is_active = :is_active AND is_kpi = :is_kpi AND menu_item_id = :menu_id
        ORDER BY created_at DESC
        """
        
        DEFAULT_DASHBOARD = """
        SELECT id, name, sql_query, role 
        FROM app_queries 
        WHERE is_active = :is_active AND is_kpi = :is_kpi AND COALESCE(is_default_dashboard, 0) = :is_default_dashboard
        ORDER BY created_at DESC
        """


    @staticmethod
    def _parse_user_roles(role_string: str) -> List[str]:
        """Parse comma-separated role string into list of roles"""
        if not role_string:
            return []
        return [role.strip() for role in str(role_string).split(",") if role.strip()]

    @staticmethod
    def _is_user_authorized(user_role: RoleType, allowed_roles: List[str]) -> bool:
        """Check if user is authorized to access KPI based on roles"""
        if not allowed_roles:
            return True  # No role restriction
        return user_role in allowed_roles

    @staticmethod
    def _execute_kpi_query(sql_query: str, kpi_id: int) -> float:
        """Safely execute KPI SQL query and return numeric value"""
        try:
            # Sanitize SQL query
            sanitized_sql = sql_query.rstrip().rstrip(";")
            
            # Execute query
            value_rows = db_manager.execute_query(sanitized_sql)
            
            if not value_rows:
                logger.warning(f"KPI query (id={kpi_id}) returned no results")
                return 0.0
            
            # Get first value from first row
            first_row = value_rows[0]
            first_value = next(iter(first_row.values()))
            
            # Convert to numeric
            try:
                return float(first_value) if first_value is not None else 0.0
            except (TypeError, ValueError) as e:
                logger.warning(f"KPI query (id={kpi_id}) returned non-numeric value: {first_value}, error: {e}")
                return 0.0
                
        except Exception as exc:
            logger.error(f"KPI query (id={kpi_id}) execution error: {exc}")
            return 0.0

    @staticmethod
    def get_kpis(user_role: RoleType, menu_id: Optional[int] = None) -> List[KPI]:
        """
        Get KPIs for a user, filtered by menu or default dashboard
        
        Args:
            user_role: The role of the requesting user
            menu_id: Optional menu ID to filter KPIs by specific menu, None for default dashboard
            
        Returns:
            List of KPI objects accessible to the user
        """
        try:  
            # Choose query and parameters based on menu_id
            if menu_id is not None:
                query = KPIService.KPIQueries.BY_MENU
                params = {
                    "is_active": 1,
                    "is_kpi": 1,
                    "menu_id": menu_id
                }
                logger.debug(f"Fetching KPIs for menu_id: {menu_id}")
            else:
                query = KPIService.KPIQueries.DEFAULT_DASHBOARD
                params = {
                    "is_active": 1,
                    "is_kpi": 1,
                    "is_default_dashboard": 1
                }
                logger.debug("Fetching KPIs for default dashboard")
            
            # Execute query to get KPI definitions
            rows = db_manager.execute_query(query, params)
            logger.info(f"Found {len(rows)} KPI definitions")
            
            kpis: List[KPI] = []
            
            for row in rows:
                # Parse allowed roles
                allowed_roles = KPIService._parse_user_roles(row.get("ROLE"))
                
                # Check authorization
                if not KPIService._is_user_authorized(user_role, allowed_roles):
                    logger.debug(f"User role '{user_role}' not authorized for KPI '{row['NAME']}'")
                    continue
                
                # Execute KPI query to get value
                kpi_value = KPIService._execute_kpi_query(row["SQL_QUERY"], row["ID"])
                
                # Create KPI object
                kpi = KPI(
                    id=row["ID"],
                    label=row["NAME"],
                    value=kpi_value,
                )
                kpis.append(kpi)
                
                logger.debug(f"Added KPI: {kpi.label} = {kpi.value}")
            
            logger.info(f"Returning {len(kpis)} authorized KPIs for user role '{user_role}'")
            return kpis
            
        except Exception as exc:
            logger.error(f"Error getting KPIs for user role '{user_role}', menu_id={menu_id}: {exc}")
            return []


class ProcessService:

    @staticmethod
    def _serialize_roles(role_field: RoleType | List[RoleType] | None) -> str:
        from roles_utils import serialize_roles
        return serialize_roles(role_field) or get_default_role()

    @staticmethod
    def create_process(request: "ProcessCreate") -> int:

        insert_sql = (
            "INSERT INTO app_processes (name, description, script_path, role) "
            "VALUES (:1, :2, :3, :4)"
        )

        from models import ProcessCreate, ProcessParameter

        db_manager.execute_non_query(
            insert_sql,
            (
                request.name,
                request.description,
                request.script_path,
                ProcessService._serialize_roles(request.role),
            ),
        )

        res = db_manager.execute_query(
            "SELECT id FROM app_processes WHERE name = :1 ORDER BY created_at DESC",
            (request.name,),
        )
        if not res:
            raise ValueError("Failed to obtain ID for newly created process")
        proc_id = res[0]["ID"]

        if request.parameters:
            param_sql = (
                "INSERT INTO app_process_params (process_id, name, label, input_type, "
                "default_value, dropdown_values, sort_order) VALUES (:1, :2, :3, :4, :5, :6, :7)"
            )
            for idx, p in enumerate(request.parameters):
                db_manager.execute_non_query(
                    param_sql,
                    (
                        proc_id,
                        p.name,
                        p.label,
                        p.input_type,
                        p.default_value,
                        ",".join(p.dropdown_values) if p.dropdown_values else None,
                        idx,
                    ),
                )

        return proc_id

    @staticmethod
    def get_process(proc_id: int) -> Optional["Process"]:
        from models import Process, ProcessParameter, ParameterInputType

        proc_sql = """
            SELECT id, name, description, script_path, role, is_active, created_at
            FROM app_processes
            WHERE id = :1
        """

        proc_rows = db_manager.execute_query(proc_sql, (proc_id,))
        if not proc_rows:
            return None

        proc_row = proc_rows[0]

        param_sql = """
            SELECT name, label, input_type, default_value, dropdown_values
            FROM app_process_params
            WHERE process_id = :1
            ORDER BY sort_order
        """

        param_rows = db_manager.execute_query(param_sql, (proc_id,))

        params: list[ProcessParameter] = []
        for pr in param_rows:
            params.append(
                ProcessParameter(
                    name=pr["NAME"],
                    label=pr["LABEL"],
                    input_type=ParameterInputType(pr["INPUT_TYPE"]),
                    default_value=pr["DEFAULT_VALUE"],
                    dropdown_values=pr["DROPDOWN_VALUES"].split(",") if pr.get("DROPDOWN_VALUES") else None,
                )
            )

        return Process(
            id=proc_row["ID"],
            name=proc_row["NAME"],
            description=proc_row["DESCRIPTION"],
            script_path=proc_row["SCRIPT_PATH"],
            parameters=params,
            is_active=bool(proc_row["IS_ACTIVE"]),
            role=proc_row.get("ROLE"),
            created_at=proc_row["CREATED_AT"],
        )

    @staticmethod
    def list_processes(user_role: str = None) -> list["Process"]:
        from models import Process, ProcessParameter

        sql = "SELECT id, name, description, script_path, role, is_active, created_at FROM app_processes WHERE is_active = 1 ORDER BY name"
        rows = db_manager.execute_query(sql)

        processes: list[Process] = []
        for row in rows:
            roles = row.get("ROLE")
            
            if str(user_role).strip().lower() != get_admin_role():
                if not roles or roles.strip() == "":
                    continue
                if str(user_role).strip().upper() not in {r.strip().upper() for r in roles.split(",")}:
                    continue

            processes.append(
                Process(
                    id=row["ID"],
                    name=row["NAME"],
                    description=row["DESCRIPTION"],
                    script_path=row["SCRIPT_PATH"],
                    parameters=None,
                    is_active=bool(row["IS_ACTIVE"]),
                    role=roles,
                    created_at=row["CREATED_AT"],
                )
            )

        return processes

    @staticmethod
    def update_process(proc_id: int, request: "ProcessCreate") -> None:
        update_sql = (
            "UPDATE app_processes SET name = :1, description = :2, script_path = :3, "
            "role = :4 WHERE id = :5"
        )
        db_manager.execute_non_query(
            update_sql,
            (
                request.name,
                request.description,
                request.script_path,
                ProcessService._serialize_roles(request.role),
                proc_id,
            ),
        )

        db_manager.execute_non_query("DELETE FROM app_process_params WHERE process_id = :1", (proc_id,))
        if request.parameters:
            param_sql = (
                "INSERT INTO app_process_params (process_id, name, label, input_type, "
                "default_value, dropdown_values, sort_order) VALUES (:1, :2, :3, :4, :5, :6, :7)"
            )
            for idx, p in enumerate(request.parameters):
                db_manager.execute_non_query(
                    param_sql,
                    (
                        proc_id,
                        p.name,
                        p.label,
                        p.input_type,
                        p.default_value,
                        ",".join(p.dropdown_values) if p.dropdown_values else None,
                        idx,
                    ),
                )

    @staticmethod
    def delete_process(proc_id: int) -> None:
        db_manager.execute_non_query("DELETE FROM app_processes WHERE id = :1", (proc_id,))

    @staticmethod
    def run_process(proc_id: int, args: dict[str, str], timeout: int = 600) -> str:

        import shlex
        import subprocess
        import os
        import sys

        proc = ProcessService.get_process(proc_id)
        if not proc:
            raise ValueError("Process not found")

        script_path = proc.script_path
        
        if not os.path.isabs(script_path):
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            script_path = os.path.join(backend_dir, script_path)
            
        if not os.path.isfile(script_path):
            raise RuntimeError(f"Script not found: {script_path}")

        cmd = [sys.executable, script_path]
        for k, v in args.items():
            cmd.append(f"--{k}={shlex.quote(str(v))}")

        try:
            completed = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=True,
            )
            return completed.stdout
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"Process exited with code {exc.returncode}: {exc.stderr}")
        except subprocess.TimeoutExpired:
            raise RuntimeError("Process execution timed out")
