import type { GameUI, IndicatorState, UIElements } from "./types";

export function renderApp(container: HTMLElement): UIElements {
  container.innerHTML = `
    <div class="app-shell">
      <canvas id="bg-hex-canvas" class="bg-hex-canvas" aria-hidden="true"></canvas>
      <div class="app-glow app-glow-top"></div>
      <div class="app-glow app-glow-bottom"></div>
      <header class="app-header">
        <div class="chip">
          <div class="chip-orb"></div>
          <span class="chip-label">lives</span>
          <span id="life-count" class="chip-value">&times; 9</span>
        </div>
        <div class="chip">
          <span class="chip-label">state</span>
          <div id="icon-indicator" class="status-dot status-dot-red"></div>
        </div>
      </header>
      <main class="app-main">
        <div id="game-board" class="game-board-frame">
          <canvas id="game-canvas" class="game-canvas" aria-label="Pachin 3D board"></canvas>
        </div>
      </main>
      <footer class="app-controls">
        <button id="btn-stop" class="btn-modern btn-modern-active">Lock Gate</button>
        <button id="btn-shoot" class="btn-modern btn-modern-inactive" disabled>Launch Ball</button>
      </footer>
      <div class="version-badge">v3.0.2</div>
    </div>
  `;

  const lifeCount = container.querySelector<HTMLElement>("#life-count");
  const indicator = container.querySelector<HTMLElement>("#icon-indicator");
  const stopButton = container.querySelector<HTMLButtonElement>("#btn-stop");
  const shootButton = container.querySelector<HTMLButtonElement>("#btn-shoot");
  const gameBoard = container.querySelector<HTMLElement>("#game-board");
  const canvas = container.querySelector<HTMLCanvasElement>("#game-canvas");
  const backgroundCanvas = container.querySelector<HTMLCanvasElement>("#bg-hex-canvas");

  if (!lifeCount || !indicator || !stopButton || !shootButton || !gameBoard || !canvas || !backgroundCanvas) {
    throw new Error("Required UI elements were not created.");
  }

  return { lifeCount, indicator, stopButton, shootButton, gameBoard, canvas, backgroundCanvas };
}

export function createGameUI(elements: UIElements): GameUI {
  return {
    updateLives: (count: number) => {
      elements.lifeCount.innerHTML = `&times; ${count}`;
    },
    setIndicator: (state: IndicatorState) => {
      if (state === "green") {
        elements.indicator.className = "status-dot status-dot-green";
      } else {
        elements.indicator.className = "status-dot status-dot-red";
      }
    },
    setButtons: (canStop: boolean, canShoot: boolean) => {
      elements.stopButton.disabled = !canStop;
      elements.shootButton.disabled = !canShoot;
      elements.stopButton.className = `btn-modern ${canStop ? "btn-modern-active" : "btn-modern-inactive"}`;
      elements.shootButton.className = `btn-modern ${canShoot ? "btn-modern-active" : "btn-modern-inactive"}`;
    },
  };
}
