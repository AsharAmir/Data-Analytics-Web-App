import pandas as pd
import json
import io
import time
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils.dataframe import dataframe_to_rows
import xlsxwriter
from database import db_manager
from models import (
    QueryResult,
    ChartData,
    TableData,
    FilterCondition,
    TableFilter,
    Query,
    MenuItem,
    DashboardWidget,
)
import logging
from sql_utils import escape_literal

logger = logging.getLogger(__name__)


class DataService:
    """Service for data processing and chart generation"""

    @staticmethod
    def execute_query_for_chart(
        query: str, chart_type: str = None, chart_config: Dict = None
    ) -> QueryResult:
        """Execute query and format data for charts"""
        start_time = time.time()

        try:
            # Execute query
            df = db_manager.execute_query_pandas(query)

            if df.empty:
                return QueryResult(
                    success=False,
                    error="Query returned no data",
                    execution_time=time.time() - start_time,
                )

            # Format data based on chart type
            chart_data = DataService._format_chart_data(df, chart_type)

            return QueryResult(
                success=True,
                data=chart_data,
                chart_type=chart_type,
                chart_config=chart_config or {},
                execution_time=time.time() - start_time,
            )

        except Exception as e:
            logger.error(f"Query execution error: {e}")
            return QueryResult(
                success=False, error=str(e), execution_time=time.time() - start_time
            )

    @staticmethod
    def execute_query_for_table(
        query: str, limit: int = 1000, offset: int = 0
    ) -> QueryResult:
        """Execute query and format data for tables"""
        start_time = time.time()

        try:
            # Add pagination to query
            paginated_query = f"""
            SELECT * FROM (
                SELECT ROWNUM as rn, sub.* FROM (
                    {query}
                ) sub
                WHERE ROWNUM <= {offset + limit}
            )
            WHERE rn > {offset}
            """

            # Execute query
            df = db_manager.execute_query_pandas(paginated_query)

            # Get total count (without pagination)
            count_query = f"SELECT COUNT(*) as total_count FROM ({query})"
            count_result = db_manager.execute_query(count_query)
            total_count = count_result[0]["TOTAL_COUNT"] if count_result else 0

            # Format data for table
            table_data = TableData(
                columns=df.columns.tolist(),
                data=df.values.tolist(),
                total_count=total_count,
            )

            return QueryResult(
                success=True, data=table_data, execution_time=time.time() - start_time
            )

        except Exception as e:
            logger.error(f"Table query execution error: {e}")
            return QueryResult(
                success=False, error=str(e), execution_time=time.time() - start_time
            )

    @staticmethod
    def execute_filtered_query(request: "FilteredQueryRequest") -> QueryResult:
        """Execute a filtered, sorted, and paginated query"""
        start_time = time.time()

        try:
            # 1. Get base query
            base_query = ""
            if request.query_id:
                query_obj = QueryService.get_query_by_id(request.query_id)
                if not query_obj:
                    raise ValueError("Query not found")
                base_query = query_obj.sql_query
            elif request.sql_query:
                base_query = request.sql_query
            else:
                raise ValueError("Either query_id or sql_query must be provided")

            # 2. Apply filters
            filtered_query = DataService.apply_filters(base_query, request.filters)

            # 3. Get total count
            count_query = f"SELECT COUNT(*) as total_count FROM ({filtered_query})"
            count_result = db_manager.execute_query(count_query)
            total_count = count_result[0]["TOTAL_COUNT"] if count_result else 0

            # 4. Apply sorting
            if request.sort_column:
                direction = "DESC" if request.sort_direction and request.sort_direction.upper() == "DESC" else "ASC"
                # Basic protection against injection by ensuring column is alphanumeric with underscores
                safe_sort_column = "".join(c for c in request.sort_column if c.isalnum() or c == '_')
                sorted_query = f"{filtered_query} ORDER BY {safe_sort_column} {direction}"
            else:
                sorted_query = filtered_query

            # 5. Apply pagination
            paginated_query = f"""
            SELECT * FROM (
                SELECT ROWNUM as rn, sub.* FROM (
                    {sorted_query}
                ) sub
                WHERE ROWNUM <= {request.offset + request.limit}
            )
            WHERE rn > {request.offset}
            """

            # 6. Execute query
            df = db_manager.execute_query_pandas(paginated_query)

            # 7. Format data for table
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
        """Format DataFrame for different chart types"""

        if chart_type in ["pie", "doughnut"]:
            # For pie charts, use first column as labels, second as values
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
            # For bar/line charts, first column as labels, other columns as datasets
            labels = df.iloc[:, 0].astype(str).tolist()
            datasets = []

            colors = DataService._generate_colors(len(df.columns) - 1)

            for i, col in enumerate(df.columns[1:]):
                values = pd.to_numeric(df[col], errors="coerce").fillna(0).tolist()

                dataset = {
                    "label": col,
                    "data": values,
                    "borderColor": colors[i % len(colors)],
                    "backgroundColor": colors[i % len(colors)]
                    + "80",  # Add transparency
                    "borderWidth": 2,
                }

                if chart_type == "line":
                    dataset["fill"] = False

                datasets.append(dataset)

        else:
            # Default format
            labels = df.iloc[:, 0].astype(str).tolist()
            values = (
                pd.to_numeric(df.iloc[:, 1], errors="coerce").fillna(0).tolist()
                if len(df.columns) > 1
                else []
            )

            datasets = [
                {
                    "label": df.columns[1] if len(df.columns) > 1 else "Value",
                    "data": values,
                    "backgroundColor": DataService._generate_colors(1)[0],
                    "borderWidth": 1,
                }
            ]

        return ChartData(labels=labels, datasets=datasets)

    @staticmethod
    def _generate_colors(count: int) -> List[str]:
        """Generate color palette for charts"""
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
        """Apply filters to a base query"""
        if not filters or not filters.conditions:
            return base_query

        where_conditions = []

        for condition in filters.conditions:
            column = condition.column
            operator = condition.operator.lower()
            value = condition.value

            # All literals are escaped via ``escape_literal`` which doubles single
            # quotes thus making it safe for direct interpolation. Numeric values
            # are passed through as-is.

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
                # LIKE needs wildcards around the escaped literal
                where_conditions.append(f"{column} LIKE '%' || {_as_sql_literal(value)} || '%'")
            elif operator == "in" and isinstance(value, list):
                in_values = ", ".join(_as_sql_literal(v) for v in value)
                where_conditions.append(f"{column} IN ({in_values})")

        if where_conditions:
            logic_operator = f" {filters.logic} "
            where_clause = logic_operator.join(where_conditions)

            # Check if query already has WHERE clause
            if "WHERE" in base_query.upper():
                filtered_query = f"{base_query} AND ({where_clause})"
            else:
                filtered_query = f"{base_query} WHERE {where_clause}"

            return filtered_query

        return base_query


