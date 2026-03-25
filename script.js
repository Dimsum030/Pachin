const { Engine, Render, Runner, Bodies, Composite, Events, Body, Vector } = Matter;

// Game Configuration
const config = {
    width: 600,
    height: 800,
    ballRadius: 8,
    pinRadius: 4,
    pinSpacing: 40,
    initialBalls: 10,
    winReward: 3
};

// State
let ballCount = config.initialBalls;
let activeBalls = [];
let isGameOver = false;

// Matter.js Setup
const engine = Engine.create();
const world = engine.world;
const render = Render.create({
    element: document.getElementById('game-container'),
    options: {
        width: config.width,
        height: config.height,
        wireframes: false,
        background: '#000'
    }
});

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

// UI Elements
const ballCountDisplay = document.getElementById('ball-count');
const gameOverDisplay = document.getElementById('game-over');
const shootBtn = document.getElementById('shoot-btn');

// Create Board
function createBoard() {
    // Walls
    const walls = [
        Bodies.rectangle(config.width / 2, 0, config.width, 20, { isStatic: true, render: { fillStyle: '#333' } }), // Top
        Bodies.rectangle(0, config.height / 2, 20, config.height, { isStatic: true, render: { fillStyle: '#333' } }), // Left
        Bodies.rectangle(config.width, config.height / 2, 20, config.height, { isStatic: true, render: { fillStyle: '#333' } }) // Right
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
function shoot() {
    if (ballCount <= 0 || isGameOver) return;

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

    // Apply force: Up and Left
    // Increased force to ensure it reaches the top
    Body.applyForce(ball, ball.position, { x: -0.025, y: -0.055 });
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
}

// Game Loop Check
Events.on(engine, 'afterUpdate', () => {
    // Iterate backwards to safely remove items
    for (let i = activeBalls.length - 1; i >= 0; i--) {
        const ball = activeBalls[i];
        if (ball.position.y > config.height + 50) {
            removeBall(ball);
        }
    }

    // Check Game Over
    if (ballCount === 0 && activeBalls.length === 0 && !isGameOver) {
        isGameOver = true;
        gameOverDisplay.classList.add('visible');
    }
});

// Event Listeners
shootBtn.addEventListener('click', shoot);
window.addEventListener('keydown', (e) => { if (e.code === 'Space') shoot(); });

// Initialize
createBoard();
updateUI();
