/**
 * Bounding Box Viewer
 * Displays image with OCR bounding boxes using react-konva
 */

import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Rect, Text } from 'react-konva';
import './BoundingBoxViewer.css';

export default function BoundingBoxViewer({ imageSrc, candidates = [], visualizations = [] }) {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const imageRef = useRef(new Image());

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      imageRef.current = img;
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Calculate scale to fit container
  useEffect(() => {
    const container = document.querySelector('.bbox-viewer');
    if (container && imageSize.width) {
      const newScale = Math.min(
        container.offsetWidth / imageSize.width,
        container.offsetHeight / imageSize.height
      );
      setScale(newScale);
    }
  }, [imageSize]);

  const getColorByScore = (score) => {
    if (score >= 80) return '#27ae60'; // Green
    if (score >= 60) return '#f39c12'; // Orange
    if (score >= 40) return '#f1c40f'; // Yellow
    return '#e74c3c'; // Red
  };

  return (
    <div className="bbox-viewer">
      <div className="canvas-container">
        {imageSrc && imageSize.width > 0 && (
          <Stage
            width={imageSize.width * scale}
            height={imageSize.height * scale}
            scaleX={scale}
            scaleY={scale}
            className="konva-stage"
          >
            <Layer>
              {/* Background image */}
              <Rect
                x={0}
                y={0}
                width={imageSize.width}
                height={imageSize.height}
                fillPatternImage={imageRef.current}
                fillPatternScaleX={1}
                fillPatternScaleY={1}
              />

              {/* Bounding boxes for candidates */}
              {candidates.slice(0, 5).map((candidate, idx) => {
                if (!candidate.bbox) return null;

                const color = getColorByScore(candidate.score);
                return (
                  <React.Fragment key={`candidate-${idx}`}>
                    <Rect
                      x={candidate.bbox.x0}
                      y={candidate.bbox.y0}
                      width={candidate.bbox.width || candidate.bbox.x1 - candidate.bbox.x0}
                      height={candidate.bbox.height || candidate.bbox.y1 - candidate.bbox.y0}
                      stroke={color}
                      strokeWidth={idx === 0 ? 3 : 2}
                      fill={'transparent'}
                      dash={idx === 0 ? [] : [5, 5]}
                    />

                    {/* Label with code and score */}
                    <Rect
                      x={candidate.bbox.x0}
                      y={candidate.bbox.y0 - 30}
                      width={150}
                      height={25}
                      fill={color}
                      cornerRadius={3}
                    />
                    <Text
                      x={candidate.bbox.x0 + 5}
                      y={candidate.bbox.y0 - 27}
                      text={`${candidate.text} (${Math.round(candidate.score)}%)`}
                      fontSize={12}
                      fontFamily="Arial, sans-serif"
                      fill="white"
                      fontStyle="bold"
                    />
                  </React.Fragment>
                );
              })}
            </Layer>
          </Stage>
        )}
      </div>

      {/* Legend */}
      <div className="bbox-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#27ae60' }}></span>
          <span>Excellent (80+%)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#f39c12' }}></span>
          <span>Good (60-79%)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#f1c40f' }}></span>
          <span>Fair (40-59%)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#e74c3c' }}></span>
          <span>Poor (0-39%)</span>
        </div>
      </div>

      {/* Info box */}
      <div className="bbox-info">
        <p>
          <strong>{candidates.length}</strong> candidates detected
        </p>
        <p className="info-hint">Hover over boxes for details</p>
      </div>
    </div>
  );
}
