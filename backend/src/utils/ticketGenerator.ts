import { TicketGridData } from '@shared/types/ticket';
import crypto from 'crypto';

// Column ranges for Tambola/Housie:
// Col 0: 1-9
// Col 1: 10-19
// ...
// Col 7: 70-79
// Col 8: 80-90
const COL_RANGES = [
  { min: 1, max: 9 },
  { min: 10, max: 19 },
  { min: 20, max: 29 },
  { min: 30, max: 39 },
  { min: 40, max: 49 },
  { min: 50, max: 59 },
  { min: 60, max: 69 },
  { min: 70, max: 79 },
  { min: 80, max: 90 },
];

/**
 * Generate a cryptographically secure random integer in [min, max] (inclusive)
 */
export function getRandomInt(min: number, max: number): number {
  return crypto.randomInt(min, max + 1);
}

/**
 * Generate a single valid Tambola/Housie ticket grid
 */
export function generateTicketGrid(): TicketGridData {
  while (true) {
    // 1. Initialize empty 3x9 grid
    const grid: (number | null)[][] = [
      Array(9).fill(null),
      Array(9).fill(null),
      Array(9).fill(null),
    ];

    // 2. Decide column sizes (how many numbers in each column)
    // Total numbers must be 15, and every column must have at least 1 number.
    // So we start with 1 in each column (9 total). We need 6 more.
    const colCounts = Array(9).fill(1);
    let remaining = 6;
    while (remaining > 0) {
      const colIdx = getRandomInt(0, 8);
      if (colCounts[colIdx] < 3) {
        colCounts[colIdx]++;
        remaining--;
      }
    }

    // 3. Try to distribute the column counts across the 3 rows
    // Each row must have exactly 5 numbers.
    // We can solve this with a simple heuristic + backtracking/retry.
    const rowCounts = [0, 0, 0];
    const columnsWithCount3 = colCounts.map((val, idx) => (val === 3 ? idx : -1)).filter((idx) => idx !== -1);
    const columnsWithCount2 = colCounts.map((val, idx) => (val === 2 ? idx : -1)).filter((idx) => idx !== -1);
    const columnsWithCount1 = colCounts.map((val, idx) => (val === 1 ? idx : -1)).filter((idx) => idx !== -1);

    // Place columns with count 3 in all rows
    for (const col of columnsWithCount3) {
      grid[0][col] = 0;
      grid[1][col] = 0;
      grid[2][col] = 0;
      rowCounts[0]++;
      rowCounts[1]++;
      rowCounts[2]++;
    }

    // Shuffle helper
    const shuffleArray = <T>(arr: T[]): T[] => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = getRandomInt(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    // For count 2 columns, choose 2 rows randomly
    let success = true;
    const shuffledCol2 = shuffleArray(columnsWithCount2);
    for (const col of shuffledCol2) {
      // Find candidate row pairs that aren't full (count < 5)
      const pairs = [
        [0, 1],
        [1, 2],
        [0, 2],
      ].filter(([r1, r2]) => rowCounts[r1] < 5 && rowCounts[r2] < 5);

      if (pairs.length === 0) {
        success = false;
        break;
      }

      // Pick a random valid row pair
      const [r1, r2] = pairs[getRandomInt(0, pairs.length - 1)];
      grid[r1][col] = 0;
      grid[r2][col] = 0;
      rowCounts[r1]++;
      rowCounts[r2]++;
    }

    if (!success) continue;

    // For count 1 columns, choose 1 row
    const shuffledCol1 = shuffleArray(columnsWithCount1);
    for (const col of shuffledCol1) {
      const candidateRows = [0, 1, 2].filter((r) => rowCounts[r] < 5);
      if (candidateRows.length === 0) {
        success = false;
        break;
      }
      const r = candidateRows[getRandomInt(0, candidateRows.length - 1)];
      grid[r][col] = 0;
      rowCounts[r]++;
    }

    if (!success) continue;

    // Verify constraints: each row must have exactly 5 numbers
    if (rowCounts[0] !== 5 || rowCounts[1] !== 5 || rowCounts[2] !== 5) {
      continue;
    }

    // 4. Fill the selected positions with actual valid, sorted numbers
    for (let col = 0; col < 9; col++) {
      const range = COL_RANGES[col];
      const count = colCounts[col];
      const numbers: number[] = [];

      // Generate 'count' unique random numbers in the column range
      const rangeSize = range.max - range.min + 1;
      const allNumbersInRange = Array.from({ length: rangeSize }, (_, i) => range.min + i);
      const shuffledRange = shuffleArray(allNumbersInRange);

      for (let i = 0; i < count; i++) {
        numbers.push(shuffledRange[i]);
      }

      // Sort numbers in ascending order
      numbers.sort((a, b) => a - b);

      // Distribute to grid rows that have placeholder (0)
      let numIdx = 0;
      for (let row = 0; row < 3; row++) {
        if (grid[row][col] === 0) {
          grid[row][col] = numbers[numIdx++];
        }
      }
    }

    return {
      row1: grid[0],
      row2: grid[1],
      row3: grid[2],
    };
  }
}
