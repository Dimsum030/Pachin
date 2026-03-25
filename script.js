const { Engine, Render, Runner, Bodies, Composite, Events, Body, Vector } = Matter;

// Game Configuration
const config = {
    width: 500, // Narrower like the real machine
    height: 800,
    ballRadius: 7,
    pinRadius: 3,
    initialBalls: 10,
    winReward: 5,
    maxChargeTime: 1500,
    minForce: { x: -0.001, y: -0.005 },
    maxForce: { x: -0.008, y: -0.022 },
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
        background: '#111',
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
        Bodies.rectangle(-50, config.height / 2, 100, config.height + 200, { isStatic: true, render: { fillStyle: '#333' } }), // Left
        Bodies.rectangle(config.width + 50, config.height / 2, 100, config.height + 200, { isStatic: true, render: { fillStyle: '#333' } }) // Right
    ];
    Composite.add(world, walls);

    // Smooth Top Arch (Yellow) - Increased segments for smoothness
    const archSegments = 60;
    const archRadius = config.width / 2 - 5;
    for (let i = 0; i <= archSegments; i++) {
        const angle = Math.PI + (i / archSegments) * Math.PI;
        const x = config.width / 2 + Math.cos(angle) * archRadius;
        const y = 140 + Math.sin(angle) * 100;
        const segment = Bodies.rectangle(x, y, 15, 10, {
            isStatic: true,
            angle: angle + Math.PI / 2,
            render: { fillStyle: '#ffcc00' }
        });
        Composite.add(world, segment);
    }

    // Launch Rail (Right side) - Narrowed
    const railX = config.width - 25;
    const rail = Bodies.rectangle(railX, config.height / 2 + 150, 6, config.height - 300, {
        isStatic: true,
        render: { fillStyle: '#555' }
    });
    Composite.add(world, rail);

    // Pins (V-shaped pattern)
    const rows = 12;
    for (let r = 0; r < rows; r++) {
        const cols = 8 - (r % 2);
        const rowWidth = cols * 40;
        const startX = (config.width - rowWidth) / 2 - 20;
        for (let c = 0; c < cols; c++) {
            const x = startX + (c * 40);
            const y = 220 + (r * 35);
            // Add some randomness to pin positions for a more natural feel
            const pin = Bodies.circle(x + (Math.random() * 4 - 2), y, config.pinRadius, { 
                isStatic: true, 
                render: { fillStyle: '#ccc' } 
            });
            Composite.add(world, pin);
        }
    }

    // 10 Gates at the bottom with yellow dividers
    const startX = (config.width - (config.numGates * config.gateWidth)) / 2 - 20;
    for (let i = 0; i < config.numGates; i++) {
        const x = startX + (i * config.gateWidth) + config.gateWidth / 2;
        
        // Yellow Divider
        const divider = Bodies.rectangle(x - config.gateWidth / 2, config.height - 60, 4, 60, {
            isStatic: true,
            render: { fillStyle: '#ffcc00' }
        });
        Composite.add(world, divider);

        // Sensor Gate
        const gate = Bodies.rectangle(x, config.height - 40, config.gateWidth - 10, 20, {
            isStatic: true,
            isSensor: true,
            label: `gate_${i}`,
            render: { fillStyle: '#222', opacity: 0.5 }
        });
        Composite.add(world, gate);

        // Final divider for the last gate
        if (i === config.numGates - 1) {
            const lastDivider = Bodies.rectangle(x + config.gateWidth / 2, config.height - 60, 4, 60, {
                isStatic: true,
                render: { fillStyle: '#ffcc00' }
            });
            Composite.add(world, lastDivider);
        }
    }
}

// Light Bouncing Logic
function updateLight(time) {
    if (isLightStopped) return;

    if (time - lastLightUpdate > 120) {
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
    isLightStopped = false;
    shootBtn.disabled = true;
    statusMsg.innerText = "STOP LIGHT FIRST";
    updateUI();

    const ball = Bodies.circle(config.width - 20, config.height - 40, config.ballRadius, {
        restitution: 0.6,
        friction: 0.001,
        label: 'ball',
        render: { fillStyle: '#eee' }
    });

    activeBalls.push(ball);
    Composite.add(world, ball);

    const forceX = config.minForce.x + (config.maxForce.x - config.minForce.x) * chargeRatio;
    const forceY = config.minForce.y + (config.maxForce.y - config.minForce.y) * chargeRatio;

    Body.applyForce(ball, ball.position, { x: forceX, y: forceY });
}

function stopLight() {
    if (isLightStopped || isGameOver) return;
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
}

function updateUI() {
    ballCountDisplay.innerText = `Balls: ${ballCount}`;
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
                body.render.fillStyle = '#00ff00';
                body.render.opacity = 0.8;
            } else {
                body.render.fillStyle = '#222';
                body.render.opacity = 0.5;
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
console.log("Pachin initialized successfully!");
