#!/usr/bin/env python3
"""
Script to add Excel Compare menu item to the database if it doesn't exist.
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from database import db_manager
import logging

logger = logging.getLogger(__name__)

def add_excel_compare_menu():
    """Add Excel Compare menu item if it doesn't exist."""
    try:
        # Check if Excel Compare menu item already exists
        check_query = "SELECT COUNT(*) FROM app_menu_items WHERE name = 'Excel Compare'"
        result = db_manager.execute_query(check_query)
        
        if result[0]["COUNT(*)"] > 0:
            print("Excel Compare menu item already exists")
            return
        
        # Get the highest sort_order for top-level menu items
        sort_order_query = "SELECT MAX(sort_order) FROM app_menu_items WHERE parent_id IS NULL"
        sort_result = db_manager.execute_query(sort_order_query)
        max_sort_order = sort_result[0]["MAX(SORT_ORDER)"] or 0
        
        # Insert Excel Compare menu item
        insert_query = """
        INSERT INTO app_menu_items (name, type, icon, parent_id, sort_order, is_active) 
        VALUES (:1, :2, :3, :4, :5, :6)
        """
        db_manager.execute_non_query(
            insert_query,
            ("Excel Compare", "excel-compare", "document-duplicate", None, max_sort_order + 1, 1)
        )
        
        print("Excel Compare menu item added successfully")
        
    except Exception as e:
        logger.error(f"Error adding Excel Compare menu item: {e}")
        print(f"Error: {e}")

if __name__ == "__main__":
    add_excel_compare_menu()