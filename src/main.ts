import "./styles.css";
import { GameEngine } from "./game/engine";
import { createGameUI, renderApp } from "./game/ui";

const mountNode = document.querySelector<HTMLElement>("#app");
if (!mountNode) throw new Error("Missing #app root element.");

const uiElements = renderApp(mountNode);
const gameUI = createGameUI(uiElements);
const engine = new GameEngine({
  canvas: uiElements.canvas,
  backgroundCanvas: uiElements.backgroundCanvas,
  gameBoard: uiElements.gameBoard,
  ui: gameUI,
});

uiElements.stopButton.addEventListener("click", () => engine.stopLight());
uiElements.stopButton.addEventListener("touchstart", (e) => {
  e.preventDefault();
  engine.stopLight();
}, { passive: false });

let chargeStartTime = 0;
let chargeInterval: number | null = null;
const MAX_CHARGE_TIME = 1000; // 1 second for max charge

const startCharge = (e: Event) => {
  if (uiElements.shootButton.disabled) return;
  e.preventDefault();
  chargeStartTime = performance.now();
  uiElements.shootButton.textContent = "Charging...";
  
  if (chargeInterval) clearInterval(chargeInterval);
  chargeInterval = window.setInterval(() => {
    const elapsed = performance.now() - chargeStartTime;
    const ratio = Math.min(elapsed / MAX_CHARGE_TIME, 1.0);
    const percent = Math.floor(ratio * 100);
    uiElements.shootButton.textContent = `Power: ${percent}%`;
  }, 50);
};

const endCharge = (e: Event) => {
  if (uiElements.shootButton.disabled || chargeStartTime === 0) return;
  e.preventDefault();
  if (chargeInterval) {
    clearInterval(chargeInterval);
    chargeInterval = null;
  }
  
  const elapsed = performance.now() - chargeStartTime;
  const ratio = Math.min(elapsed / MAX_CHARGE_TIME, 1.0);
  chargeStartTime = 0;
  
  uiElements.shootButton.textContent = "Launch Ball";
  engine.shootBall(ratio);
};

uiElements.shootButton.addEventListener("mousedown", startCharge);
uiElements.shootButton.addEventListener("touchstart", startCharge, { passive: false });

window.addEventListener("mouseup", endCharge);
window.addEventListener("touchend", endCharge, { passive: false });

window.addEventListener("resize", () => engine.resizeCanvas());

void engine.start();
