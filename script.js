// Pachin v1.2.3 - Planck.js Debug Edition
(function() {
    // Error Display Overlay
    const errorOverlay = document.createElement('div');
    errorOverlay.style.position = 'absolute';
    errorOverlay.style.top = '0';
    errorOverlay.style.left = '0';
    errorOverlay.style.width = '100%';
    errorOverlay.style.height = '100%';
    errorOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
    errorOverlay.style.color = '#ff0000';
    errorOverlay.style.padding = '20px';
    errorOverlay.style.fontFamily = 'monospace';
    errorOverlay.style.fontSize = '12px';
    errorOverlay.style.zIndex = '9999';
    errorOverlay.style.display = 'none';
    errorOverlay.style.pointerEvents = 'none';
    errorOverlay.style.overflowY = 'auto';
    document.body.appendChild(errorOverlay);

    function showError(msg) {
        errorOverlay.style.display = 'block';
        errorOverlay.innerHTML += `<div>[ERROR] ${msg}</div>`;
        console.error(msg);
    }

    window.onerror = function(message, source, lineno, colno, error) {
        showError(`${message} at ${source}:${lineno}:${colno}`);
        return false;
    };

    const planck = window.planck || (typeof planck !== 'undefined' ? planck : null);
    if (!planck) {
        showError("Planck.js failed to load from CDN. (window.planck is undefined)");
        return;
    }

    // In v0.3.3, Vec2 is often planck.Vec2
    const Vec2 = planck.Vec2;
    if (!Vec2) {
        showError("planck.Vec2 is undefined. Check Planck.js version.");
        return;
    }

    // Game Configuration
    const config = {
        width: 500,
        height: 800,
        ballRadius: 7,
        pinRadius: 3,
        initialBalls: 10,
        winReward: 5,
        maxChargeTime: 1500,
        minForceY: -20,
        maxForceY: -450,
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
    let world;
    try {
        world = planck.World(Vec2(0, 70.0));
    } catch (e) {
        showError("Failed to initialize planck.World: " + e.message);
        return;
    }

    const canvas = document.getElementById('pachinko-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = config.width;
    canvas.height = config.height;

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
        try {
            const ground = world.createBody();
            
            // Walls
            ground.createFixture(planck.Edge(Vec2(0, 0), Vec2(0, config.height / config.scale)), { friction: 0 });
            ground.createFixture(planck.Edge(Vec2(config.width / config.scale, 0), Vec2(config.width / config.scale, config.height / config.scale)), { friction: 0 });

            // Smooth Top Arch (Chain Shape)
            const archSegments = 100;
            const archRadiusX = (config.width / 2 + 10) / config.scale;
            const archRadiusY = 220 / config.scale;
            const centerX = (config.width / 2) / config.scale;
            const centerY = 240 / config.scale;
            
            const archVertices = [];
            for (let i = 0; i <= archSegments; i++) {
                const angle = Math.PI + (i / archSegments) * Math.PI;
                const x = centerX + Math.cos(angle) * archRadiusX;
                const y = centerY + Math.sin(angle) * archRadiusY;
                archVertices.push(Vec2(x, y));
            }
            ground.createFixture(planck.Chain(archVertices), { friction: 0, restitution: 0.8 });

            // Launch Rail
            const railX = (config.width - 35) / config.scale;
            ground.createFixture(planck.Edge(Vec2(railX, (config.height - 150) / config.scale), Vec2(railX, 300 / config.scale)), { friction: 0 });

            // Pin Area
            const pinAreaWidth = 420;
            const pinAreaHeight = 400;
            const pinAreaX = (config.width - pinAreaWidth) / 2 + 5;
            const pinAreaY = 220;
            const pinSpacingX = 40;
            const pinSpacingY = 35;
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

            // Bottom Gates
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
        } catch (e) {
            showError("Error creating board: " + e.message);
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
        const chargeRatio = duration / config.maxChargeTime;
        
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
            friction: 0,
            restitution: 0.5,
            density: 1.0
        });
        ball.setUserData({ type: 'ball' });

        activeBalls.push(ball);

        const forceY = config.minForceY + (config.maxForceY - config.minForceY) * chargeRatio;
        ball.applyLinearImpulse(Vec2(0, forceY), ball.getWorldCenter());
    }

    function stopLight() {
        if (isLightStopped || isGameOver || activeBalls.length > 0) return;
        isLightStopped = true;
        activeGateIndex = lightIndex;
        shootBtn.disabled = false;
        statusMsg.innerText = "READY";
    }

    // Collision Handling
    world.on('begin-contact', (contact) => {
        const fixtureA = contact.getFixtureA();
        const fixtureB = contact.getFixtureB();
        const dataA = fixtureA.getUserData();
        const dataB = fixtureB.getUserData();

        const ball = (dataA && dataA.type === 'ball') ? fixtureA.getBody() : ((dataB && dataB.type === 'ball') ? fixtureB.getBody() : null);
        const gateData = (dataA && dataA.type === 'gate') ? dataA : ((dataB && dataB.type === 'gate') ? dataB : null);

        if (ball && gateData) {
            if (gateData.index === activeGateIndex) {
                ballCount += config.winReward;
            }
            ball.setUserData({ type: 'ball', remove: true });
        }
    });

    function updateUI() {
        ballCountDisplay.innerText = ballCount;
    }

    // Rendering Loop
    function animate() {
        try {
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
                            const isActive = (isLightStopped ? activeGateIndex : lightIndex) === idx;
                            ctx.beginPath();
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

            // Handle Ball Removal
            for (let i = activeBalls.length - 1; i >= 0; i--) {
                const ball = activeBalls[i];
                const data = ball.getUserData();
                const pos = ball.getPosition();

                if (data.remove || pos.y * config.scale > config.height + 50) {
                    world.destroyBody(ball);
                    activeBalls.splice(i, 1);
                    updateUI();

                    if (activeBalls.length === 0 && !isGameOver) {
                        isLightStopped = false;
                        shootBtn.disabled = true;
                        statusMsg.innerText = "STOP LIGHT";
                    }
                }
            }

            if (ballCount === 0 && activeBalls.length === 0 && !isGameOver) {
                isGameOver = true;
                gameOverOverlay.classList.add('visible');
            }
        } catch (e) {
            showError("Error in animation loop: " + e.message);
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
    console.log("Pachin Planck Edition v1.2.3 initialized!");
})();
