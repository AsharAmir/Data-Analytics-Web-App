import React, { useRef, useState } from "react";
import apiClient from "../../lib/api";
import { toast } from "react-hot-toast";

interface Props {
  visible: boolean;
  onClose: () => void;
  tableName: string;
  onImported: () => void;
}

const FileImportModal: React.FC<Props> = ({
  visible,
  onClose,
  tableName,
  onImported,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"skip_failed" | "abort_on_error">(
    "abort_on_error",
  );
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file to upload");
      return;
    }
    setLoading(true);
    toast.loading("Uploading and processing file …", { id: "import" });
    try {
      const res: any = await apiClient.importTableData(tableName, file, mode);
      if (res?.data?.success) {
        const { inserted_records, total_records } = res.data.data;
        toast.success(
          `Imported ${inserted_records}/${total_records} records.`,
          { id: "import" },
        );
      } else {
        const { errors = [] } = res.data.data;
        toast.error(
          (
            <>
              <b>Import failed</b>
              <ul className="list-disc list-inside">
                {errors.slice(0, 3).map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            </>
          ),
          { id: "import", duration: 8000 },
        );
      }
      onImported();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.detail || "Import failed", { id: "import" });
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto"
      onClick={loading ? undefined : onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full m-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-semibold">Import into {tableName}</h2>
          <button onClick={onClose} disabled={loading} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500"
          onClick={() => fileRef.current?.click()}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            ref={fileRef}
            className="hidden"
            onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
          />
          {file ? (
            <p className="text-gray-700">Selected: {file.name}</p>
          ) : (
            <p className="text-gray-500">Drop a file here or click to select</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <label
            className={`p-4 border rounded-lg cursor-pointer text-center ${
              mode === "abort_on_error" ? "border-blue-500 bg-blue-50" : ""
            }`}
          >
            <input
              type="radio"
              name="import-mode"
              value="abort_on_error"
              checked={mode === "abort_on_error"}
              onChange={() => setMode("abort_on_error")}
              className="sr-only"
            />
            <h4 className="font-semibold">Strict Mode</h4>
            <p className="text-sm text-gray-600">Abort on any error</p>
          </label>
          <label
            className={`p-4 border rounded-lg cursor-pointer text-center ${
              mode === "skip_failed" ? "border-blue-500 bg-blue-50" : ""
            }`}
          >
            <input
              type="radio"
              name="import-mode"
              value="skip_failed"
              checked={mode === "skip_failed"}
              onChange={() => setMode("skip_failed")}
              className="sr-only"
            />
            <h4 className="font-semibold">Flexible Mode</h4>
            <p className="text-sm text-gray-600">Skip failed records</p>
          </label>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 hover:bg-gray-100"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center"
            disabled={loading}
          >
            {loading && (
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? "Importing…" : "Start Import"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileImportModal; 