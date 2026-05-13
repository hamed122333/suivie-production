/**
 * Upload Zone Component
 * Drag & drop or click to upload image
 */

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import './UploadZone.css';

export default function UploadZone({ onUpload, loading, preview }) {
  const onDrop = useCallback(
    (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        onUpload(acceptedFiles[0]);
      }
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.tiff'],
    },
    disabled: loading,
    multiple: false,
  });

  return (
    <div className="upload-zone">
      <div
        {...getRootProps()}
        className={`upload-dropzone ${isDragActive ? 'active' : ''} ${
          loading ? 'loading' : ''
        }`}
      >
        <input {...getInputProps()} />

        {loading ? (
          <div className="upload-loading">
            <div className="spinner"></div>
            <p>Processing image...</p>
          </div>
        ) : (
          <>
            <div className="upload-icon">📸</div>
            <h3>Drop image here or click to select</h3>
            <p>Supported formats: JPG, PNG, WebP, TIFF</p>
            <div className="upload-hint">
              {isDragActive
                ? '✓ Release to upload'
                : '💡 Works best with clear, well-lit labels'}
            </div>
          </>
        )}
      </div>

      {preview && !loading && (
        <div className="preview-section">
          <h4>Preview</h4>
          <img src={preview} alt="Preview" className="preview-image" />
        </div>
      )}
    </div>
  );
}
