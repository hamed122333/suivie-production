/**
 * Webcam Capture Component
 * Capture images directly from device camera
 */

import React, { useRef, useState } from 'react';
import Webcam from 'react-webcam';
import './WebcamCapture.css';

export default function WebcamCapture({ onCapture, loading }) {
  const webcamRef = useRef(null);
  const [facingMode, setFacingMode] = useState('environment'); // user = front, environment = back
  const [capturedImage, setCapturedImage] = useState(null);

  const handleCapture = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setCapturedImage(imageSrc);
        onCapture(imageSrc);
      }
    }
  };

  const toggleCamera = () => {
    setFacingMode(facingMode === 'environment' ? 'user' : 'environment');
    setCapturedImage(null);
  };

  const retake = () => {
    setCapturedImage(null);
  };

  return (
    <div className="webcam-capture">
      {!capturedImage ? (
        <div className="webcam-container">
          <Webcam
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              facingMode,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }}
            className="webcam-feed"
          />

          <div className="webcam-overlay">
            <div className="focus-box">
              <span className="corner corner-tl"></span>
              <span className="corner corner-tr"></span>
              <span className="corner corner-bl"></span>
              <span className="corner corner-br"></span>
              <p>Position label in frame</p>
            </div>
          </div>

          <div className="webcam-controls">
            <button
              className="btn-capture"
              onClick={handleCapture}
              disabled={loading}
            >
              📷 Capture
            </button>
            <button
              className="btn-toggle"
              onClick={toggleCamera}
              disabled={loading}
            >
              🔄 Switch Camera
            </button>
          </div>
        </div>
      ) : (
        <div className="capture-preview">
          <img src={capturedImage} alt="Captured" className="captured-image" />
          <div className="preview-actions">
            <button
              className="btn btn-primary"
              onClick={() => onCapture(capturedImage)}
              disabled={loading}
            >
              ✓ Use This Image
            </button>
            <button
              className="btn btn-outline"
              onClick={retake}
              disabled={loading}
            >
              ↻ Retake
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
