/**
 * Scan Preview Component
 * Simple preview of scan image
 */

import React from 'react';

export default function ScanPreview({ imageSrc }) {
  if (!imageSrc) return null;

  return (
    <div style={{ maxWidth: '100%', borderRadius: '8px', overflow: 'hidden' }}>
      <img
        src={imageSrc}
        alt="Scan preview"
        style={{
          width: '100%',
          height: 'auto',
          maxHeight: '500px',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}
