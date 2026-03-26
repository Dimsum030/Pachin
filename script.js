const { Engine, Render, Runner, Bodies, Composite, Events, Body, Vector, Vertices } = Matter;

// Game Configuration
const config = {
    width: 500,
    height: 800,
    ballRadius: 7,
    pinRadius: 3,
    initialBalls: 10,
    winReward: 5,
    maxChargeTime: 1500,
    minForceY: -0.005,
    maxForceY: -0.025,
    numGates: 10,
    gateWidth: 40
};

// State
let ballCount = config.initialBalls;
let activeBalls = [];
let isGameOver = false;
let chargeStartTime = 0;
let isCharging = false;
let isLightStopped = false;
let activeGateIndex = 0;
let lightIndex = 0;
let lightDirection = 1;
let lastLightUpdate = 0;

// Matter.js Setup
const engine = Engine.create();
const world = engine.world;
const canvas = document.getElementById('pachinko-canvas');

const render = Render.create({
    canvas: canvas,
    engine: engine,
    options: {
        width: config.width,
        height: config.height,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio || 1
    }
});

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

// UI Elements
const ballCountDisplay = document.getElementById('ball-count');
const statusMsg = document.getElementById('status-msg');
const gameOverOverlay = document.getElementById('game-over-overlay');
const shootBtn = document.getElementById('shoot-btn');
const stopLightBtn = document.getElementById('stop-light-btn');
const chargeContainer = document.getElementById('charge-container');
const chargeBar = document.getElementById('charge-bar');

// Create Board
function createBoard() {
    // Thicker walls
    const walls = [
        Bodies.rectangle(-50, config.height / 2, 100, config.height + 200, { isStatic: true, render: { fillStyle: '#00ffff', opacity: 0.1 } }), // Left
        Bodies.rectangle(config.width + 50, config.height / 2, 100, config.height + 200, { isStatic: true, render: { fillStyle: '#00ffff', opacity: 0.1 } }) // Right
    ];
    Composite.add(world, walls);

    // 1. Expanded Top Arch (Blue Neon) - Overlapping edges to ensure no gaps
    const archSegments = 100;
    const archRadiusX = config.width / 2 + 10; // Slightly wider than canvas
    const archRadiusY = 220; // Slightly taller
    const centerX = config.width / 2;
    const centerY = 240; // Adjusted to fit the top

    for (let i = 0; i <= archSegments; i++) {
        const angle = Math.PI + (i / archSegments) * Math.PI;
        const x = centerX + Math.cos(angle) * archRadiusX;
        const y = centerY + Math.sin(angle) * archRadiusY;
        
        const segment = Bodies.rectangle(x, y, 12, 8, {
            isStatic: true,
            angle: angle + Math.PI / 2,
            friction: 0,
            restitution: 0.8,
            render: { fillStyle: '#00ffff', strokeStyle: '#00ffff', lineWidth: 1 }
        });
        Composite.add(world, segment);
    }

    // 2. Launch Rail (Right side) - Moved closer to edge
    const railX = config.width - 20;
    const rail = Bodies.rectangle(railX, config.height / 2 + 150, 4, config.height - 300, {
        isStatic: true,
        render: { fillStyle: '#00ffff', strokeStyle: '#00ffff', lineWidth: 2 }
    });
    Composite.add(world, rail);

    // 3. Expanded Pin Area - Filling the space
    const pinAreaWidth = 440;
    const pinAreaHeight = 400;
    const pinAreaX = (config.width - pinAreaWidth) / 2 + 10;
    const pinAreaY = 220;
    const pinSpacingX = 40;
    const pinSpacingY = 35;
    const rows = Math.floor(pinAreaHeight / pinSpacingY);
    const cols = Math.floor(pinAreaWidth / pinSpacingX);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = pinAreaX + (c * pinSpacingX) + (r % 2 === 0 ? 0 : pinSpacingX / 2);
            const y = pinAreaY + (r * pinSpacingY);
            
            // Only add pins if they are not too close to the right rail
            if (x < railX - 20) {
                const pin = Bodies.circle(x, y, config.pinRadius, { 
                    isStatic: true, 
                    render: { fillStyle: '#00ff00', strokeStyle: '#00ff00', lineWidth: 1 } 
                });
                Composite.add(world, pin);
            }
        }
    }

    // 4. Bottom Gates
    const startX = (config.width - (config.numGates * config.gateWidth)) / 2 - 20;
    for (let i = 0; i < config.numGates; i++) {
        const x = startX + (i * config.gateWidth) + config.gateWidth / 2;
        
        const divider = Bodies.rectangle(x - config.gateWidth / 2, config.height - 60, 2, 80, {
            isStatic: true,
            render: { fillStyle: '#00ffff' }
        });
        Composite.add(world, divider);

        const gate = Bodies.rectangle(x, config.height - 40, config.gateWidth - 10, 20, {
            isStatic: true,
            isSensor: true,
            label: `gate_${i}`,
            render: { fillStyle: 'transparent' }
        });
        Composite.add(world, gate);

        if (i === config.numGates - 1) {
            const lastDivider = Bodies.rectangle(x + config.gateWidth / 2, config.height - 60, 2, 80, {
                isStatic: true,
                render: { fillStyle: '#00ffff' }
            });
            Composite.add(world, lastDivider);
        }
    }
}

