export const GRID_LINES = 16; // 16 road lines per axis (15x15 = 225 blocks, 780m city span)
export const CELL = 52; // distance between road centerlines
export const ROAD = 16; // road width
export const WORLD = (GRID_LINES - 1) * CELL; // 780m world span
export const HALF = WORLD / 2; // 390m

export const PALETTE = {
  building: [0xff6b6b, 0x4ecdc4, 0xffd93d, 0x6a8cff, 0xff9f68, 0x9b5de5, 0x00bbf9, 0xf15bb5, 0xf9844a, 0x38b000],
};

