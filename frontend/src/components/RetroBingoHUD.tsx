"use client";

import React from "react";

export function RetroBingoHUD() {
  const leftCells = [
    [1, 2, 3, 4, 5, 6],
    [11, 12, 13, 17, 19, 20],
    [41, 42, 43, 44, 45, 46],
    [41, 62, 63, 64, 55, 60],
    [71, 72, 73, 74, 85, 90],
  ];

  const rightCells = [
    [44, 33, 36, 38, 39, 40],
    [26, 26, 37, 49, 61, 62],
    [61, 53, 57, 58, 59, 60],
    [51, 63, 67, 68, 69, 70],
    [85, 86, 87, 88, 89, 90],
  ];

  return (
    <div className="hg-retro-hud-container">
      <h2 className="hg-retro-hud-tagline">MARK YOUR NUMBERS. MATCH THE CALL. WIN THE HOUSE.</h2>
      
      <div className="hg-retro-hud-board">
        
        {/* Left Grid */}
        <div className="hg-retro-grid">
          {leftCells.flat().map((num, i) => {
            const isHighlight = num === 44 && i === 15;
            return (
              <div key={i} className={`hg-retro-cell ${isHighlight ? 'is-orange' : ''}`}>
                {num}
              </div>
            );
          })}
        </div>

        {/* Center Cage */}
        <div className="hg-retro-cage-area">
          <div className="hg-retro-globe">
            <div className="hg-retro-globe-lines"></div>
            <div className="hg-retro-globe-lines vertical"></div>
            <span className="hg-retro-globe-num">44</span>
          </div>
          <div className="hg-retro-machine">
            <div className="hg-machine-base">
              <div className="hg-machine-btn red"></div>
              <div className="hg-machine-btn green"></div>
              <div className="hg-machine-btn blue"></div>
              <div className="hg-machine-btn yellow"></div>
            </div>
            <div className="hg-machine-stand"></div>
            <div className="hg-machine-handle"></div>
          </div>
        </div>

        {/* Right Grid */}
        <div className="hg-retro-grid">
          {rightCells.flat().map((num, i) => {
            const isOrange = num === 33 && i === 1;
            const isMagenta = (num === 61 && i === 10) || (num === 62 && i === 11);
            return (
              <div key={i} className={`hg-retro-cell ${isOrange ? 'is-orange' : ''} ${isMagenta ? 'is-magenta' : ''}`}>
                {num}
              </div>
            );
          })}
        </div>

      </div>

      {/* Floating Balls */}
      <div className="hg-retro-floating-balls">
        <div className="hg-retro-ball b1"><span>7</span></div>
        <div className="hg-retro-ball b2"><span>27</span></div>
        <div className="hg-retro-ball b3"><span>75</span></div>
        <div className="hg-retro-ball b4"><span>88</span></div>
      </div>
    </div>
  );
}
