/**
 * gameLogic.js
 * ─────────────────────────────────────────────────────────────
 * High-level Match-3 game controller.
 *
 * Responsibilities:
 *  - Swap validation and execution
 *  - Turn timer management
 *  - Initial board generation (no pre-existing matches)
 *  - Composing the full move result for M1 (UI) and M3 (server)
 *
 * Depends on: matchEngine.js
 * No UI code. No network code. No external dependencies.
 * ─────────────────────────────────────────────────────────────
 */

import {
  cloneBoard,
  getRandomEmoji,
  findMatches,
  boardHasMatches,
  resolveBoard,
  hasValidMoves,
  DEFAULT_EMOJI_POOL,
} from "./matchEngine.js";

// ─── Timer configuration ─────────────────────────────────────
const TURN_DURATION_MS = 15_000; // 15 seconds per turn

// ─── Internal timer state (module-scoped, not global) ────────
let _timerHandle = null;      // setTimeout reference
let _timerStart = null;       // timestamp when timer was started
let _onTimeout = null;        // callback supplied by the caller

// ═══════════════════════════════════════════════════════════════
// SECTION 1 — ADJACENCY & SWAP VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * isAdjacent
 * Returns true when two cells share exactly one edge
 * (up / down / left / right). Diagonal neighbours are rejected.
 *
 * @param {number} row1
 * @param {number} col1
 * @param {number} row2
 * @param {number} col2
 * @returns {boolean}
 */
function isAdjacent(row1, col1, row2, col2) {
  const rowDelta = Math.abs(row1 - row2);
  const colDelta = Math.abs(col1 - col2);
  // Exactly one dimension differs by 1; the other must be 0.
  return (rowDelta === 1 && colDelta === 0) || (rowDelta === 0 && colDelta === 1);
}

/**
 * isValidSwap
 * A swap is valid when:
 *  1. Both positions are inside the board bounds.
 *  2. The two cells are orthogonally adjacent.
 *  3. Performing the swap produces at least one match.
 *
 * @param {Array<Array<string|null>>} board
 * @param {number} row1
 * @param {number} col1
 * @param {number} row2
 * @param {number} col2
 * @returns {boolean}
 */
