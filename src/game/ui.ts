import type { GameUI, IndicatorState, UIElements } from "./types";

export function renderApp(container: HTMLElement): UIElements {
  container.innerHTML = `
    <div class="relative mx-auto flex h-dvh max-h-dvh w-full max-w-[560px] flex-col overflow-hidden bg-zinc-950 text-zinc-50">
      <header class="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-4 md:px-5">
        <div class="flex items-center gap-3 rounded-lg border border-zinc-700/80 bg-zinc-900/65 px-3 py-2 backdrop-blur">
          <div class="h-5 w-5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.75)]"></div>
          <span id="life-count" class="text-base font-semibold tracking-wide">&times; 9</span>
        </div>
        <div id="icon-indicator" class="h-5 w-5 rounded-full bg-neon-pink shadow-[0_0_15px_#ff0055]"></div>
      </header>
      <main class="flex flex-1 items-center px-4 pb-5 pt-16">
        <div id="game-board" class="relative mx-auto h-full max-h-[calc(100dvh-11.5rem)] w-full overflow-hidden rounded-t-[42%_20%] border-[3px] border-neon-cyan bg-black shadow-neon-cyan aspect-[500/800]">
          <canvas id="game-canvas" class="block h-full w-full"></canvas>
        </div>
      </main>
      <div class="px-4 pb-7 md:px-5">
        <div class="grid grid-cols-2 gap-3">
          <button id="btn-stop" class="btn-neon btn-neon-active">stop light</button>
          <button id="btn-shoot" class="btn-neon btn-neon-inactive" disabled>shoot</button>
        </div>
      </div>
      <div class="pointer-events-none absolute bottom-1.5 left-2 text-[11px] text-zinc-700">v2.0.0</div>
    </div>
  `;

  const lifeCount = container.querySelector<HTMLElement>("#life-count");
  const indicator = container.querySelector<HTMLElement>("#icon-indicator");
  const stopButton = container.querySelector<HTMLButtonElement>("#btn-stop");
  const shootButton = container.querySelector<HTMLButtonElement>("#btn-shoot");
  const canvas = container.querySelector<HTMLCanvasElement>("#game-canvas");

  if (!lifeCount || !indicator || !stopButton || !shootButton || !canvas) {
    throw new Error("Required UI elements were not created.");
  }

  return { lifeCount, indicator, stopButton, shootButton, canvas };
}

export function createGameUI(elements: UIElements): GameUI {
  return {
    updateLives: (count: number) => {
      elements.lifeCount.innerHTML = `&times; ${count}`;
    },
    setIndicator: (state: IndicatorState) => {
      if (state === "green") {
        elements.indicator.className = "h-5 w-5 rounded-full bg-neon-green shadow-[0_0_15px_#39ff14]";
      } else {
        elements.indicator.className = "h-5 w-5 rounded-full bg-neon-pink shadow-[0_0_15px_#ff0055]";
      }
    },
    setButtons: (canStop: boolean, canShoot: boolean) => {
      elements.stopButton.disabled = !canStop;
      elements.shootButton.disabled = !canShoot;
      elements.stopButton.className = `btn-neon ${canStop ? "btn-neon-active" : "btn-neon-inactive"}`;
      elements.shootButton.className = `btn-neon ${canShoot ? "btn-neon-active" : "btn-neon-inactive"}`;
    },
  };
}
