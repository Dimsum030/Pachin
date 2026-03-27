// Pachin v1.5.8 - Planck.js Stable Edition
(function() {
    const planck = window.planck;
    if (!planck) {
        alert("CRITICAL ERROR: Planck.js failed to load from CDN.");
        return;
    }

    // CRITICAL FIX: Increase the engine's speed limit to allow high-force shots
    if (planck.internal && planck.internal.Settings) {
        planck.internal.Settings.maxTranslation = 100.0;
    } else if (planck.Settings) {
        planck.Settings.maxTranslation = 100.0;
    }

    const Vec2 = planck.Vec2;

    // Game Configuration
    const config = {
        width: 500,
        height: 800,
        ballRadius: 10,
        pinRadius: 5,
        initialBalls: 10,
        winReward: 5,
        maxChargeTime: 1500,
        minForceY: -40,
        maxForceY: -600, // Current max force
        numGates: 10,
        gateWidth: 40,
        scale: 10
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

    // Planck.js World Setup
    const world = planck.World(Vec2(0, 80.0)); // Gravity: 80.0 (Balanced for weight)
    const canvas = document.getElementById('pachinko-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = config.width;
    canvas.height = config.height;

    // UI Elements
    const ballCountDisplay = document.getElementById('ball-count');
    const statusMsg = document.getElementById('status-msg');
    const statusLed = document.getElementById('status-led');
    const gameOverOverlay = document.getElementById('game-over-overlay');
    const shootBtn = document.getElementById('shoot-btn');
    const stopLightBtn = document.getElementById('stop-light-btn');
    const chargeContainer = document.getElementById('charge-container');
    const chargeBar = document.getElementById('charge-bar');

    // Create Board
    function createBoard() {
        const ground = world.createBody();
        
        // 1. THICK Walls (Prevent tunneling) - Invisible physics
        // Left Wall
        ground.createFixture(planck.Box(50 / config.scale, config.height / (2 * config.scale), Vec2(-50 / config.scale, config.height / (2 * config.scale))), { friction: 0 });
        // Right Wall
        ground.createFixture(planck.Box(50 / config.scale, config.height / (2 * config.scale), Vec2((config.width + 50) / config.scale, config.height / (2 * config.scale))), { friction: 0 });
        // Safety Ceiling
        ground.createFixture(planck.Box(config.width / (2 * config.scale), 50 / config.scale, Vec2(config.width / (2 * config.scale), -50 / config.scale)), { friction: 0 });

        // 2. Smooth Top Arch (Chain Shape) - MOVED DOWN to avoid UI Panel
        const archSegments = 100;
        const archRadiusX = (config.width / 2 + 10) / config.scale;
        const archRadiusY = 220 / config.scale;
        const centerX = (config.width / 2) / config.scale;
        const centerY = 320 / config.scale; // Moved down from 240
        
        const archVertices = [];
        for (let i = 0; i <= archSegments; i++) {
            const angle = Math.PI + (i / archSegments) * Math.PI;
            const x = centerX + Math.cos(angle) * archRadiusX;
            const y = centerY + Math.sin(angle) * archRadiusY;
            archVertices.push(Vec2(x, y));
        }
        ground.createFixture(planck.Chain(archVertices), { friction: 0.2, restitution: 0.2 });

        // 3. Launch Rail
        const railX = (config.width - 35) / config.scale;
        ground.createFixture(planck.Edge(Vec2(railX, (config.height - 150) / config.scale), Vec2(railX, 380 / config.scale)), { friction: 0 });

        // 4. Pin Area - MOVED DOWN to match arch
        const pinAreaWidth = 440;
        const pinAreaHeight = 350;
        const pinAreaX = (config.width - pinAreaWidth) / 2 + 10;
        const pinAreaY = 345; // Moved down from 265
        const pinSpacingX = 50;
        const pinSpacingY = 45;
        const rows = Math.floor(pinAreaHeight / pinSpacingY);
        const cols = Math.floor(pinAreaWidth / pinSpacingX);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = pinAreaX + (c * pinSpacingX) + (r % 2 === 0 ? 0 : pinSpacingX / 2);
                const y = pinAreaY + (r * pinSpacingY);
                
                if (x < (config.width - 60)) {
                    const pin = world.createBody(Vec2(x / config.scale, y / config.scale));
                    pin.createFixture(planck.Circle(config.pinRadius / config.scale), { friction: 0.1, restitution: 0.5 });
                }
            }
        }

        // 5. Bottom Gates
        const startX = (config.width - (config.numGates * config.gateWidth)) / 2 - 20;
        for (let i = 0; i < config.numGates; i++) {
            const x = startX + (i * config.gateWidth) + config.gateWidth / 2;
            ground.createFixture(planck.Edge(Vec2((x - config.gateWidth / 2) / config.scale, (config.height - 80) / config.scale), Vec2((x - config.gateWidth / 2) / config.scale, config.height / config.scale)), { friction: 0 });

            const gate = world.createBody(Vec2(x / config.scale, (config.height - 40) / config.scale));
            const fixture = gate.createFixture(planck.Box((config.gateWidth - 10) / (2 * config.scale), 10 / config.scale), { isSensor: true });
            fixture.setUserData({ type: 'gate', index: i });

            if (i === config.numGates - 1) {
                ground.createFixture(planck.Edge(Vec2((x + config.gateWidth / 2) / config.scale, (config.height - 80) / config.scale), Vec2((x + config.gateWidth / 2) / config.scale, config.height / config.scale)), { friction: 0 });
            }
        }
    }

    // Shooting Logic
    function startCharging() {
        if (ballCount <= 0 || isGameOver || isCharging || !isLightStopped || activeBalls.length > 0) return;
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
        
        isCharging = false;
        chargeContainer.style.display = 'none';
        chargeBar.style.width = '0%';

        ballCount--;
        shootBtn.disabled = true;
        statusMsg.innerText = "BALL IN PLAY";
        updateUI();

        const spawnX = (config.width - 17) / config.scale;
        const spawnY = (config.height - 40) / config.scale;

        const ball = world.createBody({
            type: 'dynamic',
            position: Vec2(spawnX, spawnY),
            bullet: true
        });
        
        ball.createFixture(planck.Circle(config.ballRadius / config.scale), {
            friction: 0.1,
            restitution: 0.4,
            density: 1.0
        });

        const magnitude = Math.abs(config.maxForceY) * (1 - Math.exp(-0.00233 * duration));
        const baseForceY = -magnitude; 
        const randomForce = (Math.random() * -25) - 5;
        const finalForceY = Math.round(baseForceY + randomForce);

        if (isNaN(finalForceY)) {
            console.error("CRITICAL ERROR: Force calculation resulted in NaN!");
            world.destroyBody(ball);
            return;
        }

        console.log(`Shoot: duration=${duration}ms, baseForce=${baseForceY.toFixed(2)}, finalForce=${finalForceY.toFixed(2)}`);

        ball.setUserData({ 
            type: 'ball', 
            launched: true,
            spawnTime: Date.now() 
        });
        activeBalls.push(ball);

        ball.setLinearVelocity(Vec2(0, finalForceY / 5));
    }

    function stopLight() {
        if (isLightStopped || isGameOver || activeBalls.length > 0) return;
        isLightStopped = true;
        activeGateIndex = lightIndex;
        shootBtn.disabled = false;
        statusMsg.innerText = "READY";
        
        statusLed.classList.remove('led-red');
        statusLed.classList.add('led-green');
    }

    // Collision Handling
    world.on('begin-contact', (contact) => {
        try {
            const fixtureA = contact.getFixtureA();
            const fixtureB = contact.getFixtureB();
            const bodyA = fixtureA.getBody();
            const bodyB = fixtureB.getBody();
            const bodyDataA = bodyA.getUserData();
            const bodyDataB = bodyB.getUserData();
            const fixDataA = fixtureA.getUserData();
            const fixDataB = fixtureB.getUserData();

            const ballBody = (bodyDataA && bodyDataA.type === 'ball') ? bodyA : ((bodyDataB && bodyDataB.type === 'ball') ? bodyB : null);
            const gateData = (fixDataA && fixDataA.type === 'gate') ? fixDataA : ((fixDataB && fixDataB.type === 'gate') ? fixDataB : null);

            if (ballBody && gateData) {
                if (gateData.index === activeGateIndex) {
                    ballCount += config.winReward;
                    updateUI();
                }
                ballBody.setUserData({ type: 'ball', remove: true });
            }
        } catch (e) {
            console.error("Collision Error:", e);
        }
    });

    function updateUI() {
        ballCountDisplay.innerText = ballCount;
    }

    // Rendering Loop
    function animate() {
        world.step(1 / 60);
        ctx.clearRect(0, 0, config.width, config.height);

        // Update Light
        const time = Date.now();
        if (!isLightStopped && time - lastLightUpdate > 100) {
            lightIndex += lightDirection;
            if (lightIndex >= config.numGates - 1 || lightIndex <= 0) lightDirection *= -1;
            lastLightUpdate = time;
        }

        // Draw World
        for (let body = world.getBodyList(); body; body = body.getNext()) {
            const pos = body.getPosition();
            const angle = body.getAngle();

            for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
                const shape = fixture.getShape();
                const type = shape.getType();
                const data = fixture.getUserData();

                ctx.save();
                ctx.translate(pos.x * config.scale, pos.y * config.scale);
                ctx.rotate(angle);

                if (type === 'circle') {
                    const radius = shape.m_radius * config.scale;
                    ctx.beginPath();
                    ctx.arc(0, 0, radius, 0, Math.PI * 2);
                    
                    const bodyData = body.getUserData();
                    if (bodyData && bodyData.type === 'ball') {
                        ctx.fillStyle = '#ffffff';
                        ctx.shadowBlur = 10;
                        ctx.shadowColor = '#00ffff';
                    } else {
                        ctx.fillStyle = '#00ff00';
                    }
                    ctx.fill();
                    ctx.closePath();
                } else if (type === 'edge' || type === 'chain') {
                    ctx.beginPath();
                    ctx.strokeStyle = '#00ffff';
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 5;
                    ctx.shadowColor = '#00ffff';
                    
                    const vertices = type === 'edge' ? [shape.m_vertex1, shape.m_vertex2] : shape.m_vertices;
                    if (vertices && vertices.length > 0) {
                        ctx.moveTo(vertices[0].x * config.scale - pos.x * config.scale, vertices[0].y * config.scale - pos.y * config.scale);
                        for (let i = 1; i < vertices.length; i++) {
                            ctx.lineTo(vertices[i].x * config.scale - pos.x * config.scale, vertices[i].y * config.scale - pos.y * config.scale);
                        }
                        ctx.stroke();
                    }
                    ctx.closePath();
                } else if (type === 'polygon') {
                    const idx = data ? data.index : -1;
                    if (idx !== -1) {
                        ctx.beginPath();
                        const isActive = (isLightStopped ? activeGateIndex : lightIndex) === idx;
                        ctx.fillStyle = isActive ? '#ccff00' : 'rgba(0, 255, 255, 0.1)';
                        if (isActive) {
                            ctx.shadowBlur = 15;
                            ctx.shadowColor = '#ccff00';
                        }
                        const vertices = shape.m_vertices;
                        if (vertices && vertices.length > 0) {
                            ctx.moveTo(vertices[0].x * config.scale, vertices[0].y * config.scale);
                            for (let i = 1; i < vertices.length; i++) {
                                ctx.lineTo(vertices[i].x * config.scale, vertices[i].y * config.scale);
                            }
                            ctx.fill();
                        }
                        ctx.closePath();
                    }
                }
                ctx.restore();
            }
        }

        // Handle Ball Removal and Recovery
        for (let i = activeBalls.length - 1; i >= 0; i--) {
            const ball = activeBalls[i];
            const data = ball.getUserData();
            const pos = ball.getPosition();
            const pixelX = pos.x * config.scale;
            const pixelY = pos.y * config.scale;
            const now = Date.now();

            const isProtected = (now - data.spawnTime) < 500;

            if (!isProtected) {
                if (pixelX > 465 && pixelY > 780 && data.launched) {
                    ballCount++;
                    data.remove = true;
                    console.log("Ball recovered!");
                }

                if (pixelY < -2000) {
                    data.remove = true;
                    console.log("Ball escaped top! Auto-cleaning...");
                }
            }

            if (data.remove || pixelY > config.height + 50) {
                world.destroyBody(ball);
                activeBalls.splice(i, 1);
                updateUI();

                if (activeBalls.length === 0 && !isGameOver) {
                    isLightStopped = false;
                    shootBtn.disabled = true;
                    statusMsg.innerText = "STOP LIGHT";
                    
                    statusLed.classList.remove('led-green');
                    statusLed.classList.add('led-red');
                }
            }
        }

        if (ballCount === 0 && activeBalls.length === 0 && !isGameOver) {
            isGameOver = true;
            gameOverOverlay.classList.add('visible');
        }

        requestAnimationFrame(animate);
    }

    // Event Listeners
    shootBtn.addEventListener('mousedown', startCharging);
    shootBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startCharging(); });
    window.addEventListener('mouseup', releaseAndShoot);
    window.addEventListener('touchend', releaseAndShoot);
    stopLightBtn.addEventListener('click', stopLight);

    // Initialize
    createBoard();
    updateUI();
    animate();
    
    console.log("Pachin Planck Edition v1.5.8 initialized!");
    console.log("--- Physics & Game Config ---");
    console.log("Gravity:", world.getGravity().y);
    console.log("Max Force Y (Asymptote):", config.maxForceY);
    console.log("Force Formula: y = " + config.maxForceY + " * (1 - e^(-0.00233 * x))");
    console.log("-----------------------------");
})();
