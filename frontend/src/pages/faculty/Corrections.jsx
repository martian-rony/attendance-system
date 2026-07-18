import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { correctionAPI } from "../../api/index.js";
import {
  Card,
  LoadingScreen,
  Badge,
  Button,
  EmptyState,
} from "../../components/ui/index.jsx";
import { ErrorAlert, Textarea } from "../../components/ui/form.jsx";
import { formatDate } from "../../utils/helpers.js";

const STATUS_COLOR = { pending: "yellow", approved: "green", rejected: "red" };

export default function FacultyCorrections() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [notes, setNotes] = useState({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["corrections", filter],
    queryFn: () =>
      correctionAPI
        .getAll(filter ? { status: filter } : {})
        .then((r) => r.data.data.corrections),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, decision, resolutionNote }) =>
      correctionAPI.resolve(id, { decision, resolutionNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["corrections"] });
    },
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load corrections" />;

  const corrections = data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {["pending", "approved", "rejected", ""].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
              filter === s
                ? "bg-brand-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {s || "all"}
          </button>
        ))}
      </div>

      {corrections.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No correction requests"
          description="Student attendance dispute requests will appear here."
        />
      ) : (
        <div className="space-y-3">
          {corrections.map((c) => (
            <Card key={c._id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {c.student?.firstName} {c.student?.lastName}
                    </span>
                    <Badge color={STATUS_COLOR[c.status]}>{c.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {c.course?.code} · {c.session?.title || "Session"} ·{" "}
                    {formatDate(c.session?.date)}
                  </p>
                  <p className="mt-2 text-sm text-gray-700">
                    Requested status:{" "}
                    <span className="font-medium">{c.requestedStatus}</span>
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Reason: {c.reason}
                  </p>
                  {c.evidenceUrl && (
                    <a
                      href={c.evidenceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline"
                    >
                      View evidence
                    </a>
                  )}
                  {c.status !== "pending" && c.resolutionNote && (
                    <p className="mt-2 text-xs text-gray-500">
                      Resolution note: {c.resolutionNote}
                    </p>
                  )}
                </div>
              </div>

              {c.status === "pending" && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <Textarea
                    placeholder="Optional note to the student…"
                    rows={2}
                    value={notes[c._id] || ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [c._id]: e.target.value }))
                    }
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      disabled={resolveMutation.isLoading}
                      onClick={() =>
                        resolveMutation.mutate({
                          id: c._id,
                          decision: "approved",
                          resolutionNote: notes[c._id],
                        })
                      }
                    >
                      <CheckCircle className="h-4 w-4" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={resolveMutation.isLoading}
                      onClick={() =>
                        resolveMutation.mutate({
                          id: c._id,
                          decision: "rejected",
                          resolutionNote: notes[c._id],
                        })
                      }
                    >
                      <XCircle className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
