import "./styles.css";
import { GameEngine } from "./game/engine";
import { createGameUI, renderApp } from "./game/ui";

const mountNode = document.querySelector<HTMLElement>("#app");
if (!mountNode) throw new Error("Missing #app root element.");

const uiElements = renderApp(mountNode);
const gameUI = createGameUI(uiElements);
const engine = new GameEngine({ canvas: uiElements.canvas, ui: gameUI });

uiElements.stopButton.addEventListener("click", () => engine.stopLight());
uiElements.shootButton.addEventListener("click", () => engine.shootBall());
window.addEventListener("resize", () => engine.resizeCanvas());

engine.start();