class ExportService:
    """Service for exporting data to various formats"""

    @staticmethod
    def export_to_excel(df: pd.DataFrame, filename: str = None) -> bytes:
        """Export DataFrame to Excel bytes"""
        if filename is None:
            filename = f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

        output = io.BytesIO()

        with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
            df.to_excel(writer, sheet_name="Data", index=False)

            # Get workbook and worksheet objects
            workbook = writer.book
            worksheet = writer.sheets["Data"]

            # Add formatting
            header_format = workbook.add_format(
                {
                    "bold": True,
                    "text_wrap": True,
                    "valign": "top",
                    "fg_color": "#D7E4BC",
                    "border": 1,
                }
            )

            # Write headers with formatting
            for col_num, value in enumerate(df.columns.values):
                worksheet.write(0, col_num, value, header_format)

            # Auto-adjust column width
            for i, col in enumerate(df.columns):
                max_length = max(df[col].astype(str).map(len).max(), len(str(col))) + 2
                worksheet.set_column(i, i, min(max_length, 50))

        output.seek(0)
        return output.read()

    @staticmethod
    def export_to_csv(df: pd.DataFrame, filename: str = None) -> str:
        """Export DataFrame to CSV string"""
        return df.to_csv(index=False)


class MenuService:
    """Service for managing dynamic menu items"""

    @staticmethod
    def get_menu_structure() -> List[MenuItem]:
        """Get hierarchical menu structure"""
        try:
            # Get all menu items
            query = """
            SELECT id, name, type, icon, parent_id, sort_order, is_active
            FROM app_menu_items
            WHERE is_active = 1
            ORDER BY sort_order, name
            """

            result = db_manager.execute_query(query)

            # Convert to MenuItem objects
            all_items = []
            for row in result:
                item = MenuItem(
                    id=row["ID"],
                    name=row["NAME"],
                    type=row["TYPE"],
                    icon=row["ICON"],
                    parent_id=row["PARENT_ID"],
                    sort_order=row["SORT_ORDER"],
                    is_active=bool(row["IS_ACTIVE"]),
                    children=[],
                )
                all_items.append(item)

            # Build hierarchy
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
    """Service for managing saved queries"""

    @staticmethod
    def get_queries_by_menu_item(menu_item_id: int) -> List[Query]:
        """Get all queries for a menu item"""
        try:
            query = """
            SELECT id, name, description, sql_query, chart_type, chart_config, 
                   menu_item_id, is_active, created_at
            FROM app_queries
            WHERE menu_item_id = :1 AND is_active = 1
            ORDER BY name
            """

            result = db_manager.execute_query(query, (menu_item_id,))

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
        """Get query by ID"""
        try:
            query = """
            SELECT id, name, description, sql_query, chart_type, chart_config, 
                   menu_item_id, is_active, created_at
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
                    is_active=bool(row["IS_ACTIVE"]),
                    created_at=row["CREATED_AT"],
                )

            return None

        except Exception as e:
            logger.error(f"Error getting query by ID: {e}")
            return None


class DashboardService:
    """Service for managing dashboard widgets"""

    @staticmethod
    def get_dashboard_layout() -> List[DashboardWidget]:
        """Get dashboard widget layout"""
        try:
            query = """
            SELECT w.id, w.title, w.query_id, w.position_x, w.position_y, 
                   w.width, w.height, w.is_active,
                   q.name as query_name, q.sql_query, q.chart_type, q.chart_config
            FROM app_dashboard_widgets w
            JOIN app_queries q ON w.query_id = q.id
            WHERE w.is_active = 1 AND q.is_active = 1
            ORDER BY w.position_y, w.position_x
            """

            result = db_manager.execute_query(query)

            widgets = []
            for row in result:
                chart_config = {}
                if row["CHART_CONFIG"]:
                    try:
                        chart_config = json.loads(row["CHART_CONFIG"])
                    except:
                        chart_config = {}

                query_obj = Query(
                    id=row["QUERY_ID"],
                    name=row["QUERY_NAME"],
                    description="",
                    sql_query=row["SQL_QUERY"],
                    chart_type=row["CHART_TYPE"],
                    chart_config=chart_config,
                    menu_item_id=None,
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
