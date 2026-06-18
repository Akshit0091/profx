import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import './SKUPricing.css';

export default function SKUPricing() {
  const [skus, setSkus] = useState([]);
  const [missing, setMissing] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [newSku, setNewSku] = useState({ skuId: '', purchasePrice: '' });
  const [editingId, setEditingId] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [missingPrices, setMissingPrices] = useState({});

  const bulkInputRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [s, m] = await Promise.all([
        api.get('/sku', { params: { search } }),
        api.get('/sku/missing'),
      ]);
      setSkus(s.data.skus || s.data || []);
      setMissing(m.data.missing || m.data || []);
    } catch (err) {
      showToast('Failed to load SKUs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const t = setTimeout(loadData, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  const handleSaveMissing = async (skuId) => {
    const price = missingPrices[skuId];
    if (!price || isNaN(parseFloat(price))) {
      showToast('Enter a valid price', 'error');
      return;
    }
    try {
      setSaving(true);
      await api.post('/sku', { skuId, purchasePrice: parseFloat(price) });
      showToast(`Saved ${skuId} • profits recalculated`);
      setMissingPrices((p) => {
        const c = { ...p };
        delete c[skuId];
        return c;
      });
      await loadData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSku = async (e) => {
    e.preventDefault();
    if (!newSku.skuId || !newSku.purchasePrice) {
      showToast('Fill both fields', 'error');
      return;
    }
    try {
      setSaving(true);
      await api.post('/sku', {
        skuId: newSku.skuId.trim(),
        purchasePrice: parseFloat(newSku.purchasePrice),
      });
      showToast('SKU saved • profits recalculated');
      setNewSku({ skuId: '', purchasePrice: '' });
      await loadData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (sku) => {
    setEditingId(sku.id);
    setEditPrice(sku.purchasePrice.toString());
  };

  const handleSaveEdit = async (id) => {
    try {
      await api.put(`/sku/${id}`, { purchasePrice: parseFloat(editPrice) });
      showToast('Updated • profits recalculated');
      setEditingId(null);
      await loadData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Update failed', 'error');
    }
  };

  const handleDelete = async (id, skuId) => {
    if (!window.confirm(`Delete SKU "${skuId}"? Profits for linked orders will be cleared.`)) return;
    try {
      await api.delete(`/sku/${id}`);
      showToast('SKU deleted');
      await loadData();
    } catch (err) {
      showToast('Delete failed', 'error');
    }
  };

  const downloadSample = () => {
    const csv = 'SKU_ID,Purchase_Price\nSAMPLE-SKU-001,250.00\nSAMPLE-SKU-002,150.50\nSAMPLE-SKU-003,499.00\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'profx-sku-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      setSaving(true);
      const res = await api.post('/sku/bulk', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const created = res.data.created ?? 0;
      const updated = res.data.updated ?? 0;
      showToast(`Bulk upload: ${created} created, ${updated} updated`);
      await loadData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Bulk upload failed', 'error');
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  };

  const exportMissing = async () => {
    try {
      const res = await api.get('/sku/missing/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'profx-missing-skus.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast('Export failed', 'error');
    }
  };

  return (
    <div className="sku-page">
        <div className="sku-header">
          <div>
            <h1>SKU Pricing</h1>
            <p>Set purchase prices to calculate accurate profit per order</p>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-secondary"
              onClick={downloadSample}
              title="Download a sample CSV showing the correct format"
            >
              📄 Sample CSV
            </button>
            <input
              ref={bulkInputRef}
              type="file"
              accept=".csv"
              onChange={handleBulkUpload}
              style={{ display: 'none' }}
            />
            <button
              className="btn btn-secondary"
              onClick={() => bulkInputRef.current?.click()}
              disabled={saving}
            >
              📤 Bulk Upload CSV
            </button>
          </div>
        </div>

        {missing.length > 0 && (
          <div className="missing-alert">
            <div className="missing-header">
              <span className="pulse-dot"></span>
              <h2>
                {missing.length} SKU{missing.length > 1 ? 's' : ''} need purchase price
              </h2>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={exportMissing}
                title="Download an Excel file with all missing SKUs — fill in prices and re-upload via Bulk Upload"
              >
                📥 Export Missing SKUs
              </button>
            </div>
            <p className="missing-sub">
              These SKUs appear in your orders but have no purchase price. Profit cannot be
              calculated until you set them.
            </p>
            <div className="missing-list">
              {missing.map((skuId) => (
                <div key={skuId} className="missing-row">
                  <span className="missing-skuid mono">{skuId}</span>
                  <div className="missing-input-wrap">
                    <span className="rupee">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Purchase price"
                      value={missingPrices[skuId] || ''}
                      onChange={(e) =>
                        setMissingPrices((p) => ({ ...p, [skuId]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveMissing(skuId);
                      }}
                    />
                  </div>
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleSaveMissing(skuId)}
                    disabled={saving}
                  >
                    ✓ Save Price
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card add-card">
          <h2>Add or update SKU manually</h2>
          <form onSubmit={handleAddSku} className="add-form">
            <div className="form-group">
              <label>SKU ID</label>
              <input
                type="text"
                placeholder="e.g. FLP-SKU-12345"
                value={newSku.skuId}
                onChange={(e) => setNewSku({ ...newSku, skuId: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Purchase Price (₹)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={newSku.purchasePrice}
                onChange={(e) => setNewSku({ ...newSku, purchasePrice: e.target.value })}
              />
            </div>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save SKU'}
            </button>
          </form>
        </div>

        <div className="card sku-list-card">
          <div className="list-header">
            <h2>All SKUs ({skus.length})</h2>
            <input
              type="text"
              placeholder="Search SKU ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>

          {loading ? (
            <div className="loading-row">
              <div className="spinner"></div>
              <span>Loading SKUs...</span>
            </div>
          ) : skus.length === 0 ? (
            <div className="empty-state">
              <h3>No SKUs yet</h3>
              <p>Add SKUs above or upload pickup reports to detect them automatically.</p>
            </div>
          ) : (
            <table className="sku-table">
              <thead>
                <tr>
                  <th>SKU ID</th>
                  <th>Purchase Price</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {skus.map((sku) => (
                  <tr key={sku.id}>
                    <td className="mono">{sku.skuId}</td>
                    <td>
                      {editingId === sku.id ? (
                        <div className="edit-wrap">
                          <span className="rupee">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <span className="price-cell">₹{Number(sku.purchasePrice).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="muted">
                      {new Date(sku.createdAt).toLocaleDateString('en-IN')}
                    </td>
                    <td>
                      {editingId === sku.id ? (
                        <>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleSaveEdit(sku.id)}
                          >
                            Save
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingId(null)}
                            style={{ marginLeft: 6 }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleEdit(sku)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(sku.id, sku.skuId)}
                            style={{ marginLeft: 6 }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {toast && (
          <div className={`toast toast-${toast.type}`}>
            {toast.msg}
          </div>
        )}
      </div>
  );
}
