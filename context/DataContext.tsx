"use client";
import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import * as XLSX from "xlsx";
import {
  financialData as defaultFinancial,
  totalBudget as defaultTotal,
  schemes as defaultSchemes,
  actionPoints as defaultActions,
  ulbPerformance as defaultULB,
  verticals as defaultVerticals,
  monthlySpend as defaultMonthly,
  nbaRecommendations as defaultNBA,
} from "@/lib/data";
import { DashboardSpec, DEFAULT_SPEC, applyPatch } from "@/lib/dashboardSpec";
import { withNextBasePath } from "@/lib/next-base-path";

export type FinancialRow = typeof defaultFinancial[number];
export type SchemeRow = typeof defaultSchemes[number];
export type ActionRow = typeof defaultActions[number];
export type ULBRow = typeof defaultULB[number];
export type UploadStatus = "idle" | "loading" | "success" | "error" | "review_pending" | "processing";

export interface UploadState {
  status: UploadStatus;
  fileName?: string;
  rowCount?: number;
  error?: string;
  uploadId?: number;
  reviewItems?: any[];
}

export type DatasetKey = "financial" | "schemes" | "actions" | "ulb";

export interface DraftData {
  financial: FinancialRow[] | null;
  schemes: SchemeRow[] | null;
  actions: ActionRow[] | null;
  ulbs: ULBRow[] | null;
}

interface DataContextType {
  // Live data (committed after Freeze)
  financial: FinancialRow[];
  schemes: SchemeRow[];
  actions: ActionRow[];
  ulbs: ULBRow[];
  verticals: typeof defaultVerticals;
  monthly: typeof defaultMonthly;
  nba: typeof defaultNBA;
  totalBudget: typeof defaultTotal;

  // Active spec (applied to live dashboards after Freeze)
  frozenSpec: DashboardSpec;

  // Upload state
  uploadStatus: Record<DatasetKey, UploadState>;

  // Approval workflow
  approvalOpen: boolean;
  draftDatasetKey: DatasetKey | null;
  draftData: DraftData;
  openApproval: (key: DatasetKey, data: DraftData) => void;
  freezeAndApply: (spec: DashboardSpec) => void;
  discardDraft: () => void;

  // Direct upload functions (go to draft, not live)
  uploadFinancial: (file: File) => Promise<void>;
  uploadSchemes: (file: File) => Promise<void>;
  uploadActions: (file: File) => Promise<void>;
  uploadULB: (file: File) => Promise<void>;
  approveUpload: (uploadId: number, key: DatasetKey, mappings: any) => Promise<void>;
  resetDataset: (dataset: DatasetKey) => void;
}

const DataContext = createContext<DataContextType | null>(null);

function computeTotal(rows: FinancialRow[]) {
  const budget = rows.reduce((s, r) => s + r.budget, 0);
  const so = rows.reduce((s, r) => s + r.so, 0);
  const ifms = rows.reduce((s, r) => s + r.ifms, 0);
  return { budget, so, ifms, pct: budget > 0 ? parseFloat(((ifms / budget) * 100).toFixed(2)) : 0 };
}

function deriveStatus(pct: number): "critical" | "warning" | "on-track" {
  if (pct < 20) return "critical";
  if (pct < 60) return "warning";
  return "on-track";
}

