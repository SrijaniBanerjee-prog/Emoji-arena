/**
  matchEngine.js
 * ─────────────────────────────────────────────────────────────
 * Pure Match-3 engine: detection, removal, gravity, refill,
 * cascade resolution, and score calculation.
 *
 * All functions are stateless — they receive a board and return
 * a new board (or data), never mutating the original.
 *
 * Consumed by: gameLogic.js
 * No UI code. No network code. No external dependencies.
 * ─────────────────────────────────────────────────────────────
 */

// ─── Default emoji pool (overridable by M1 via gameLogic.js) ───
const DEFAULT_EMOJI_POOL = ["😎", "😊", "😁", "🤩", "🤗", "😍", "🥳", "😜", "😇", "🤪"];

// ─── Scoring table ───────────────────────────────────────────
const SCORE_TABLE = {
  3: 10,
  4: 20,
};
const SCORE_5_PLUS = 50;

// ═══════════════════════════════════════════════════════════════
// SECTION 1 — HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * cloneBoard
 * Returns a deep copy of the 2-D board array.
 * Prevents accidental mutation of the caller's state.
 *
 * @param {Array<Array<string|null>>} board
 * @returns {Array<Array<string|null>>}
 */
function cloneBoard(board) {
  return board.map((row) => [...row]);
}

/**
 * getRandomEmoji
 * Picks one emoji at random from the supplied pool.
 *
 * @param {string[]} emojiPool
 * @returns {string}
 */
function getRandomEmoji(emojiPool = DEFAULT_EMOJI_POOL) {
  return emojiPool[Math.floor(Math.random() * emojiPool.length)];
}

/**
 * boardHasMatches
 * Quick predicate — returns true if findMatches finds anything.
 *
 * @param {Array<Array<string|null>>} board
 * @returns {boolean}
 */
