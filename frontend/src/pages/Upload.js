import React, { useRef, useState } from 'react';
import api from '../utils/api';
import './Upload.css';

function UploadZone({ title, accept, description, color, endpoint, onResult }) {
  const inputRef = useRef();
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const onPick = async (f) => {
    if (!f) return;
    setFile(f);
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const data = new FormData();
      data.append('file', f);
      const res = await api.post(endpoint, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      onResult && onResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`upload-zone color-${color} ${dragging ? 'drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files[0]) onPick(e.dataTransfer.files[0]);
      }}
    >
      <h3>{title}</h3>
      <p className="text-muted">{description}</p>
      <input ref={inputRef} type="file" accept={accept} hidden onChange={(e) => onPick(e.target.files[0])} />
      <button className="btn btn-secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? <span className="spinner" style={{ borderColor: 'rgba(0,0,0,0.15)', borderTopColor: '#000' }} /> : 'Choose file'}
      </button>
      {file && <div className="upload-file">{file.name}</div>}
      {error && <div className="upload-error">{error}</div>}
      {result && (
        <div className="upload-result">
          {result.type === 'returns' ? (
            <>
              <div>Tracking IDs found: <strong>{result.trackingIdsFound}</strong></div>
              <div>Orders marked returned: <strong>{result.ordersMarked}</strong></div>
              <div>Not found: <strong>{result.notFound}</strong></div>
            </>
          ) : result.type === 'return-incoming' ? (
            <>
              <div>Processed: <strong>{result.processed}</strong></div>
              <div>Orders flagged incoming: <strong>{result.ordersMarked}</strong></div>
              <div>Skipped (no match): <strong>{result.skipped}</strong></div>
              {result.skipped > 0 && result.skippedSample?.length > 0 && (
                <div className="upload-skipped-sample">
                  <em>Sample of skipped IDs:</em>
                  <ul>
                    {result.skippedSample.map((id) => (
                      <li key={id}>{id}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : result.type === 'settlement' ? (
            <>
              <div>Processed: <strong>{result.processed}</strong></div>
              <div>Updated: <strong>{result.updated}</strong></div>
              <div>Skipped (no pickup match): <strong>{result.skipped}</strong></div>
              <div>Matched: <strong>{result.matched}</strong></div>
              {result.skipped > 0 && result.skippedSample?.length > 0 && (
                <div className="upload-skipped-sample">
                  <em>Sample of skipped Order Item IDs:</em>
                  <ul>
                    {result.skippedSample.map((id) => (
                      <li key={id}>{id}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              <div>Processed: <strong>{result.processed}</strong></div>
              <div>Inserted: <strong>{result.inserted}</strong></div>
              <div>Updated: <strong>{result.updated}</strong></div>
              <div>Matched: <strong>{result.matched}</strong></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Upload() {
  const [refreshTick, setRefreshTick] = useState(0);
  return (
    <div className="upload-page">
      <div className="page-head">
        <div>
          <h1>Upload Reports</h1>
          <p className="text-muted">Upload Flipkart pickup, settlement, and return reports.</p>
        </div>
      </div>

      <div className="card how-card">
        <h3>How it works</h3>
        <div className="steps">
          <div><span>1</span> Upload <strong>Pickup CSV</strong> from Flipkart Seller Hub.</div>
          <div><span>2</span> Upload <strong>Settlement Excel</strong> — only the <em>Orders</em> sheet is read.</div>
          <div><span>3</span> Orders matched by <strong>Order Item ID</strong> automatically.</div>
          <div><span>4</span> Upload <strong>Return on the way</strong> to mark incoming returns.</div>
          <div><span>5</span> Upload <strong>Return Received</strong> when the parcel physically reaches you.</div>
        </div>
      </div>

      <div className="upload-grid">
        <UploadZone
          title="Pickup Report"
          description="CSV — needs columns: ORDER ITEM ID, Order Id, SKU, Dispatch by date, Tracking ID"
          accept=".csv,text/csv"
          color="blue"
          endpoint="/upload/pickup"
          onResult={() => setRefreshTick((x) => x + 1)}
        />
        <UploadZone
          title="Settlement Report"
          description="Excel — reads only the Orders sheet. Multiple rows per Order Item ID are summed."
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          color="blue"
          endpoint="/upload/settlement"
          onResult={() => setRefreshTick((x) => x + 1)}
        />
        <UploadZone
          title="Return on the way"
          description="CSV / Excel — full Flipkart returns-in-transit file. Matched by Order Item ID."
          accept="*"
          color="orange"
          endpoint="/upload/return-incoming"
          onResult={() => setRefreshTick((x) => x + 1)}
        />
        <UploadZone
          title="Return Received"
          description="CSV / Excel — single column of Tracking IDs for parcels physically back with you."
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          color="yellow"
          endpoint="/upload/returns"
          onResult={() => setRefreshTick((x) => x + 1)}
        />
      </div>

      <div className="card hint-card">
        <strong>💡 Return file formats</strong>
        <p>
          <strong>Return on the way</strong> — Flipkart's returns-in-transit CSV with rich metadata.
          Matched primarily by <code>Order Item ID</code>; falls back to <code>Tracking ID</code>.
          Marks orders as <em>Return Incoming</em> but keeps profit untouched until the parcel is received.
        </p>
        <p>
          <strong>Return Received</strong> — single column of Tracking IDs (header: <code>Tracking ID</code>,
          <code>TrackingID</code>, <code>tracking_id</code>, or unnamed). Marks orders as fully returned.
          Profit is recomputed from whatever settlement Flipkart actually paid (it may be negative if
          they've charged reverse shipping).
        </p>
      </div>

      <div style={{ display: 'none' }}>{refreshTick}</div>
    </div>
  );
}
