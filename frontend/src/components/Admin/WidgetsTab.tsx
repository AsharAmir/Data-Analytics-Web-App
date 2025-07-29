import React from "react";
import WidgetsSection from "./WidgetsSection";
import { MenuItem } from "../../types";

interface Widget {
  id: number;
  title: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  query_name: string;
  chart_type: string;
  created_at: string;
}

interface SimpleQueryInfo {
  id: number;
  name: string;
  chart_type: string;
  menu_name: string;
}

interface WidgetFormState {
  title: string;
  query_id: number | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  create_new_query: boolean;
  query_name: string;
  sql_query: string;
  chart_type: string;
  menu_item_id: number | null;
}

interface WidgetsTabProps {
  widgets: Widget[];
  queries: SimpleQueryInfo[];
  menuItems: MenuItem[];
  showWidgetForm: boolean;
  setShowWidgetForm: React.Dispatch<React.SetStateAction<boolean>>;
  widgetForm: WidgetFormState;
  setWidgetForm: React.Dispatch<React.SetStateAction<WidgetFormState>>;
  createWidget: () => Promise<void>;
  deleteWidget: (id: number) => void;
}

const WidgetsTab: React.FC<WidgetsTabProps> = ({
  widgets,
  queries,
  menuItems,
  showWidgetForm,
  setShowWidgetForm,
  widgetForm,
  setWidgetForm,
  createWidget,
  deleteWidget,
}) => {
  return (
    <WidgetsSection
      widgets={widgets}
      queries={queries}
      menuItems={menuItems}
      showWidgetForm={showWidgetForm}
      setShowWidgetForm={setShowWidgetForm}
      widgetForm={widgetForm}
      setWidgetForm={setWidgetForm}
      createWidget={createWidget}
      deleteWidget={deleteWidget}
    />
  );
};

export default WidgetsTab; 