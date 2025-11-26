/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef } from 'react';
import { Hero } from './components/Hero';
import { InputArea } from './components/InputArea';
import { LivePreview } from './components/LivePreview';
import { CreationHistory, Creation } from './components/CreationHistory';
import { bringToLife } from './services/gemini';
import { ArrowUpTrayIcon } from '@heroicons/react/24/solid';

const FIELD_HOCKEY_GAME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Field Hockey Arena</title>
    <style>
        body { 
            margin: 0; 
            background: #18181b; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            font-family: 'Segoe UI', system-ui, sans-serif; 
            color: #fafafa;
            overflow: hidden;
        }
        #game-container {
            position: relative;
            box-shadow: 0 0 50px rgba(0,0,0,0.5);
            border-radius: 8px;
            overflow: hidden;
            border: 4px solid #3f3f46;
        }
        canvas { 
            background: #15803d; /* green-700 */
            display: block;
        }
        .ui-panel {
            width: 800px;
            background: #27272a;
            padding: 12px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-sizing: border-box;
            border-bottom: 2px solid #3f3f46;
        }
        .score-box {
            font-size: 24px;
            font-weight: 800;
            font-variant-numeric: tabular-nums;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .team-blue { color: #60a5fa; }
        .team-red { color: #f87171; }
        .timer {
            background: #000;
            color: #fbbf24;
            padding: 4px 12px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 20px;
            border: 1px solid #454545;
        }
        .controls {
            margin-top: 16px;
            font-size: 14px;
            color: #a1a1aa;
            display: flex;
            gap: 24px;
            background: #27272a;
            padding: 8px 16px;
            border-radius: 99px;
            border: 1px solid #3f3f46;
        }
        .key {
            background: #3f3f46;
            color: #fff;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 12px;
            box-shadow: 0 2px 0 #18181b;
        }
        #overlay {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            pointer-events: none;
            z-index: 10;
        }
        #message {
            font-size: 64px;
            font-weight: 900;
            text-shadow: 0 4px 12px rgba(0,0,0,0.5);
            opacity: 0;
            transition: opacity 0.3s;
            white-space: nowrap;
        }
        #countdown {
            font-size: 48px;
            font-weight: bold;
            color: white;
            text-shadow: 0 2px 4px rgba(0,0,0,0.8);
            margin-top: 10px;
            opacity: 0;
        }
        .btn {
            background: #2563eb;
            color: white;
            border: none;
            padding: 6px 16px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn:hover { background: #1d4ed8; }
    </style>
</head>
<body>

    <div class="ui-panel">
        <div class="score-box team-blue">
            <span>BLUE</span>
            <span id="scoreBlue" style="font-size:32px">0</span>
        </div>
        <div class="timer" id="timer">00:00</div>
        <div class="score-box team-red">
            <span id="scoreRed" style="font-size:32px">0</span>
            <span>RED</span>
        </div>
    </div>

    <div id="game-container">
        <canvas id="gameCanvas" width="800" height="500"></canvas>
        <div id="overlay">
            <div id="message">GOAL!</div>
            <div id="countdown">3</div>
        </div>
    </div>

    <div class="controls">
        <span><span class="key">ARROWS</span> Move & Aim</span>
        <span><span class="key">SPACE</span> Hit</span>
        <span><span class="key">SHIFT</span> Push</span>
        <button class="btn" onclick="game.resetMatch()">Reset Match</button>
    </div>

    <script>
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const msgEl = document.getElementById('message');
        const countEl = document.getElementById('countdown');

        const CONFIG = {
            friction: 0.97,
            playerSpeed: 4,
            aiSpeed: 2.2, // Reduced for fairness
            ballDamping: 0.6,
            canvasW: 800,
            canvasH: 500,
            goalTop: 215,
            goalBottom: 285,
            ballRadius: 10
        };

        class Game {
            constructor() {
                this.scores = { blue: 0, red: 0 };
                this.time = 0;
                this.active = true;
                this.keys = {};
                this.roundStartTime = Date.now();
                
                this.ball = { x: 400, y: 250, vx: 0, vy: 0, r: CONFIG.ballRadius };
                
                // Teams
                this.players = [
                    // User (Blue) - Starts Left
                    { x: 300, y: 250, r: 14, color: '#60a5fa', team: 'blue', isAi: false, facing: 0 },
                    // Blue Goalie (AI)
                    { x: 40, y: 250, r: 14, color: '#60a5fa', team: 'blue', isAi: true, role: 'goalie', facing: 0 },
                    
                    // Red Goalie (AI)
                    { x: 760, y: 250, r: 14, color: '#f87171', team: 'red', isAi: true, role: 'goalie', facing: Math.PI },
                    // Red Attackers (AI)
                    { x: 550, y: 180, r: 14, color: '#f87171', team: 'red', isAi: true, role: 'attacker', facing: Math.PI },
                    { x: 550, y: 320, r: 14, color: '#f87171', team: 'red', isAi: true, role: 'attacker', facing: Math.PI }
                ];

                this.bindInput();
                this.lastTime = Date.now();
                this.loop = this.loop.bind(this);
                requestAnimationFrame(this.loop);
            }

            bindInput() {
                window.addEventListener('keydown', e => {
                    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
                    this.keys[e.code] = true;
                });
                window.addEventListener('keyup', e => this.keys[e.code] = false);
            }

            resetMatch() {
                this.scores = { blue: 0, red: 0 };
                this.updateScoreboard();
                this.resetPositions("MATCH START", "#fff");
                this.time = 0;
            }

            resetPositions(msgText, msgColor) {
                // Stop everything
                this.ball.vx = 0; 
                this.ball.vy = 0;
                this.ball.x = 400; 
                this.ball.y = 250;

                // Reset Players
                this.players[0].x = 300; this.players[0].y = 250; // User
                this.players[1].x = 40;  this.players[1].y = 250; // Blue Goalie
                this.players[2].x = 760; this.players[2].y = 250; // Red Goalie
                this.players[3].x = 550; this.players[3].y = 180; // Red Attacker 1
                this.players[4].x = 550; this.players[4].y = 320; // Red Attacker 2

                this.roundStartTime = Date.now() + 500; // Small buffer before countdown logic starts

                if (msgText) {
                    this.showMessage(msgText, msgColor);
                }
            }

            showMessage(text, color) {
                msgEl.innerText = text;
                msgEl.style.color = color;
                msgEl.style.opacity = 1;
                setTimeout(() => msgEl.style.opacity = 0, 2500);
            }

            update() {
                // Round Delay Logic
                const timeSinceReset = Date.now() - this.roundStartTime;
                if (timeSinceReset < 2000) {
                    // Freeze phase
                    countEl.style.opacity = 1;
                    if (timeSinceReset < 500) countEl.innerText = "READY";
                    else if (timeSinceReset < 1000) countEl.innerText = "SET";
                    else countEl.innerText = "PLAY!";
                    return; // Skip physics
                } else {
                    countEl.style.opacity = 0;
                }

                // Game Timer
                const now = Date.now();
                if (now - this.lastTime > 1000) {
                    this.time++;
                    this.lastTime = now;
                    const mins = Math.floor(this.time / 60).toString().padStart(2, '0');
                    const secs = (this.time % 60).toString().padStart(2, '0');
                    document.getElementById('timer').innerText = \`\${mins}:\${secs}\`;
                }

                // User Input
                const p1 = this.players[0];
                let moveX = 0;
                let moveY = 0;

                if (this.keys['ArrowUp']) moveY = -1;
                if (this.keys['ArrowDown']) moveY = 1;
                if (this.keys['ArrowLeft']) moveX = -1;
                if (this.keys['ArrowRight']) moveX = 1;

                // Normalize diagonal speed
                if (moveX !== 0 || moveY !== 0) {
                    const len = Math.sqrt(moveX*moveX + moveY*moveY);
                    moveX /= len;
                    moveY /= len;
                    
                    p1.x += moveX * CONFIG.playerSpeed;
                    p1.y += moveY * CONFIG.playerSpeed;
                    
                    // Update facing direction based on movement
                    p1.facing = Math.atan2(moveY, moveX);
                }

                // AI Logic
                this.players.forEach(p => {
                    if (!p.isAi) return;
                    
                    let targetX = this.ball.x;
                    let targetY = this.ball.y;
                    let speed = CONFIG.aiSpeed;

                    if (p.role === 'goalie') {
                        // Goalie Logic
                        const goalX = p.team === 'blue' ? 40 : 760;
                        targetX = goalX;
                        
                        // Track ball Y but stay in goal box
                        targetY = Math.max(CONFIG.goalTop - 20, Math.min(CONFIG.goalBottom + 20, this.ball.y));
                        
                        // Rush if ball is very close to goal
                        const dangerZone = p.team === 'blue' ? (this.ball.x < 150) : (this.ball.x > 650);
                        if (dangerZone) {
                             targetX = this.ball.x;
                             targetY = this.ball.y;
                             speed *= 1.2; // Sprint
                        }
                    } else {
                        // Attacker Logic
                        // Red attacks Left (Blue Goal)
                        // Simple formation: One goes for ball, one supports
                        if (this.ball.x > p.x - 50) {
                             // Ball is ahead/near, chase it
                             targetX = this.ball.x;
                             targetY = this.ball.y;
                        } else {
                             // Ball is behind, retreat but stay somewhat forward
                             targetX = this.ball.x + (p.team === 'red' ? 100 : -100);
                             targetY = this.ball.y;
                        }
                    }

                    const dx = targetX - p.x;
                    const dy = targetY - p.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    
                    // Move AI
                    if (dist > 5) {
                        p.x += (dx / dist) * speed;
                        p.y += (dy / dist) * speed;
                        
                        // AI Face direction of movement
                        p.facing = Math.atan2(dy, dx);
                    }

                    // AI Shoot
                    if (p.role !== 'goalie' && dist < 30) {
                         // Aim at opposite goal
                         const goalTargetX = p.team === 'red' ? 0 : 800;
                         const goalTargetY = 250 + (Math.random() * 50 - 25); // Slight variance
                         
                         const angleToGoal = Math.atan2(goalTargetY - p.y, goalTargetX - p.x);
                         
                         // Check if facing roughly towards goal
                         if (Math.abs(p.facing - angleToGoal) < 1.5) {
                             // Hit the ball
                             if (Math.random() < 0.03) {
                                 this.hitBall(p, angleToGoal, 9);
                             }
                         }
                    }
                });

                // Physics & Collision
                this.players.forEach(p => {
                    // Bounds
                    p.x = Math.max(p.r + 5, Math.min(CONFIG.canvasW - p.r - 5, p.x));
                    p.y = Math.max(p.r + 5, Math.min(CONFIG.canvasH - p.r - 5, p.y));

                    // Ball Collision (Dribbling)
                    const dx = this.ball.x - p.x;
                    const dy = this.ball.y - p.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const touchDist = p.r + this.ball.r;

                    if (dist < touchDist) {
                        // Push ball out of player
                        const angle = Math.atan2(dy, dx);
                        const push = (touchDist - dist) + 1;
                        this.ball.x += Math.cos(angle) * push;
                        this.ball.y += Math.sin(angle) * push;

                        // USER SHOOTING CONTROL
                        if (!p.isAi && this.keys['Space']) {
                            // Powerful hit in FACING direction
                            this.hitBall(p, p.facing, 14);
                        } 
                        else if (!p.isAi && (this.keys['ShiftLeft'] || this.keys['ShiftRight'])) {
                             // Push pass
                             this.hitBall(p, p.facing, 8);
                        }
                        else {
                            // Dribble nudge
                            this.ball.vx += Math.cos(angle) * 1.5;
                            this.ball.vy += Math.sin(angle) * 1.5;
                        }
                    }
                });

                // Ball Physics
                this.ball.x += this.ball.vx;
                this.ball.y += this.ball.vy;
                this.ball.vx *= CONFIG.friction;
                this.ball.vy *= CONFIG.friction;

                // Wall Bounces
                if (this.ball.y < this.ball.r) { this.ball.y = this.ball.r; this.ball.vy *= -0.8; }
                if (this.ball.y > CONFIG.canvasH - this.ball.r) { this.ball.y = CONFIG.canvasH - this.ball.r; this.ball.vy *= -0.8; }
                // Side walls (not goal)
                if ((this.ball.y < CONFIG.goalTop || this.ball.y > CONFIG.goalBottom)) {
                    if (this.ball.x < this.ball.r) { this.ball.x = this.ball.r; this.ball.vx *= -0.8; }
                    if (this.ball.x > CONFIG.canvasW - this.ball.r) { this.ball.x = CONFIG.canvasW - this.ball.r; this.ball.vx *= -0.8; }
                }

                // Goal Scoring
                if (this.ball.x < -10) {
                    this.scores.red++;
                    this.showMessage("RED SCORES!", "#f87171");
                    this.updateScoreboard();
                    this.resetPositions();
                } else if (this.ball.x > CONFIG.canvasW + 10) {
                    this.scores.blue++;
                    this.showMessage("BLUE SCORES!", "#60a5fa");
                    this.updateScoreboard();
                    this.resetPositions();
                }
            }

            hitBall(player, angle, force) {
                 this.ball.vx = Math.cos(angle) * force;
                 this.ball.vy = Math.sin(angle) * force;
            }

            updateScoreboard() {
                document.getElementById('scoreBlue').innerText = this.scores.blue;
                document.getElementById('scoreRed').innerText = this.scores.red;
            }

            draw() {
                // Clear
                ctx.fillStyle = '#14532d'; // Darker green
                ctx.fillRect(0, 0, CONFIG.canvasW, CONFIG.canvasH);

                // --- PITCH MARKINGS ---
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.lineWidth = 3;
                
                // Outer Line
                ctx.strokeRect(40, 20, 720, 460); 

                // Center Line
                ctx.beginPath();
                ctx.moveTo(400, 20); ctx.lineTo(400, 480); ctx.stroke();
                
                // 25 yard lines
                ctx.setLineDash([8, 8]);
                ctx.beginPath();
                ctx.moveTo(220, 20); ctx.lineTo(220, 480);
                ctx.moveTo(580, 20); ctx.lineTo(580, 480);
                ctx.stroke();
                ctx.setLineDash([]);

                // Shooting Circles (D-zone)
                ctx.beginPath();
                ctx.arc(40, 250, 200, -Math.PI/2, Math.PI/2);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(760, 250, 200, Math.PI/2, -Math.PI/2);
                ctx.stroke();

                // Penalty spots
                ctx.fillStyle = 'white';
                ctx.beginPath(); ctx.arc(170, 250, 3, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(630, 250, 3, 0, Math.PI*2); ctx.fill();

                // Goals
                ctx.fillStyle = '#09090b';
                ctx.fillRect(0, CONFIG.goalTop, 40, CONFIG.goalBottom - CONFIG.goalTop);
                ctx.fillRect(760, CONFIG.goalTop, 40, CONFIG.goalBottom - CONFIG.goalTop);
                // Goal Nets pattern
                ctx.strokeStyle = '#3f3f46';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for(let i=0; i<40; i+=8) {
                    ctx.moveTo(0+i, CONFIG.goalTop); ctx.lineTo(0+i, CONFIG.goalBottom);
                    ctx.moveTo(760+i, CONFIG.goalTop); ctx.lineTo(760+i, CONFIG.goalBottom);
                }
                ctx.stroke();


                // --- PLAYERS ---
                this.players.forEach(p => {
                    // Body
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
                    ctx.fillStyle = p.color;
                    ctx.fill();
                    
                    // Ring/Outline
                    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Stick Indicator (shows facing direction)
                    const stickX = p.x + Math.cos(p.facing + 0.5) * 16;
                    const stickY = p.y + Math.sin(p.facing + 0.5) * 16;
                    
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(stickX, stickY);
                    ctx.stroke();
                });

                // --- BALL ---
                ctx.beginPath();
                ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI*2);
                ctx.fillStyle = '#fbbf24'; // Amber-400 (Bright Yellow/Orange)
                ctx.fill();
                ctx.strokeStyle = '#b45309'; // Darker outline
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Shine
                ctx.beginPath();
                ctx.arc(this.ball.x - 3, this.ball.y - 3, 3, 0, Math.PI*2);
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.fill();
            }

            loop() {
                this.update();
                this.draw();
                requestAnimationFrame(this.loop);
            }
        }

        const game = new Game();
    </script>
</body>
</html>`;

const App: React.FC = () => {
  const [activeCreation, setActiveCreation] = useState<Creation | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<Creation[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Load history from local storage or fetch examples on mount
  useEffect(() => {
    const initHistory = async () => {
      const saved = localStorage.getItem('gemini_app_history');
      let loadedHistory: Creation[] = [];

      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          loadedHistory = parsed.map((item: any) => ({
              ...item,
              timestamp: new Date(item.timestamp)
          }));
        } catch (e) {
          console.error("Failed to load history", e);
        }
      }

      // Pre-load the Field Hockey Game as requested
      const fieldHockeyDemo: Creation = {
        id: 'field-hockey-demo',
        name: 'Field Hockey Game',
        html: FIELD_HOCKEY_GAME_HTML,
        timestamp: new Date(),
        // Simple SVG icon for the history list
        originalImage: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjBhNWZhIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIiBzdHJva2U9IiMzZjNmNDYiIGZpbGw9IiMxNTgwM2QiLz48cGF0aCBkPSJNOSAxNkwxNSAxNiIgc3Ryb2tlPSJ3aGl0ZSIvPjxwYXRoIGQ9Ik0xMiA4djgiIHN0cm9rZT0id2hpdGUiLz48L3N2Zz4='
      };

      // Ensure Field Hockey is in the history, and if it's a new session, put it first
      const hasHockey = loadedHistory.some(h => h.id === fieldHockeyDemo.id);
      if (!hasHockey) {
        loadedHistory = [fieldHockeyDemo, ...loadedHistory];
        // Automatically open it for the user
        setActiveCreation(fieldHockeyDemo);
      } else {
        // Even if it exists, if there's no other history, open it
        if (loadedHistory.length === 1) setActiveCreation(loadedHistory[0]);
      }

      if (loadedHistory.length <= 1) { // If only hockey (or none), try loading remote examples
        try {
           const exampleUrls = [
               'https://storage.googleapis.com/sideprojects-asronline/bringanythingtolife/vibecode-blog.json',
               'https://storage.googleapis.com/sideprojects-asronline/bringanythingtolife/cassette.json',
               'https://storage.googleapis.com/sideprojects-asronline/bringanythingtolife/chess.json'
           ];

           const examples = await Promise.all(exampleUrls.map(async (url) => {
               const res = await fetch(url);
               if (!res.ok) return null;
               const data = await res.json();
               return {
                   ...data,
                   timestamp: new Date(data.timestamp || Date.now()),
                   id: data.id || crypto.randomUUID()
               };
           }));
           
           const validExamples = examples.filter((e): e is Creation => e !== null);
           // Combine again, ensuring no duplicates
           const existingIds = new Set(loadedHistory.map(h => h.id));
           const newExamples = validExamples.filter(e => !existingIds.has(e.id));
           
           loadedHistory = [...loadedHistory, ...newExamples];
        } catch (e) {
            console.error("Failed to load examples", e);
        }
      }
      
      setHistory(loadedHistory);
    };

    initHistory();
  }, []);

  // Save history when it changes
  useEffect(() => {
    if (history.length > 0) {
        try {
            localStorage.setItem('gemini_app_history', JSON.stringify(history));
        } catch (e) {
            console.warn("Local storage full or error saving history", e);
        }
    }
  }, [history]);

  // Helper to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleGenerate = async (promptText: string, file?: File) => {
    setIsGenerating(true);
    // Clear active creation to show loading state
    setActiveCreation(null);

    try {
      let imageBase64: string | undefined;
      let mimeType: string | undefined;

      if (file) {
        imageBase64 = await fileToBase64(file);
        mimeType = file.type.toLowerCase();
      }

      const html = await bringToLife(promptText, imageBase64, mimeType);
      
      if (html) {
        const newCreation: Creation = {
          id: crypto.randomUUID(),
          name: file ? file.name : 'New Creation',
          html: html,
          // Store the full data URL for easy display
          originalImage: imageBase64 && mimeType ? `data:${mimeType};base64,${imageBase64}` : undefined,
          timestamp: new Date(),
        };
        setActiveCreation(newCreation);
        setHistory(prev => [newCreation, ...prev]);
      }

    } catch (error) {
      console.error("Failed to generate:", error);
      alert("Something went wrong while bringing your file to life. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setActiveCreation(null);
    setIsGenerating(false);
  };

  const handleSelectCreation = (creation: Creation) => {
    setActiveCreation(creation);
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = event.target?.result as string;
            const parsed = JSON.parse(json);
            
            // Basic validation
            if (parsed.html && parsed.name) {
                const importedCreation: Creation = {
                    ...parsed,
                    timestamp: new Date(parsed.timestamp || Date.now()),
                    id: parsed.id || crypto.randomUUID()
                };
                
                // Add to history if not already there (by ID check)
                setHistory(prev => {
                    const exists = prev.some(c => c.id === importedCreation.id);
                    return exists ? prev : [importedCreation, ...prev];
                });

                // Set as active immediately
                setActiveCreation(importedCreation);
            } else {
                alert("Invalid creation file format.");
            }
        } catch (err) {
            console.error("Import error", err);
            alert("Failed to import creation.");
        }
        // Reset input
        if (importInputRef.current) importInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const isFocused = !!activeCreation || isGenerating;

  return (
    <div className="h-[100dvh] bg-zinc-950 bg-dot-grid text-zinc-50 selection:bg-blue-500/30 overflow-y-auto overflow-x-hidden relative flex flex-col">
      
      {/* Centered Content Container */}
      <div 
        className={`
          min-h-full flex flex-col w-full max-w-7xl mx-auto px-4 sm:px-6 relative z-10 
          transition-all duration-700 cubic-bezier(0.4, 0, 0.2, 1)
          ${isFocused 
            ? 'opacity-0 scale-95 blur-sm pointer-events-none h-[100dvh] overflow-hidden' 
            : 'opacity-100 scale-100 blur-0'
          }
        `}
      >
        {/* Main Vertical Centering Wrapper */}
        <div className="flex-1 flex flex-col justify-center items-center w-full py-12 md:py-20">
          
          {/* 1. Hero Section */}
          <div className="w-full mb-8 md:mb-16">
              <Hero />
          </div>

          {/* 2. Input Section */}
          <div className="w-full flex justify-center mb-8">
              <InputArea onGenerate={handleGenerate} isGenerating={isGenerating} disabled={isFocused} />
          </div>

        </div>
        
        {/* 3. History Section & Footer - Stays at bottom */}
        <div className="flex-shrink-0 pb-6 w-full mt-auto flex flex-col items-center gap-6">
            <div className="w-full px-2 md:px-0">
                <CreationHistory history={history} onSelect={handleSelectCreation} />
            </div>
            
            <a 
              href="https://x.com/ammaar" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-zinc-600 hover:text-zinc-400 text-xs font-mono transition-colors pb-2"
            >
              Created by @ammaar
            </a>
        </div>
      </div>

      {/* Live Preview - Always mounted for smooth transition */}
      <LivePreview
        creation={activeCreation}
        isLoading={isGenerating}
        isFocused={isFocused}
        onReset={handleReset}
      />

      {/* Subtle Import Button (Bottom Right) */}
      <div className="fixed bottom-4 right-4 z-50">
        <button 
            onClick={handleImportClick}
            className="flex items-center space-x-2 p-2 text-zinc-500 hover:text-zinc-300 transition-colors opacity-60 hover:opacity-100"
            title="Import Artifact"
        >
            <span className="text-xs font-medium uppercase tracking-wider hidden sm:inline">Upload previous artifact</span>
            <ArrowUpTrayIcon className="w-5 h-5" />
        </button>
        <input 
            type="file" 
            ref={importInputRef} 
            onChange={handleImportFile} 
            accept=".json" 
            className="hidden" 
        />
      </div>
    </div>
  );
};

export default App;