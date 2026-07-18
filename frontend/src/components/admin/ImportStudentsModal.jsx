import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Download, FileText } from "lucide-react";
import { importAPI } from "../../api/index.js";
import { Button, Modal } from "../ui/index.jsx";
import { Textarea } from "../ui/form.jsx";
import { downloadBlob } from "../../utils/helpers.js";

/**
 * Admin bulk student import. Paste CSV or upload a .csv file, preview counts,
 * submit, and see a created/skipped/failed summary. Also downloads a template.
 */
export function ImportStudentsModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");
  const [defaultPassword, setDefaultPassword] = useState("");
  const [summary, setSummary] = useState(null);

  const importMutation = useMutation({
    mutationFn: () => importAPI.importStudents(csv, defaultPassword || undefined),
    onSuccess: (res) => {
      setSummary(res.data.data);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
    setSummary(null);
  };

  const downloadTemplate = async () => {
    const res = await importAPI.studentTemplate();
    downloadBlob(res.data, "student-import-template.csv");
  };

  const close = () => {
    setCsv("");
    setDefaultPassword("");
    setSummary(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import students (CSV)"
      size="lg"
      footer={
        <div className="flex justify-between">
          <Button variant="secondary" onClick={downloadTemplate}>
            <Download className="h-4 w-4" /> Template
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!csv.trim() || importMutation.isLoading}
            >
              <Upload className="h-4 w-4" />
              {importMutation.isLoading ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Columns: firstName, lastName, email (required); studentId, program,
          year, semester, rollNumber, phone, password (optional). Existing
          emails are skipped.
        </p>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <FileText className="h-4 w-4" /> Choose .csv file
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFile}
          />
        </label>

        <Textarea
          rows={8}
          placeholder="…or paste CSV here (first row = headers)"
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setSummary(null);
          }}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Default password (optional, applied when a row has none)
          </label>
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Student@123"
            value={defaultPassword}
            onChange={(e) => setDefaultPassword(e.target.value)}
          />
        </div>

        {importMutation.isError && (
          <p className="text-sm text-danger-600">
            {importMutation.error?.response?.data?.message || "Import failed"}
          </p>
        )}

        {summary && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
            <p className="font-medium text-gray-900">
              Imported {summary.summary.created} of {summary.summary.total} rows
            </p>
            <p className="text-gray-600">
              Created: {summary.summary.created} · Skipped:{" "}
              {summary.summary.skipped} · Failed: {summary.summary.failed}
            </p>
            {summary.failed?.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-danger-600">
                {summary.failed.map((f, i) => (
                  <li key={i}>
                    Line {f.line} ({f.email}): {f.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
