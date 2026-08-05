import React, { useState } from 'react';
import axios from 'axios';

export default function LabelDuplicateChecker() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    setSelectedFiles(Array.from(e.target.files));
    setResult(null);
    setError('');
  };

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) {
      setError('Select at least one label PDF.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append('files', file));

    try {
      const { data } = await axios.post('/api/labels/check', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const downloadCleanPdf = () => {
    if (!result?.cleanPdfBase64) return;
    const byteChars = atob(result.cleanPdfBase64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labels-clean-${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="label-dedup-page">
      <h2>Duplicate Label Checker</h2>
      <p>
        Upload one or more Meesho shipping label sheets. Any order already printed before
        (or repeated across the files you're uploading now) gets flagged and removed from
        the clean sheet you download.
      </p>

      <input type="file" accept="application/pdf" multiple onChange={handleFileChange} />
      {selectedFiles.length > 0 && (
        <p>{selectedFiles.length} file(s) selected</p>
      )}

      <button onClick={handleSubmit} disabled={loading}>
        {loading ? 'Checking...' : 'Check & Generate Clean Sheet'}
      </button>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="result">
          <p>
            {result.totalLabels} label(s) scanned — {result.uniqueLabels} fresh,{' '}
            {result.duplicates.length} flagged.
          </p>

          {result.duplicates.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Reason</th>
                  <th>File</th>
                  <th>Page</th>
                </tr>
              </thead>
              <tbody>
                {result.duplicates.map((d, i) => (
                  <tr key={i}>
                    <td>{d.orderId || '(not found)'}</td>
                    <td>
                      {d.reason === 'already_printed' && 'Already printed earlier'}
                      {d.reason === 'duplicate_in_upload' && 'Duplicate in this upload'}
                      {d.reason === 'order_id_not_found' && 'Could not read order ID — check manually'}
                    </td>
                    <td>{d.fileName}</td>
                    <td>{d.pageNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {result.cleanPdfBase64 && (
            <button onClick={downloadCleanPdf}>Download Clean Sheet</button>
          )}
        </div>
      )}
    </div>
  );
}