function boardHasMatches(board) {
  return findMatches(board).length > 0;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2 — MATCH DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * findMatches
 * Scans the board for horizontal and vertical runs of 3 or more
 * identical emojis. Returns every matched cell exactly once.
 *
 * Algorithm:
 *  - Sweep rows left-to-right collecting consecutive equal cells.
 *  - Sweep columns top-to-bottom collecting consecutive equal cells.
 *  - Any run >= 3 is a match; all its cells are recorded.
 *  - A Set stringifies coordinates to eliminate duplicates.
 *
 * @param {Array<Array<string|null>>} board
 * @returns {Array<{row: number, col: number}>} unique matched cells
 */
function findMatches(board) {
  const rows = board.length;
  const cols = board[0].length;

  // Use a Set<"r,c"> to deduplicate cells shared by H + V matches.
  const matchSet = new Set();

  const record = (r, c) => matchSet.add(`${r},${c}`);

  // Horizontal sweep
  for (let r = 0; r < rows; r++) {
    let runStart = 0;
    while (runStart < cols) {
      const emoji = board[r][runStart];

      // Skip empty cells — they cannot form a match.
      if (emoji === null) {
        runStart++;
        continue;
      }

      // Extend the run as far as the same emoji continues.
      let runEnd = runStart + 1;
      while (runEnd < cols && board[r][runEnd] === emoji) {
        runEnd++;
      }

      const runLength = runEnd - runStart;
      if (runLength >= 3) {
        for (let c = runStart; c < runEnd; c++) {
          record(r, c);
        }
      }

      runStart = runEnd; // jump past this run
    }
  }

  // Vertical sweep
  for (let c = 0; c < cols; c++) {
    let runStart = 0;
    while (runStart < rows) {
      const emoji = board[runStart][c];

      if (emoji === null) {
        runStart++;
        continue;
      }

      let runEnd = runStart + 1;
      while (runEnd < rows && board[runEnd][c] === emoji) {
        runEnd++;
      }

      const runLength = runEnd - runStart;
      if (runLength >= 3) {
        for (let r = runStart; r < runEnd; r++) {
          record(r, c);
        }
      }

      runStart = runEnd;
    }
  }

  // Convert "r,c" strings back to {row, col} objects.
  return [...matchSet].map((key) => {
    const [r, c] = key.split(",").map(Number);
    return { row: r, col: c };
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3 — REMOVAL
// ═══════════════════════════════════════════════════════════════

/**
 * removeMatches
 * Sets each matched cell to null on a cloned board.
 * Does NOT mutate the input.
 *
 * @param {Array<Array<string|null>>} board
 * @param {Array<{row: number, col: number}>} matches — output of findMatches
 * @returns {Array<Array<string|null>>} new board with nulls where matches were
 */
function removeMatches(board, matches) {
  const next = cloneBoard(board);
  for (const { row, col } of matches) {
    next[row][col] = null;
  }
  return next;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4 — GRAVITY
// ═══════════════════════════════════════════════════════════════

/**
 * applyGravity
 * Simulates gravity: non-null emojis fall to the bottom of each
 * column; nulls (empty cells) rise to the top.
 *
 * Operates column-by-column using a compact pointer technique:
 *  - Collect non-null cells from bottom to top.
 *  - Re-fill the column bottom-to-top with those cells.
 *  - Any remaining positions at the top become null.
 *
 * @param {Array<Array<string|null>>} board
 * @returns {Array<Array<string|null>>} new board after gravity
 */
function applyGravity(board) {
  const rows = board.length;
  const cols = board[0].length;
  const next = cloneBoard(board);

  for (let c = 0; c < cols; c++) {
    // Collect non-null emojis from bottom to top (preserve visual order).
    const nonNull = [];
    for (let r = rows - 1; r >= 0; r--) {
      if (next[r][c] !== null) {
        nonNull.push(next[r][c]);
      }
    }

    // Write non-null values back from bottom of the column.
    for (let r = rows - 1; r >= 0; r--) {
      const val = nonNull[rows - 1 - r];
      next[r][c] = val !== undefined ? val : null;
    }
  }

  return next;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5 — REFILL
// ═══════════════════════════════════════════════════════════════

/**
 * refillBoard
 * Fills every null cell with a random emoji from the pool.
 * Nulls should only exist at the top of columns after gravity,
 * but this function is defensive and fills any null it finds.
 *
 * @param {Array<Array<string|null>>} board
 * @param {string[]} emojiPool — emoji list provided by M1
 * @returns {Array<Array<string|null>>} fully populated board
 */
function refillBoard(board, emojiPool = DEFAULT_EMOJI_POOL) {
  const next = cloneBoard(board);
  for (let r = 0; r < next.length; r++) {
    for (let c = 0; c < next[0].length; c++) {
      if (next[r][c] === null) {
        next[r][c] = getRandomEmoji(emojiPool);
      }
    }
  }
  return next;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6 — CASCADE RESOLUTION
// ═══════════════════════════════════════════════════════════════

/**
 * resolveBoard
 * Repeatedly detects matches, removes them, applies gravity, and
 * refills until the board is stable (no matches remain).
 * Accumulates score and tracks animation steps for M1.
 *
 * Each cascade wave is one "step" in the returned steps array,
 * giving M1 everything it needs to animate a chain reaction.
 *
 * @param {Array<Array<string|null>>} board  — starting board (post-swap)
 * @param {string[]} emojiPool              — from M1
 * @returns {{
 *   board: Array<Array<string|null>>,
 *   totalScore: number,
 *   steps: Array<{
 *     matches: Array<{row,col}>,
 *     boardAfterRemoval: Array<Array<string|null>>,
 *     boardAfterGravity: Array<Array<string|null>>,
 *     boardAfterRefill: Array<Array<string|null>>,
 *     scoreEarned: number
 *   }>
 * }}
 */
function resolveBoard(board, emojiPool = DEFAULT_EMOJI_POOL) {
  let current = cloneBoard(board);
  let totalScore = 0;
  const steps = [];

  while (true) {
    const matches = findMatches(current);
    if (matches.length === 0) break; // Board is stable — stop cascading.

    const scoreEarned = calculateScore(matches);
    totalScore += scoreEarned;

    const boardAfterRemoval = removeMatches(current, matches);
    const boardAfterGravity = applyGravity(boardAfterRemoval);
    const boardAfterRefill = refillBoard(boardAfterGravity, emojiPool);

    steps.push({
      matches,
      boardAfterRemoval,
      boardAfterGravity,
      boardAfterRefill,
      scoreEarned,
    });

    current = boardAfterRefill;
  }

  return { board: current, totalScore, steps };
}

// ═══════════════════════════════════════════════════════════════
// SECTION 7 — SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════

/**
 * calculateScore
 * Groups matched cells by their contiguous run and assigns points
 * according to the length tier.
 *
 * Scoring tiers:
 *  - 3-match  = 10 pts
 *  - 4-match  = 20 pts
 *  - 5+ match = 50 pts
 *
 * Strategy: Re-detect horizontal and vertical runs inside the
 * provided match set rather than re-scanning the full board.
 * This gives accurate group sizes even for L/T-shaped combos.
 *
 * @param {Array<{row: number, col: number}>} matches
 * @returns {number} total score earned
 */
function calculateScore(matches) {
  if (matches.length === 0) return 0;

  // Build a quick lookup for O(1) membership tests.
  const matchSet = new Set(matches.map(({ row, col }) => `${row},${col}`));
  const has = (r, c) => matchSet.has(`${r},${c}`);

  // Track which cells have already been assigned to a scored group.
  const scored = new Set();
  let total = 0;

  /**
   * scoreGroup — return points for one contiguous run of `length`.
   */
  const scoreGroup = (length) => {
    if (length >= 5) return SCORE_5_PLUS;
    return SCORE_TABLE[length] ?? SCORE_TABLE[3]; // default to 3-match score
  };

  // Score horizontal groups
  for (const { row, col } of matches) {
    // Only start a new H-group from its leftmost cell.
    if (scored.has(`${row},${col}`)) continue;
    if (has(row, col - 1)) continue; // not the leftmost

    let length = 1;
    while (has(row, col + length)) length++;

    if (length >= 3) {
      for (let k = 0; k < length; k++) scored.add(`${row},${col + k}`);
      total += scoreGroup(length);
    }
  }

  // Score vertical groups
  for (const { row, col } of matches) {
    if (scored.has(`${row},${col}`)) continue;
    if (has(row - 1, col)) continue; // not the topmost

    let length = 1;
    while (has(row + length, col)) length++;

    if (length >= 3) {
      for (let k = 0; k < length; k++) scored.add(`${row + k},${col}`);
      total += scoreGroup(length);
    }
  }

  // Any remaining cells (corner-shared combos) get 3-match pts
  for (const { row, col } of matches) {
    if (!scored.has(`${row},${col}`)) {
      total += SCORE_TABLE[3];
    }
  }

  return total;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 8 — DEADLOCK DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * hasValidMoves
 * Returns true if at least one adjacent swap on the board would
 * create a match of 3 or more. Returns false when the board is
 * fully deadlocked (no playable move exists).
 *
 * Algorithm:
 *  1. Try every horizontal swap (cell ↔ right neighbour).
 *  2. Try every vertical swap   (cell ↔ lower neighbour).
 *  3. Short-circuit and return true the moment a match is found.
 *
 * Complexity: O(rows × cols) trial swaps, each O(rows + cols)
 * to scan — fast enough to run after every board settle.
 *
 * @param {Array<Array<string|null>>} board
 * @returns {boolean}
 */
function hasValidMoves(board) {
  const rows = board.length;
  const cols = board[0].length;

  // Helper: swap two cells on a fresh clone and check for matches.
  const trialSwap = (r1, c1, r2, c2) => {
    const trial = cloneBoard(board);
    const tmp = trial[r1][c1];
    trial[r1][c1] = trial[r2][c2];
    trial[r2][c2] = tmp;
    return findMatches(trial).length > 0;
  };

  // Horizontal pairs: (r, c) ↔ (r, c+1)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (trialSwap(r, c, r, c + 1)) return true;
    }
  }

  // Vertical pairs: (r, c) ↔ (r+1, c)
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (trialSwap(r, c, r + 1, c)) return true;
    }
  }

  return false; // Board is deadlocked
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export {
  findMatches,
  removeMatches,
  applyGravity,
  refillBoard,
  resolveBoard,
  calculateScore,
  cloneBoard,
  getRandomEmoji,
  boardHasMatches,
  hasValidMoves,
  DEFAULT_EMOJI_POOL,
};