export function DataProvider({ children }: { children: ReactNode }) {
  // ── Live state ──────────────────────────────────────────────
  const [financial, setFinancial] = useState<FinancialRow[]>(defaultFinancial);
  const [schemes, setSchemes] = useState<SchemeRow[]>(defaultSchemes);
  const [actions, setActions] = useState<ActionRow[]>(defaultActions);
  const [ulbs, setULBs] = useState<ULBRow[]>(defaultULB);
  const [total, setTotal] = useState(defaultTotal);
  const [frozenSpec, setFrozenSpec] = useState<DashboardSpec>(DEFAULT_SPEC);

  // ── Upload status ───────────────────────────────────────────
  const [uploadStatus, setUploadStatus] = useState<Record<DatasetKey, UploadState>>({
    financial: { status: "idle" },
    schemes: { status: "idle" },
    actions: { status: "idle" },
    ulb: { status: "idle" },
  });

  // ── Draft / approval state ──────────────────────────────────
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [draftDatasetKey, setDraftDatasetKey] = useState<DatasetKey | null>(null);
  const [draftData, setDraftData] = useState<DraftData>({
    financial: null, schemes: null, actions: null, ulbs: null,
  });

  function setStatus(key: DatasetKey, state: UploadState) {
    setUploadStatus(s => ({ ...s, [key]: state }));
  }

  async function parseExcel(file: File): Promise<XLSX.WorkSheet> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          resolve(wb.Sheets[wb.SheetNames[0]]);
        } catch {
          reject(new Error("Could not parse file. Ensure it is a valid .xlsx or .csv file."));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Open approval workflow ──────────────────────────────────
  const openApproval = useCallback((key: DatasetKey, data: DraftData) => {
    setDraftDatasetKey(key);
    setDraftData(data);
    setApprovalOpen(true);
  }, []);

  // ── Freeze & Apply ──────────────────────────────────────────
  const freezeAndApply = useCallback((spec: DashboardSpec) => {
    if (draftDatasetKey === "financial" && draftData.financial) {
      setFinancial(draftData.financial);
      setTotal(computeTotal(draftData.financial));
      setStatus("financial", { status: "success", fileName: uploadStatus.financial.fileName, rowCount: draftData.financial.length });
    }
    if (draftDatasetKey === "schemes" && draftData.schemes) {
      setSchemes(draftData.schemes);
      setStatus("schemes", { status: "success", fileName: uploadStatus.schemes.fileName, rowCount: draftData.schemes.length });
    }
    if (draftDatasetKey === "actions" && draftData.actions) {
      setActions(draftData.actions);
      setStatus("actions", { status: "success", fileName: uploadStatus.actions.fileName, rowCount: draftData.actions.length });
    }
    if (draftDatasetKey === "ulb" && draftData.ulbs) {
      setULBs(draftData.ulbs);
      setStatus("ulb", { status: "success", fileName: uploadStatus.ulb.fileName, rowCount: draftData.ulbs.length });
    }
    setFrozenSpec(spec);
    setDraftData({ financial: null, schemes: null, actions: null, ulbs: null });
    setDraftDatasetKey(null);
    setApprovalOpen(false);
  }, [draftDatasetKey, draftData, uploadStatus]);

  // ── Discard draft ───────────────────────────────────────────
  const discardDraft = useCallback(() => {
    if (draftDatasetKey) setStatus(draftDatasetKey, { status: "idle" });
    setDraftData({ financial: null, schemes: null, actions: null, ulbs: null });
    setDraftDatasetKey(null);
    setApprovalOpen(false);
  }, [draftDatasetKey]);

  const pollStatus = useCallback(async (uploadId: number, key: DatasetKey) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(withNextBasePath(`/api/v1/uploads/${uploadId}`));
        const data = await res.json();
        
        if (data.status === "review_pending") {
          clearInterval(interval);
          setStatus(key, {
            status: "review_pending",
            uploadId,
            reviewItems: data.error_detail?.review_items || [],
            fileName: data.file_name,
          });
        } else if (data.status === "completed") {
          clearInterval(interval);
          setStatus(key, {
            status: "success",
            fileName: data.file_name,
            rowCount: data.processed_rows,
          });
          // Refresh data
          // In a real app, we'd fetch the actual data here
          // For now, let's just mark it as success
        } else if (data.status === "failed") {
          clearInterval(interval);
          setStatus(key, {
            status: "error",
            error: data.error_detail?.error || "Processing failed",
            fileName: data.file_name,
          });
        } else if (data.status === "approved" && data.stage === "ready_for_processing") {
          clearInterval(interval);
          setStatus(key, {
            status: "processing",
            uploadId,
            fileName: data.file_name,
          });
        }
      } catch (err: any) {
        clearInterval(interval);
        setStatus(key, { status: "error", error: "Failed to poll status" });
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const uploadFile = useCallback(async (file: File, key: DatasetKey) => {
    setStatus(key, { status: "loading", fileName: file.name });
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const uploadRes = await fetch(withNextBasePath("/api/v1/uploads"), {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      
      if (!uploadRes.ok) throw new Error(uploadData.detail || "Upload failed");
      
      const uploadId = uploadData.upload_id;
      setStatus(key, { status: "processing", fileName: file.name, uploadId });
      
      const processRes = await fetch(withNextBasePath(`/api/v1/uploads/${uploadId}/process`), {
        method: "POST",
      });
      if (!processRes.ok) {
        const err = await processRes.json();
        throw new Error(err.detail || "Processing failed to start");
      }
      
      pollStatus(uploadId, key);
    } catch (err: any) {
      setStatus(key, { status: "error", fileName: file.name, error: err.message });
    }
  }, [pollStatus]);

  const approveUpload = useCallback(async (uploadId: number, key: DatasetKey, mappings: any) => {
    setStatus(key, { status: "processing", uploadId });
    try {
      const res = await fetch(withNextBasePath(`/api/v1/uploads/${uploadId}/approve`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mappings),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Approval failed");
      }
      
      // After approval, start processing again
      await fetch(withNextBasePath(`/api/v1/uploads/${uploadId}/process`), { method: "POST" });
      pollStatus(uploadId, key);
    } catch (err: any) {
      setStatus(key, { status: "error", uploadId, error: err.message });
    }
  }, [pollStatus]);

  // ── Upload handlers → go to draft, not live ──────────────────
  const uploadFinancial = useCallback(async (file: File) => {
    await uploadFile(file, "financial");
  }, [uploadFile]);

  const uploadSchemes = useCallback(async (file: File) => {
    await uploadFile(file, "schemes");
  }, [uploadFile]);

  const uploadActions = useCallback(async (file: File) => {
    await uploadFile(file, "actions");
  }, [uploadFile]);

  const uploadULB = useCallback(async (file: File) => {
    await uploadFile(file, "ulb");
  }, [uploadFile]);

  const resetDataset = useCallback((dataset: DatasetKey) => {
    if (dataset === "financial") { setFinancial(defaultFinancial); setTotal(defaultTotal); }
    if (dataset === "schemes") setSchemes(defaultSchemes);
    if (dataset === "actions") setActions(defaultActions);
    if (dataset === "ulb") setULBs(defaultULB);
    setStatus(dataset, { status: "idle" });
  }, []);

  return (
    <DataContext.Provider value={{
      financial, schemes, actions, ulbs,
      verticals: defaultVerticals, monthly: defaultMonthly, nba: defaultNBA, totalBudget: total,
      frozenSpec,
      uploadStatus, uploadFinancial, uploadSchemes, uploadActions, uploadULB, approveUpload, resetDataset,
      approvalOpen, draftDatasetKey, draftData,
      openApproval, freezeAndApply, discardDraft,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}
