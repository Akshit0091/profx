import React, { useRef, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import { useActivePlatform } from '../utils/platforms';
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
          {result.type === 'meesho-payment' ? (
            <>
              <div>Processed: <strong>{result.processed}</strong></div>
              <div>Inserted: <strong>{result.inserted}</strong></div>
              <div>Updated: <strong>{result.updated}</strong></div>
              <div>Returns (RTO + Return): <strong>{result.returns}</strong></div>
              <div>Matched: <strong>{result.matched}</strong></div>
            </>
          ) : result.type === 'returns' ? (
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
  const { user } = useAuth();
  const { platform } = useActivePlatform(user);
  const isMeesho = platform === 'meesho';
  const isAmazon = platform === 'amazon';

  // Upload History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleting, setDeleting] = useState(null); // upload id being deleted

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/upload/history');
      // Filter to current platform (or show all if platform is 'all')
      const items = (res.data.history || []).filter(
        (h) => platform === 'all' || h.platform === platform
      );
      setHistory(items);
    } catch (err) {
      console.error('Failed to load upload history', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [platform]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshTick]);

  const handleDeleteFile = async (uploadId, fileName) => {
    const confirmed = window.confirm(
      `Delete "${fileName}"?\n\nThis will rollback all changes made by this upload (entries removed, orders recomputed). This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      setDeleting(uploadId);
      const res = await api.delete(`/upload/file/${uploadId}`);
      alert(`Rolled back "${res.data.fileName || fileName}":\n• ${res.data.rolled || 0} items rolled back`);
      setRefreshTick((x) => x + 1);
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="upload-page">
      <div className="page-head">
        <div>
          <h1>Upload Reports</h1>
          <p className="text-muted">
            {isMeesho
              ? 'Upload your Meesho payment file — one file contains everything.'
              : isAmazon
              ? 'Upload your Amazon Monthly Transaction CSV — orders, refunds, and reimbursements in one file.'
              : 'Upload Flipkart pickup, settlement, and return reports.'}
          </p>
        </div>
      </div>

      {isMeesho ? (
        <>
          <div className="card how-card">
            <h3>How it works</h3>
            <div className="steps">
              <div><span>1</span> Download your <strong>Payment file</strong> from Meesho Supplier Panel.</div>
              <div><span>2</span> Drop the <strong>XLSX</strong> below — the <em>Order Payments</em> sheet is read.</div>
              <div><span>3</span> Orders, settlements, RTOs and returns are imported in one pass.</div>
              <div><span>4</span> Profit is computed automatically from the final settlement amount.</div>
            </div>
          </div>

          <div className="upload-grid">
            <UploadZone
              title="Meesho Payment File"
              description="XLSX — single payout file. Reads the Order Payments sheet (Sub Order No, Dispatch Date, Supplier SKU, Live Order Status, Payment Date, Final Settlement Amount)."
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              color="purple"
              endpoint="/upload/meesho-payment"
              onResult={() => setRefreshTick((x) => x + 1)}
            />
          </div>

          <div className="card hint-card">
            <strong>💡 One file does it all</strong>
            <p>
              Meesho bundles pickup, settlement, and returns into a single payout file, so there's
              just one drop zone. <strong>RTO</strong> rows settle to ₹0; <strong>Return</strong> rows
              can be negative (reverse shipping). Both are flagged automatically and profit is taken
              straight from the <code>Final Settlement Amount</code>.
            </p>
          </div>
        </>
      ) : isAmazon ? (
        <>
          <div className="card how-card">
            <h3>How it works</h3>
            <div className="steps">
              <div><span>1</span> Download <strong>Monthly Transaction CSV</strong> from Amazon Seller Central → Reports → Payments.</div>
              <div><span>2</span> Upload the <strong>CSV</strong> below — orders, refunds, and reimbursements are read.</div>
              <div><span>3</span> Fulfillment type (Easy Ship / Self Ship) is detected automatically per order.</div>
              <div><span>4</span> Profit is computed from settlement minus purchase price.</div>
            </div>
          </div>

          <div className="upload-grid">
            <UploadZone
              title="Amazon Monthly Transaction"
              description="CSV — the Monthly Unified Transaction report from Amazon Seller Central. Contains orders, refunds, fees, and reimbursements."
              accept=".csv,text/csv"
              color="orange"
              endpoint="/upload/amazon-transaction"
              onResult={() => setRefreshTick((x) => x + 1)}
            />
          </div>

          <div className="card hint-card">
            <strong>📦 Amazon settlement in one file</strong>
            <p>
              Amazon's Monthly Transaction CSV includes all order types: regular sales, refunds,
              SAFE-T reimbursements, and fee adjustments. The <code>total</code> column is the net
              amount Amazon pays you per transaction. For <strong>Self Ship</strong> orders, set your
              SKU weights and shipping rates in Settings to get accurate profit after shipping costs.
            </p>
          </div>
        </>
      ) : (
        <>
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
        </>
      )}

      {/* Upload History */}
      {history.length > 0 && (
        <div className="card" style={{ marginTop: 22, padding: '18px 22px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>Upload History</h3>
          <p className="text-muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
            All uploaded files. Delete a file to rollback its changes and recompute affected orders.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>File</th>
                  <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>Type</th>
                  <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>Uploaded</th>
                  <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rows</th>
                  <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>Affected</th>
                  <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const typeLabels = {
                    'pickup': { label: 'Pickup', bg: '#eff6ff', color: '#1d4ed8' },
                    'settlement': { label: 'Settlement', bg: '#eff6ff', color: '#1d4ed8' },
                    'returns': { label: 'Return Received', bg: '#fef9c3', color: '#854d0e' },
                    'return-incoming': { label: 'Return Incoming', bg: '#fff7ed', color: '#c2410c' },
                    'meesho-payment': { label: 'Meesho Payment', bg: '#fdf2f8', color: '#be185d' },
                    'amazon-transaction': { label: 'Amazon', bg: '#fff7ed', color: '#c2410c' },
                  };
                  const t = typeLabels[h.type] || { label: h.type, bg: '#f1f5f9', color: '#475569' };
                  return (
                    <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.fileName}>
                        {h.fileName}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                          padding: '3px 8px', borderRadius: 5, background: t.bg, color: t.color,
                        }}>
                          {t.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12.5 }}>
                        {new Date(h.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: "'DM Mono', monospace" }}>{h.rowCount || 0}</td>
                      <td style={{ padding: '10px 12px', fontFamily: "'DM Mono', monospace" }}>{h.affectedCount || 0}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ fontSize: 12, padding: '5px 10px' }}
                          onClick={() => handleDeleteFile(h.id, h.fileName)}
                          disabled={deleting === h.id}
                        >
                          {deleting === h.id ? '...' : '🗑 Delete'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {historyLoading && <div className="text-muted" style={{ textAlign: 'center', padding: 12, fontSize: 13 }}>Loading history...</div>}
        </div>
      )}

      <div style={{ display: 'none' }}>{refreshTick}</div>
    </div>
  );
}
