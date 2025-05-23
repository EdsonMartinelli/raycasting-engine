"use client";

import { CellValue, isEnemyCell, Map, SpawnPlayer } from "@/components/map/map-builder";
import { SettingsSchema } from "@/components/settings-dialog";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ColorOptions } from "@/lib/engine/configuration/colors";
import { Settings } from "@/lib/engine/configuration/settings";
import { InputManager } from "@/lib/engine/controllers/inputManager";
import { Core } from "@/lib/engine/core";
import { Enemy } from "@/lib/engine/entities/enemy";
import { Player } from "@/lib/engine/entities/player";
import { GameModal } from "@/lib/engine/logic/gameModal";
import { CanvasPaint } from "@/lib/engine/paint";
import { Renderer } from "@/lib/engine/render/renderer";
import { Vec2 } from "@/lib/engine/utils/vector";
import { ExpandIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

const MAP: ColorOptions[][] = [
  [0, 0, 0, 0, 0, 0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
  [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [0, 1, 1, 1, 1, 1, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 2],
];
const CANVAS_WIDTH = 640; // USER PREFERENCE
const CANVAS_HEIGHT = 480; // USER PREFERENCE
const MINIMAP_SIZE: number = 200; // USER PREFERENCE
const MINIMAP_ZOOM: number = 5; // USER PREFERENCE
const PIXEL_SIZE: number = MINIMAP_SIZE / (MINIMAP_ZOOM * 2); // INTERNAL
const MINIMAP_POSITION_X = CANVAS_WIDTH - MINIMAP_SIZE - PIXEL_SIZE / 2; // USER PREFERENCE
const MINIMAP_POSITION_Y = CANVAS_HEIGHT - MINIMAP_SIZE - PIXEL_SIZE / 2; // USER PREFERENCE
const UP_KEY = "W"; // USER PREFERENCE
const DOWN_KEY = "S"; // USER PREFERENCE
const LEFT_KEY = "A"; // USER PREFERENCE
const RIGHT_KEY = "D"; // USER PREFERENCE
const WALK_SPEED = 0.05;
const ROTATE_SPEED = 3;
const POSITION = { x: 3, y: 9 };
const DIRECTION = { x: 1, y: 0 };

export interface GameProps {
  map: Map;
  columns: number;
  settings: SettingsSchema;
}

const outieToInnerMap: Partial<Record<CellValue, ColorOptions>> = {
  wall_red: 1,
  wall_green: 2,
  wall_blue: 3,
  wall_cyan: 5,
  wall_magenta: 6,
  wall_yellow: 7,
}

const playerPosMapping: Record<SpawnPlayer, Vec2> = {
  player_l: { x: -1, y: 0 },
  player_tl: { x: -1, y: 1 },
  player_t: { x: 0, y: 1 },
  player_tr: { x: 1, y: 1 },
  player_r: { x: 1, y: 0 },
  player_br: { x: 1, y: -1 },
  player_b: { x: 0, y: -1 },
  player_bl: { x: -1, y: -1 }
}

function indexToCoordinates(index: number, columns: number) {
  return { x: index % columns, y: Math.floor(index / columns) };
}

function buildPlayer(map: Map, columns: number) {
  const index = map.findIndex((cell) => cell?.startsWith("player_"));
  const player = map[index] as SpawnPlayer

  return {
    position: indexToCoordinates(index, columns),
    direction: playerPosMapping[player],
  };
}

function buildEnemies(map: Map, columns: number) {
  return map
    .map((enemy, index) => {
      if (!isEnemyCell(enemy)) {
        return undefined;
      }

      return {
        position: indexToCoordinates(index, columns),
        type: enemy === "enemy_circle" ? "Circle" as const : "Square" as const,
      }
    })
    .filter(Boolean)
}


function buildFinals(map: Map, columns: number) {
  return map
    .map((cell, index) => {
      return cell === "end" ? indexToCoordinates(index, columns) : undefined;
    })
    .filter(Boolean);
}

function buildDeaths(map: Map, columns: number) {
  return map
    .map((cell, index) => {
      return cell === "death" ? indexToCoordinates(index, columns) : undefined;
    })
    .filter(Boolean);
}

function buildMap(map: Map, columns: number) {
  const transformed = map.map((cell) => cell ? (outieToInnerMap[cell] ?? 0) : 0);
  const innerMap: ColorOptions[][] = [];

  for (let i = 0; i < map.length; i += columns) {
    innerMap.push(transformed.slice(i, i + columns));
  }

  return innerMap;
}

export function Game({ map, columns, settings: outsideSettings }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  
  const engineMap = useMemo(() => buildMap(map, columns), [map, columns]);
  const objects = useMemo(() => {
    const player = buildPlayer(map, columns);
    const enemies = buildEnemies(map, columns);
    const finals = buildFinals(map, columns);
    const deaths = buildDeaths(map, columns);

    return { player, enemies, finals, deaths };
  }, [map, columns]);

  async function requestPointerLock() {
    if (!canvasRef.current) {
      return;
    }

    if (!document.pointerLockElement) {
      try {
        await canvasRef.current.requestPointerLock({
          unadjustedMovement: true,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "NotSupportedError") {
          await canvasRef.current.requestPointerLock();
        } else {
          throw error;
        }
      }
    }
  }

  async function requestFullscreen() {
    if (!canvasRef.current) {
      return;
    }

    if (!document.fullscreenElement) {
      try {
        await canvasRef.current.requestFullscreen();
        await requestPointerLock();
      } catch (error) {
        if (error instanceof Error) {
          toast({
            variant: "destructive",
            title: "Error attempting to enable fullscreen mode",
            description: error.message,
          });
        }
      }
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;

    const input = new InputManager({ UP_KEY, DOWN_KEY, LEFT_KEY, RIGHT_KEY });

    const minimapSize = outsideSettings.minimapSize[0];
    const minimapZoom = (1 + 5) - outsideSettings.minimapZoom[0];
    const pixelSize = minimapSize / (minimapZoom * 2);

    const settings = new Settings({
      canvas: {
        size: {
          w: CANVAS_WIDTH,
          h: CANVAS_HEIGHT,
        },
      },
      map: engineMap,
      minimap: {
        size: minimapSize,
        position: {
          x: CANVAS_WIDTH - minimapSize - pixelSize / 2,
          y: CANVAS_HEIGHT - minimapSize - pixelSize / 2,
        },
        zoom: minimapZoom,
      },
    });

    const onMouseMove = (event: MouseEvent) => input.produceMouseInput(event.movementX);
    const onKeydown = (event: KeyboardEvent) => input.registerKeyboardInput(event.key);
    const onKeyup = (event: KeyboardEvent) => input.deregisterKeyboardInput(event.key);

    canvas.addEventListener("click", requestPointerLock);
    canvas.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("keyup", onKeyup);

    const player = new Player(
      {
        position: { x: objects.player.position.x, y: objects.player.position.y },
        direction: { x: objects.player.direction.x, y: objects.player.direction.y },
        rotateSpeed: outsideSettings.sensitivity[0],
        walkSpeed: WALK_SPEED,
      },
      settings
    );

    const enemies = objects.enemies.filter(enemy => enemy != undefined).map(enemy => new Enemy(
      {
        position: { x: enemy.position.x, y: enemy.position.y},
        texture: enemy.type
      },
        settings
      )
    );

    const goals = objects.finals.filter(goal => goal != undefined).map(goal => {
      return {
        x: goal.x,
        y: goal.y
      }
    })

    const canvasPaint = new CanvasPaint(canvas);   
    const gameModal = new GameModal(player, enemies, goals)
    const renderer = new Renderer(settings, canvasPaint);
    const core = new Core(gameModal, input, renderer);
    core.start();

    return () => {
      core.stop();
      canvas.removeEventListener("click", requestPointerLock);
      canvas.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("keyup", onKeyup);
    };
  }, []); 

  return (
    <div className="space-y-4">
      <canvas
        className="bg-black rounded-md"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        ref={canvasRef}
      />

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={requestFullscreen}>
          <ExpandIcon />
          Fullscreen
        </Button>
      </DialogFooter>
    </div>
  );
}
