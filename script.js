const { Engine, Render, Runner, Bodies, Composite, Events, Body, Vector } = Matter;

// Game Configuration
const config = {
    width: 600,
    height: 800,
    ballRadius: 8,
    pinRadius: 4,
    pinSpacing: 40,
    initialBalls: 10,
    winReward: 3,
    maxChargeTime: 1500, // 1.5 seconds for max power
    minForce: { x: -0.005, y: -0.015 },
    maxForce: { x: -0.035, y: -0.075 }
};

// State
let ballCount = config.initialBalls;
let activeBalls = [];
let isGameOver = false;
let chargeStartTime = 0;
let isCharging = false;

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
const chargeContainer = document.getElementById('charge-container');
const chargeBar = document.getElementById('charge-bar');

// Create Board
function createBoard() {
    // Thicker walls to prevent tunneling (100px thick)
    const walls = [
        Bodies.rectangle(config.width / 2, -50, config.width + 200, 100, { isStatic: true, render: { fillStyle: '#333' } }), // Top
        Bodies.rectangle(-50, config.height / 2, 100, config.height + 200, { isStatic: true, render: { fillStyle: '#333' } }), // Left
        Bodies.rectangle(config.width + 50, config.height / 2, 100, config.height + 200, { isStatic: true, render: { fillStyle: '#333' } }) // Right
    ];
    Composite.add(world, walls);

    // Pins
    const rows = 12;
    const cols = 10;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = (c * config.pinSpacing) + (config.width - (cols - 1) * config.pinSpacing) / 2 + (r % 2 === 0 ? 0 : config.pinSpacing / 2);
            const y = 150 + (r * config.pinSpacing);
            const pin = Bodies.circle(x, y, config.pinRadius, { isStatic: true, render: { fillStyle: '#fff' } });
            Composite.add(world, pin);
        }
    }

    // Winning Pockets
    const pocketWidth = 80;
    const pocketY = config.height - 40;
    const pocketPositions = [config.width * 0.25, config.width * 0.5, config.width * 0.75];
    
    pocketPositions.forEach(x => {
        const pocket = Bodies.rectangle(x, pocketY, pocketWidth, 20, {
            isStatic: true,
            isSensor: true,
            label: 'pocket',
            render: { fillStyle: '#00ff00', opacity: 0.5 }
        });
        Composite.add(world, pocket);
    });
}

// Shooting Logic
function startCharging() {
    if (ballCount <= 0 || isGameOver || isCharging) return;
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
    updateUI();

    const ball = Bodies.circle(config.width - 40, config.height - 40, config.ballRadius, {
        restitution: 0.5,
        friction: 0.005,
        label: 'ball',
        render: { fillStyle: '#ffcc00' }
    });

    activeBalls.push(ball);
    Composite.add(world, ball);

    // Calculate force based on charge
    const forceX = config.minForce.x + (config.maxForce.x - config.minForce.x) * chargeRatio;
    const forceY = config.minForce.y + (config.maxForce.y - config.minForce.y) * chargeRatio;

    Body.applyForce(ball, ball.position, { x: forceX, y: forceY });
}

// Collision Handling
Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        
        if ((bodyA.label === 'ball' && bodyB.label === 'pocket') || 
            (bodyA.label === 'pocket' && bodyB.label === 'ball')) {
            
            const ball = bodyA.label === 'ball' ? bodyA : bodyB;
            removeBall(ball);
            ballCount += config.winReward;
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
    statusMsg.innerText = `Active: ${activeBalls.length}`;
}

// Game Loop Check
Events.on(engine, 'afterUpdate', () => {
    for (let i = activeBalls.length - 1; i >= 0; i--) {
        const ball = activeBalls[i];
        if (ball.position.y > config.height + 50) {
            removeBall(ball);
            updateUI();
        }
    }

    // Check Game Over
    if (ballCount === 0 && activeBalls.length === 0 && !isGameOver) {
        isGameOver = true;
        gameOverOverlay.classList.add('visible');
    }
});

// Event Listeners for Charging
shootBtn.addEventListener('mousedown', startCharging);
shootBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startCharging(); });

window.addEventListener('mouseup', releaseAndShoot);
window.addEventListener('touchend', releaseAndShoot);

// Initialize
createBoard();
updateUI();
console.log("Pachin initialized successfully!");