// Light Bouncing Logic
function updateLight(time) {
    if (isLightStopped) return;

    if (time - lastLightUpdate > 100) {
        lightIndex += lightDirection;
        if (lightIndex >= config.numGates - 1 || lightIndex <= 0) {
            lightDirection *= -1;
        }
        lastLightUpdate = time;
    }
}

// Shooting Logic
function startCharging() {
    if (ballCount <= 0 || isGameOver || isCharging || !isLightStopped) return;
    isCharging = true;
    chargeStartTime = Date.now();
    chargeContainer.style.display = 'block';
    updateChargeBar();
}

function updateChargeBar() {
    if (!isCharging) return;
    const duration = Math.min(Date.now() - chargeStartTime, config.maxChargeTime);
    const percent = (duration / config.maxChargeTime) * 100;
    chargeBar.style.width = `${percent}%`;
    requestAnimationFrame(updateChargeBar);
}

function releaseAndShoot() {
    if (!isCharging) return;
    
    const duration = Math.min(Date.now() - chargeStartTime, config.maxChargeTime);
    const chargeRatio = duration / config.maxChargeTime;
    
    isCharging = false;
    chargeContainer.style.display = 'none';
    chargeBar.style.width = '0%';

    ballCount--;
    shootBtn.disabled = true;
    statusMsg.innerText = "BALL IN PLAY";
    updateUI();

    const spawnX = config.width - 10;
    const spawnY = config.height - 40;

    const ball = Bodies.circle(spawnX, spawnY, config.ballRadius, {
        restitution: 0.5,
        friction: 0,
        label: 'ball',
        render: { fillStyle: '#ffffff', strokeStyle: '#00ffff', lineWidth: 2 }
    });

    activeBalls.push(ball);
    Composite.add(world, ball);

    const forceY = config.minForceY + (config.maxForceY - config.minForceY) * chargeRatio;
    Body.applyForce(ball, ball.position, { x: 0, y: forceY });
}

function stopLight() {
    if (isLightStopped || isGameOver || activeBalls.length > 0) return;
    isLightStopped = true;
    activeGateIndex = lightIndex;
    shootBtn.disabled = false;
    statusMsg.innerText = "READY";
}

// Collision Handling
Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        const ball = bodyA.label === 'ball' ? bodyA : (bodyB.label === 'ball' ? bodyB : null);
        const gate = bodyA.label.startsWith('gate_') ? bodyA : (bodyB.label.startsWith('gate_') ? bodyB : null);
        
        if (ball && gate) {
            const gateIdx = parseInt(gate.label.split('_')[1]);
            if (gateIdx === activeGateIndex) {
                ballCount += config.winReward;
            }
            removeBall(ball);
            updateUI();
        }
    });
});

function removeBall(ball) {
    Composite.remove(world, ball);
    activeBalls = activeBalls.filter(b => b !== ball);
    
    if (activeBalls.length === 0 && !isGameOver) {
        isLightStopped = false;
        shootBtn.disabled = true;
        statusMsg.innerText = "STOP LIGHT";
    }
}

function updateUI() {
    ballCountDisplay.innerText = ballCount;
}

// Game Loop Check
Events.on(engine, 'afterUpdate', () => {
    const time = Date.now();
    updateLight(time);

    // Update gate visuals
    const bodies = Composite.allBodies(world);
    bodies.forEach(body => {
        if (body.label.startsWith('gate_')) {
            const idx = parseInt(body.label.split('_')[1]);
            if (idx === (isLightStopped ? activeGateIndex : lightIndex)) {
                body.render.fillStyle = '#ccff00';
                body.render.opacity = 0.8;
            } else {
                body.render.fillStyle = 'transparent';
                body.render.opacity = 0.1;
            }
        }
    });

    for (let i = activeBalls.length - 1; i >= 0; i--) {
        const ball = activeBalls[i];
        if (ball.position.y > config.height + 50) {
            removeBall(ball);
            updateUI();
        }
    }

    if (ballCount === 0 && activeBalls.length === 0 && !isGameOver) {
        isGameOver = true;
        gameOverOverlay.classList.add('visible');
    }
});

// Event Listeners
shootBtn.addEventListener('mousedown', startCharging);
shootBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startCharging(); });
window.addEventListener('mouseup', releaseAndShoot);
window.addEventListener('touchend', releaseAndShoot);

stopLightBtn.addEventListener('click', stopLight);

// Initialize
createBoard();
updateUI();
console.log("Pachin Cyber Edition updated!");
