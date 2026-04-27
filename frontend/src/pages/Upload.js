// Upload.js
import React, { useState, useRef } from "react";
import api from "../utils/api";
import toast from "react-hot-toast";
import "./Upload.css";

function UploadZone({ title, subtitle, icon, accept, endpoint, onSuccess, resultRenderer }) {
  const [file, setFile]       = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const inputRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext)) { toast.error("Only CSV and Excel files accepted"); return; }
    setFile(f); setResult(null);
  };

  const handleUpload = async () => {
    if (!file) return toast.error("Please select a file first");
    setLoading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await api.post(endpoint, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(res.data.data || res.data);
      toast.success(res.data.message);
      onSuccess?.(); setFile(null);
    } catch (err) { toast.error(err.response?.data?.message || "Upload failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="card upload-zone-card">
      <div className="upload-zone-head">
        <div className="upload-zone-title-row">
          <div className="upload-zone-icon">{icon}</div>
          <div className="upload-zone-title">{title}</div>
        </div>
        <div className="upload-zone-sub">{subtitle}</div>
      </div>
      <div className="upload-zone-body">
        <div
          className={`drop-zone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
          {file ? (
            <div className="file-selected">
              <div className="file-icon">📄</div>
              <div className="file-name">{file.name}</div>
              <div className="file-size">{(file.size / 1024).toFixed(1)} KB</div>
            </div>
          ) : (
            <div className="drop-hint">
              <div className="drop-icon">📁</div>
              <div className="drop-text">Drop file here or click to browse</div>
              <div className="drop-sub">CSV or Excel (.xlsx/.xls)</div>
            </div>
          )}
        </div>

        <div className="upload-actions">
          {file && <button className="btn-secondary" onClick={() => { setFile(null); setResult(null); }}>Clear</button>}
          <button className="btn-primary" onClick={handleUpload} disabled={!file || loading}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {loading ? <><span className="spinner" /> Processing...</> : "Upload & Process"}
          </button>
        </div>

        {result && (
          <div className="upload-result fade-in">
            {resultRenderer ? resultRenderer(result) : (
              <>
                <div className="result-row"><span className="result-label">Total records</span><span className="result-value">{result.totalRecords}</span></div>
                <div className="result-row"><span className="result-label">New entries</span><span className="result-value" style={{ color: "var(--green)" }}>{result.created}</span></div>
                <div className="result-row"><span className="result-label">Updated</span><span className="result-value" style={{ color: "var(--blue)" }}>{result.updated}</span></div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Upload() {
  return (
    <div className="upload-page fade-in">
      <div className="page-header">
        <h1 className="page-title">Upload Reports</h1>
        <p className="page-subtitle">Upload your daily reports — orders are processed automatically</p>
      </div>

      <div className="how-it-works">
        <div className="how-title">📋 How it works</div>
        <div className="how-steps">
          {[
            { n: 1, text: <><strong>Add SKU prices</strong> in SKU Pricing first</> },
            { n: 2, text: <><strong>Upload Pickup CSV</strong> — captures Tracking IDs</> },
            { n: 3, text: <><strong>Upload Settlement Excel</strong> — Orders sheet auto-detected</> },
            { n: 4, text: <><strong>Upload Returns</strong> (optional) — marks returned orders</> },
          ].map((s) => (
            <div className="how-step" key={s.n}>
              <div className="how-step-num">{s.n}</div>
              <div className="how-step-text">{s.text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 1: Pickup + Settlement */}
      <div className="upload-grid" style={{ marginBottom: 20 }}>
        <UploadZone
          title="Pickup Report"
          subtitle="CSV with: ORDER ITEM ID, Order Id, SKU, Dispatch by date, Tracking ID"
          icon="📦"
          accept=".csv,.xlsx,.xls"
          endpoint="/upload/pickup"
        />
        <UploadZone
          title="Settlement Report"
          subtitle="Flipkart Excel — Orders sheet auto-detected"
          icon="💰"
          accept=".xlsx,.xls"
          endpoint="/upload/settlement"
        />
      </div>

      {/* Row 2: Returns */}
      <div className="return-zone-wrap">
        <UploadZone
          title="Return Report"
          subtitle="CSV or Excel with Tracking IDs of returned orders — marks those orders as Returned"
          icon="↩️"
          accept=".csv,.xlsx,.xls"
          endpoint="/upload/returns"
          resultRenderer={(result) => (
            <>
              <div className="result-row">
                <span className="result-label">Tracking IDs in file</span>
                <span className="result-value">{result.totalTrackingIds}</span>
              </div>
              <div className="result-row">
                <span className="result-label">Orders marked Returned</span>
                <span className="result-value" style={{ color: "var(--red)" }}>{result.marked}</span>
              </div>
              <div className="result-row">
                <span className="result-label">Tracking IDs not found</span>
                <span className="result-value" style={{ color: "var(--yellow)" }}>{result.notFound}</span>
              </div>
              {result.notFoundIds?.length > 0 && (
                <div className="result-errors">
                  <div className="error-title">⚠ Not found ({result.notFound})</div>
                  {result.notFoundIds.map((id, i) => <div key={i} className="error-row">{id}</div>)}
                </div>
              )}
            </>
          )}
        />
      </div>

      {/* Return report format hint */}
      <div className="return-hint">
        <strong>↩️ Return Report Format:</strong> A simple CSV or Excel with a column named{" "}
        <code>Tracking ID</code> containing the tracking IDs of returned orders.
        The system will find matching orders and mark them as <strong>Returned</strong> with profit = ₹0.
      </div>
    </div>
  );
}