function isValidSwap(board, row1, col1, row2, col2) {
  const rows = board.length;
  const cols = board[0].length;

  // Bounds check
  if (
    row1 < 0 || row1 >= rows || col1 < 0 || col1 >= cols ||
    row2 < 0 || row2 >= rows || col2 < 0 || col2 >= cols
  ) {
    return false;
  }

  // Adjacency check (no diagonal swaps allowed)
  if (!isAdjacent(row1, col1, row2, col2)) return false;

  // Perform a trial swap and check for matches.
  const trial = _performRawSwap(cloneBoard(board), row1, col1, row2, col2);
  return findMatches(trial).length > 0;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2 — SWAP MECHANIC
// ═══════════════════════════════════════════════════════════════

/**
 * _performRawSwap  (private)
 * Exchanges two cells in-place on an already-cloned board.
 * Never call this on the original board — clone first.
 *
 * @param {Array<Array<string|null>>} board — mutable clone
 * @param {number} row1
 * @param {number} col1
 * @param {number} row2
 * @param {number} col2
 * @returns {Array<Array<string|null>>} same (mutated) board
 */
function _performRawSwap(board, row1, col1, row2, col2) {
  const temp = board[row1][col1];
  board[row1][col1] = board[row2][col2];
  board[row2][col2] = temp;
  return board;
}

/**
 * swapEmojis
 * The primary public swap function called by M1.
 *
 * Workflow:
 *  1. Validate adjacency.
 *  2. Perform the swap on a clone.
 *  3. Run findMatches on the result.
 *  4a. If no match → revert and return an "invalid move" result.
 *  4b. If match → run resolveBoard (cascades) and return the
 *      full move result ready for M1 and M3.
 *
 * @param {Array<Array<string|null>>} board
 * @param {number} row1
 * @param {number} col1
 * @param {number} row2
 * @param {number} col2
 * @param {Object}  [options]
 * @param {string[]} [options.emojiPool]   — emoji list from M1
 * @param {number}   [options.totalScore]  — running player score
 * @returns {{
 *   board: Array<Array<string|null>>,
 *   scoreEarned: number,
 *   totalScore: number,
 *   validMove: boolean,
 *   nextTurn: boolean,
 *   gameOver: boolean,
 *   steps: Array   — cascade animation steps for M1
 * }}
 */
function swapEmojis(board, row1, col1, row2, col2, options = {}) {
  const { emojiPool = DEFAULT_EMOJI_POOL, totalScore = 0 } = options;

  // ── Guard: adjacency ─────────────────────────────────────────
  if (!isAdjacent(row1, col1, row2, col2)) {
    return _invalidMoveResult(board, totalScore, "Not adjacent");
  }

  // Bounds check
  const rows = board.length;
  const cols = board[0].length;
  if (
    row1 < 0 || row1 >= rows || col1 < 0 || col1 >= cols ||
    row2 < 0 || row2 >= rows || col2 < 0 || col2 >= cols
  ) {
    return _invalidMoveResult(board, totalScore, "Out of bounds");
  }

  // ── Perform swap on a clone ──────────────────────────────────
  const swapped = _performRawSwap(cloneBoard(board), row1, col1, row2, col2);

  // ── Validate: must produce at least one match ────────────────
  const immediateMatches = findMatches(swapped);
  if (immediateMatches.length === 0) {
    // No match — revert (return original board unchanged).
    return _invalidMoveResult(board, totalScore, "No match created");
  }

  // ── Resolve cascades ─────────────────────────────────────────
  const { board: resolvedBoard, totalScore: scoreEarned, steps } =
    resolveBoard(swapped, emojiPool);

  const newTotal = totalScore + scoreEarned;

  return {
    board: resolvedBoard,
    scoreEarned,
    totalScore: newTotal,
    validMove: true,
    nextTurn: true,   // Signal M3 to advance the turn
    gameOver: false,  // M3 decides game-over conditions
    steps,            // Animation frames for M1
    message: null,
  };
}

/**
 * _invalidMoveResult  (private)
 * Builds a consistent "bad move" response.
 *
 * @param {Array<Array<string|null>>} board — original, unchanged
 * @param {number} totalScore
 * @param {string} reason
 * @returns {Object}
 */
function _invalidMoveResult(board, totalScore, reason) {
  return {
    board,
    scoreEarned: 0,
    totalScore,
    validMove: false,
    nextTurn: false,
    gameOver: false,
    steps: [],
    message: `Invalid Move: ${reason}`,
  };
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3 — TURN TIMER
// ═══════════════════════════════════════════════════════════════

/**
 * startTurnTimer
 * Starts a 15-second countdown for the current player's turn.
 *
 * If a timer is already running it is cancelled before the new
 * one begins, preventing duplicate timeouts.
 *
 * When the timer expires, `onTimeout` is invoked with:
 *   { timedOut: true, elapsed: TURN_DURATION_MS }
 *
 * @param {Function} onTimeout — called when time runs out
 * @returns {{ cancel: Function, startedAt: number }}
 *   - cancel(): stops the timer without firing onTimeout
 *   - startedAt: Unix timestamp (ms) when the timer began
 */
function startTurnTimer(onTimeout) {
  // Cancel any existing timer first.
  stopTurnTimer();

  _timerStart = Date.now();
  _onTimeout = onTimeout;

  _timerHandle = setTimeout(() => {
    const elapsed = Date.now() - _timerStart;
    _timerHandle = null;
    _timerStart = null;
    _onTimeout = null;

    if (typeof onTimeout === "function") {
      onTimeout({ timedOut: true, elapsed });
    }
  }, TURN_DURATION_MS);

  return {
    /**
     * cancel — stop the timer without invoking the timeout callback.
     * Call this after a player completes their move successfully.
     */
    cancel: stopTurnTimer,
    startedAt: _timerStart,
  };
}

/**
 * stopTurnTimer
 * Cancels the running timer and clears all internal state.
 * Safe to call even when no timer is active.
 *
 * @returns {number|null} milliseconds elapsed since timer start,
 *                        or null if no timer was running.
 */
function stopTurnTimer() {
  if (_timerHandle === null) return null;

  clearTimeout(_timerHandle);
  const elapsed = _timerStart !== null ? Date.now() - _timerStart : null;

  _timerHandle = null;
  _timerStart = null;
  _onTimeout = null;

  return elapsed;
}

/**
 * getRemainingTime
 * Returns how many milliseconds remain in the current turn.
 * Returns 0 if no timer is active.
 *
 * @returns {number}
 */
function getRemainingTime() {
  if (_timerHandle === null || _timerStart === null) return 0;
  const elapsed = Date.now() - _timerStart;
  return Math.max(0, TURN_DURATION_MS - elapsed);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4 — BOARD GENERATION
// ═══════════════════════════════════════════════════════════════

/**
 * createInitialBoard
 * Generates a rows × cols board filled with random emojis.
 * Ensures no automatic matches exist on the starting board by
 * regenerating individual cells until they don't form part of
 * a match run. Uses a local "no-match" constraint during fill.
 *
 * Algorithm: fill cell-by-cell left-to-right, top-to-bottom.
 * Before placing an emoji, check it against the two cells to its
 * left (horizontal) and the two cells above (vertical). If it
 * would complete a run of 3, pick again from the pool.
 *
 * This is O(rows * cols) in practice (fast) and guarantees a
 * clean start without re-scanning the full board repeatedly.
 *
 * @param {number} rows
 * @param {number} cols
 * @param {string[]} [emojiPool]
 * @returns {Array<Array<string>>} fully populated, match-free board
 */
function createInitialBoard(rows, cols, emojiPool = DEFAULT_EMOJI_POOL) {
  // Initialise with nulls
  const board = Array.from({ length: rows }, () => Array(cols).fill(null));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Build the set of emojis that would cause an immediate match.
      const forbidden = new Set();

      // Two left-neighbours would make a horizontal triple.
      if (c >= 2 && board[r][c - 1] === board[r][c - 2]) {
        forbidden.add(board[r][c - 1]);
      }

      // Two above-neighbours would make a vertical triple.
      if (r >= 2 && board[r - 1][c] === board[r - 2][c]) {
        forbidden.add(board[r - 1][c]);
      }

      // Pick a random emoji not in the forbidden set.
      let emoji;
      let attempts = 0;
      const maxAttempts = emojiPool.length * 4;

      do {
        emoji = getRandomEmoji(emojiPool);
        attempts++;
        // Safety valve: if pool is too small, accept it and let
        // the post-generation clean-up handle any residual matches.
        if (attempts > maxAttempts) break;
      } while (forbidden.has(emoji));

      board[r][c] = emoji;
    }
  }

  // Post-generation safety: fix any matches that slipped through
  // (only happens with very small pools).
  return _cleanBoard(board, emojiPool);
}

/**
 * _cleanBoard  (private)
 * Scans the board for any remaining matches and replaces offending
 * cells one at a time until the board is fully clean.
 * Runs at most a bounded number of passes to prevent infinite loops.
 *
 * @param {Array<Array<string|null>>} board
 * @param {string[]} emojiPool
 * @returns {Array<Array<string|null>>}
 */
function _cleanBoard(board, emojiPool) {
  const MAX_PASSES = 20;
  let passes = 0;
  let working = cloneBoard(board);

  while (boardHasMatches(working) && passes < MAX_PASSES) {
    const matches = findMatches(working);
    for (const { row, col } of matches) {
      // Replace the cell with a random emoji until it no longer
      // causes a match (simple retry — terminates for pools >= 3).
      let attempts = 0;
      while (attempts < emojiPool.length * 3) {
        const candidate = getRandomEmoji(emojiPool);
        working[row][col] = candidate;
        // Re-check only this cell's neighbourhood.
        if (!_cellCausesMatch(working, row, col)) break;
        attempts++;
      }
    }
    passes++;
  }

  return working;
}

/**
 * _cellCausesMatch  (private)
 * Returns true if the emoji at (row, col) is part of a 3+ run
 * horizontally or vertically. Used during board cleaning to avoid
 * a full re-scan for every cell.
 *
 * @param {Array<Array<string>>} board
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
function _cellCausesMatch(board, row, col) {
  const emoji = board[row][col];
  if (emoji === null) return false;

  const rows = board.length;
  const cols = board[0].length;

  // Count consecutive same-emoji cells in one direction from (row, col).
  const count = (dr, dc) => {
    let n = 0;
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < rows && c >= 0 && c < cols && board[r][c] === emoji) {
      n++;
      r += dr;
      c += dc;
    }
    return n;
  };

  const horizontal = count(0, -1) + 1 + count(0, 1);
  const vertical = count(-1, 0) + 1 + count(1, 0);

  return horizontal >= 3 || vertical >= 3;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export {
  // Primary game actions
  swapEmojis,

  // Turn timer
  startTurnTimer,
  stopTurnTimer,
  getRemainingTime,

  // Board generation
  createInitialBoard,

  // Helpers (for M1/M3 convenience)
  isAdjacent,
  isValidSwap,

  // Re-export matchEngine essentials so M1/M3 only import from here
  DEFAULT_EMOJI_POOL,
  hasValidMoves,
};
