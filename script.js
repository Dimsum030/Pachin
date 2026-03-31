// Pachin v1.7.1 - Planck.js Stable Edition
document.addEventListener("DOMContentLoaded", () => {
    const planck = window.planck;
    if (!planck) {
        alert("CRITICAL ERROR: Planck.js failed to load.");
        return;
    }

    // Physics Settings
    if (planck.internal && planck.internal.Settings) {
        planck.internal.Settings.maxTranslation = 100.0;
    }

    const Vec2 = planck.Vec2;
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const btnStop = document.getElementById("btn-stop");
    const btnShoot = document.getElementById("btn-shoot");
    const lifeCountDisplay = document.getElementById("life-count");
    const indicator = document.getElementById("icon-indicator");

    // Game Config (Logical Units: 500x800)
    const config = {
        logicalWidth: 500,
        logicalHeight: 800,
        ballRadius: 15,
        pinRadius: 10,
        initialBalls: 9,
        winReward: 5,
        numGates: 6,
        gateWidth: 70,
        scale: 10 // Physics scale (10px = 1m)
    };

    const tunnelWidth = 45;
    let ballCount = config.initialBalls;
    let activeBalls = [];
    let isGameOver = false;
    let isLightStopped = false;
    let activeGateIndex = 0;
    let lightIndex = 0;
    let lightDirection = 1;
    let lastLightUpdate = 0;
    let renderScale = 1;

    // Initialize Physics World
    const world = planck.World(Vec2(0, 80.0));

    function createBoard() {
        const ground = world.createBody();
        
        // 1. Walls (Invisible, handled by CSS border)
        ground.createFixture(planck.Box(50 / config.scale, config.logicalHeight / (2 * config.scale), Vec2(-50 / config.scale, config.logicalHeight / (2 * config.scale))), { friction: 0, userData: { type: 'wall' } });
        ground.createFixture(planck.Box(50 / config.scale, config.logicalHeight / (2 * config.scale), Vec2((config.logicalWidth + 50) / config.scale, config.logicalHeight / (2 * config.scale))), { friction: 0, userData: { type: 'wall' } });
        ground.createFixture(planck.Box(config.logicalWidth / (2 * config.scale), 50 / config.scale, Vec2(config.logicalWidth / (2 * config.scale), -50 / config.scale)), { friction: 0, userData: { type: 'wall' } });

        // 2. Top Arch (Invisible, handled by CSS border-radius)
        const archSegments = 100;
        const archRadiusX = (config.logicalWidth / 2) / config.scale;
        const archRadiusY = 250 / config.scale;
        const centerX = (config.logicalWidth / 2) / config.scale;
        const centerY = 320 / config.scale; 
        
        const archVertices = [];
        for (let i = 0; i <= archSegments; i++) {
            const angle = Math.PI + (i / archSegments) * Math.PI;
            const x = centerX + Math.cos(angle) * archRadiusX;
            const y = centerY + Math.sin(angle) * archRadiusY;
            archVertices.push(Vec2(x, y));
        }
        ground.createFixture(planck.Chain(archVertices), { friction: 0.2, restitution: 0.2, userData: { type: 'wall' } });

        // 3. Launch Rail (Visible)
        const railX = (config.logicalWidth - tunnelWidth) / config.scale;
        ground.createFixture(planck.Edge(Vec2(railX, (config.logicalHeight - 100) / config.scale), Vec2(railX, 320 / config.scale)), { friction: 0, userData: { type: 'rail' } });

        // 4. Pins (4-3-4-3-4)
        const pinRows = 5;
        const startY = 350;
        const spacingY = 85;
        const spacingX = 100;
        const startX = 100;

        for (let r = 0; r < pinRows; r++) {
            const isEven = r % 2 === 0;
            const cols = isEven ? 4 : 3;
            const rowOffsetX = isEven ? 0 : spacingX / 2;
            
            for (let c = 0; c < cols; c++) {
                const x = startX + rowOffsetX + (c * spacingX);
                const y = startY + (r * spacingY);
                
                if (x < (config.logicalWidth - tunnelWidth - 20)) {
                    const pin = world.createBody(Vec2(x / config.scale, y / config.scale));
                    pin.createFixture(planck.Circle(config.pinRadius / config.scale), { friction: 0.1, restitution: 0.5 });
                }
            }
        }

        // 5. Gates (Visible)
        const startXGate = 15;
        for (let i = 0; i < config.numGates; i++) {
            const x = startXGate + (i * config.gateWidth) + config.gateWidth / 2;
            if (x + config.gateWidth / 2 < (config.logicalWidth - tunnelWidth)) {
                ground.createFixture(planck.Edge(Vec2((x - config.gateWidth / 2) / config.scale, (config.logicalHeight - 80) / config.scale), Vec2((x - config.gateWidth / 2) / config.scale, config.logicalHeight / config.scale)), { friction: 0, userData: { type: 'rail' } });
                const gate = world.createBody(Vec2(x / config.scale, (config.logicalHeight - 40) / config.scale));
                const fixture = gate.createFixture(planck.Box((config.gateWidth - 10) / (2 * config.scale), 10 / config.scale), { isSensor: true });
                fixture.setUserData({ type: 'gate', index: i });
            }
        }
    }

    function resizeCanvas() {
        const boardInfo = canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        canvas.width = boardInfo.width * dpr;
        canvas.height = boardInfo.height * dpr;
        
        // Calculate the scale factor to map 500x800 logical units to actual pixels
        const scaleX = boardInfo.width / config.logicalWidth;
        const scaleY = boardInfo.height / config.logicalHeight;
        renderScale = Math.min(scaleX, scaleY);
        
        ctx.scale(dpr, dpr);
        // Center the game if the aspect ratio doesn't match perfectly
        const offsetX = (boardInfo.width - (config.logicalWidth * renderScale)) / 2;
        const offsetY = (boardInfo.height - (config.logicalHeight * renderScale)) / 2;
        ctx.translate(offsetX, offsetY);
    }

    function shootBall() {
        if (ballCount <= 0 || isGameOver || !isLightStopped || activeBalls.length > 0) return;
        
        ballCount--;
        updateUI();
        btnShoot.className = "glow-btn inactive-gray";
        btnShoot.disabled = true;

        const spawnX = (config.logicalWidth - tunnelWidth / 2) / config.scale;
        const spawnY = (config.logicalHeight - 40) / config.scale;

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

        const forceY = -500; // Fixed force for now
        ball.setUserData({ type: 'ball', spawnTime: Date.now() });
        activeBalls.push(ball);
        ball.setLinearVelocity(Vec2(0, forceY / 5));
    }

    function stopLight() {
        if (isLightStopped || isGameOver || activeBalls.length > 0) return;
        isLightStopped = true;
        activeGateIndex = lightIndex;
        
        btnStop.className = "glow-btn inactive-gray";
        btnShoot.className = "glow-btn active-yellow";
        btnShoot.disabled = false;
        
        indicator.classList.remove('led-red');
        indicator.classList.add('led-green');
    }

    function updateUI() {
        lifeCountDisplay.innerHTML = `&times; ${ballCount}`;
    }

    world.on('begin-contact', (contact) => {
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
    });

    function drawGame() {
        world.step(1 / 60);
        ctx.clearRect(0, 0, config.logicalWidth, config.logicalHeight);

        const time = Date.now();
        if (!isLightStopped && time - lastLightUpdate > 100) {
            lightIndex += lightDirection;
            if (lightIndex >= config.numGates - 1 || lightIndex <= 0) lightDirection *= -1;
            lastLightUpdate = time;
        }

        for (let body = world.getBodyList(); body; body = body.getNext()) {
            const pos = body.getPosition();
            const angle = body.getAngle();

            for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
                const shape = fixture.getShape();
                const type = shape.getType();
                const data = fixture.getUserData();

                ctx.save();
                ctx.scale(renderScale, renderScale);
                ctx.translate(pos.x * config.scale, pos.y * config.scale);
                ctx.rotate(angle);

                if (type === 'circle') {
                    const radius = shape.m_radius * config.scale;
                    ctx.beginPath();
                    ctx.arc(0, 0, radius, 0, Math.PI * 2);
                    const bodyData = body.getUserData();
                    if (bodyData && bodyData.type === 'ball') {
                        ctx.fillStyle = '#ffffff';
                        ctx.shadowBlur = 15;
                        ctx.shadowColor = '#fff';
                    } else {
                        ctx.fillStyle = '#ccff00';
                        ctx.shadowBlur = 10;
                        ctx.shadowColor = '#ccff00';
                    }
                    ctx.fill();
                    ctx.closePath();
                } else if (type === 'edge' || type === 'chain') {
                    // Only draw if it's NOT a wall (walls are handled by CSS)
                    if (data && data.type === 'wall') {
                        ctx.restore();
                        continue;
                    }
                    
                    ctx.beginPath();
                    ctx.strokeStyle = '#00ffff';
                    ctx.lineWidth = 3;
                    ctx.shadowBlur = 10;
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
                        ctx.fillStyle = isActive ? '#ccff00' : 'rgba(0, 255, 255, 0.05)';
                        if (isActive) {
                            ctx.shadowBlur = 20;
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

        for (let i = activeBalls.length - 1; i >= 0; i--) {
            const ball = activeBalls[i];
            const data = ball.getUserData();
            const pos = ball.getPosition();
            const pixelY = pos.y * config.scale;
            const now = Date.now();
            const isProtected = (now - data.spawnTime) < 500;

            if (!isProtected && (data.remove || pixelY > config.logicalHeight + 50 || pixelY < -2000)) {
                world.destroyBody(ball);
                activeBalls.splice(i, 1);
                updateUI();
                if (activeBalls.length === 0 && !isGameOver) {
                    isLightStopped = false;
                    btnStop.className = "glow-btn active-yellow";
                    btnShoot.className = "glow-btn inactive-gray";
                    btnShoot.disabled = true;
                    indicator.classList.remove('led-green');
                    indicator.classList.add('led-red');
                }
            }
        }

        if (ballCount === 0 && activeBalls.length === 0 && !isGameOver) {
            isGameOver = true;
            alert("SYSTEM HALT - REBOOTING");
            location.reload();
        }
        requestAnimationFrame(drawGame);
    }

    btnStop.addEventListener("click", stopLight);
    btnShoot.addEventListener("click", shootBall);
    window.addEventListener("resize", resizeCanvas);

    createBoard();
    resizeCanvas();
    updateUI();
    drawGame();
});
