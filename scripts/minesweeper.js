const EMPTY = 'empty';
const UNKNOWN = 'unknown';
const FLAG = 'flag';
const MINE = 'mine';
const EXPLODED = 'exploded';
const MARKED = 'marked';
const SUCCESS = 'success';

// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
const MAIN_MOUSE_BUTTON = 0;
const SECONDARY_MOUSE_BUTTON = 2;

const format = timeInSeconds => {
  const minutes = String(Math.floor(timeInSeconds / 60));
  const seconds = String(timeInSeconds % 60);
  const pad = input => input.length === 1 ? `0${input}` : input;

  return `${pad(minutes)}:${pad(seconds)}`;
};

class Game extends Grid {
    constructor() {
        let rows;
        let columns;
        let mineCount;

        const urlParams = new URLSearchParams(window.location.search);
        const difficulty = urlParams.get('difficulty') || localStorage.getItem('minesweeper:difficulty') || 'easy';

        // persist difficulty
        localStorage.setItem('minesweeper:difficulty', difficulty);

        switch (difficulty) {
            case 'medium':
                rows = 16;
                columns = 16;
                mineCount = 40;
                break;
            case 'hard':
                rows = 30;
                columns = 16;
                mineCount = 99;
                break;
            case 'easy':
                rows = 10;
                columns = 10;
                mineCount = 10;
        }

        super(rows, columns);

        // can't access `this` until after calling parent constructor
        this.mineCount = mineCount;
        this.difficulty = difficulty;

        // Set up grid that persists state of mines/clues
        this.mineGrid = Array(columns).fill().map(_ => Array(rows).fill());

        // bind context variable to the current Game() object
        // for each of these global handlers/interval
        const grid = document.querySelector('#grid');

        grid.addEventListener('touchstart', this.onTouchStart.bind(this));
        grid.addEventListener('touchend', this.onTouchEnd.bind(this));
        grid.addEventListener('mousedown', this.onMouseDown.bind(this));
        grid.addEventListener('mouseup', this.onMouseUp.bind(this));
        grid.addEventListener('touchmove', this.onTouchMove.bind(this));

        // prevent right-click context menu on the game board
        grid.addEventListener('contextmenu', e => e.preventDefault());

        // store ref to the reset button (also changes content based on player actions)
        this.button = document.querySelector('#face');
        this.button.addEventListener('click', this.reset.bind(this));

        document.querySelector('#settings')
            .addEventListener('click', e => {
                window.location = 'settings.html';
            });

        // store ref to the flag counter
        this.flagCountDisplay = document.querySelector('#flags');

        // run any logic tests
        this.test();

        this.initHighScores();

        // set up initial game state
        this.reset();
    }

    reset() {
        this.gameOver = false;

        let nextState = this.currentState;

        // set initial background
        nextState = this.fill(nextState, UNKNOWN);

        // do initial draw
        this.render(nextState);

        // reset state of mines
        this.mineGrid = this.fill(this.mineGrid, EMPTY);

        this.flagCount = this.mineCount;
        this.flagCountDisplay.textContent = `left:${this.flagCount}`;

        let placedMines = 0;
        while (placedMines < this.mineCount) {
            let point = this.randomPoint();

            if (this.mineGrid[point.x][point.y] === EMPTY) {
                this.mineGrid[point.x][point.y] = MINE;
                placedMines += 1;
            }
        }

        // Set up hints by checking the 8 adjacent spaces
        for (let y = 0; y < this.rows; y += 1) {
            for (let x = 0; x < this.columns; x += 1) {

                // Don't overwrite mines
                if (this.mineGrid[x][y] === MINE) {
                    continue;
                }

                // Find the number of mines contained in neighboring cells
                let hintValue = this.getNeighbors(x, y).filter(({ x, y }) => this.mineGrid[x][y] === MINE).length;
                // convert the number to a string value
                let hintString = ['empty', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

                this.mineGrid[x][y] = hintString[hintValue];
            }
        }

        // debug -- display contents of mineGrid (mines/hints)
        // this.render(this.mineGrid);

        // Reset the button to a happy face!
        this.button.textContent = '😃';

        this.stopTimer();
        this.resetTimer();
    }

    initHighScores() {
        if (!localStorage.getItem('minesweeper:highScores')) {
            localStorage.setItem('minesweeper:highScores', JSON.stringify({
                'easy': { timeInSeconds: null, timestamp: null },
                'medium': { timeInSeconds: null, timestamp: null },
                'hard': { timeInSeconds: null, timestamp: null }
            }));
        }
    }

    saveHighScore() {
        // save high score/fastest time
        let highScores = JSON.parse(localStorage.getItem('minesweeper:highScores'));

        let currentBest = highScores[this.difficulty];

        if (!currentBest.timeInSeconds || this.timeInSeconds <= currentBest.timeInSeconds) {
            highScores[this.difficulty] = { timeInSeconds: this.timeInSeconds, timestamp: Date.now() };

            localStorage.setItem('minesweeper:highScores', JSON.stringify(highScores));
        }
    }

    getNeighbors(x, y) {
        return [
            // previous row
            { x: x - 1, y: y - 1 },
            { x: x, y: y - 1 },
            { x: x + 1, y: y - 1 },
            // current row
            { x: x - 1, y: y },
            // {x: x, y: y},
            { x: x + 1, y: y },
            // next row
            { x: x - 1, y: y + 1 },
            { x: x, y: y + 1 },
            { x: x + 1, y: y + 1 },
        ].filter(point => this.withinBounds(point));
    }

    onTouchStart(event) {
        if (this.gameOver) {
          return;
        }

        if (event.touches.length > 1) {
          // user is trying to use multi-touch; cancel any game input
          this.cancelTouch = true;

          // cancel any pending game action
          window.clearTimeout(this.touchTimeout);

          return;
        }

        const tapped = {
          x: parseInt(event.target.dataset.x, 10),
          y: parseInt(event.target.dataset.y, 10)
        };

        this.button.textContent = '😮';

        this.touchStartTime = Date.now();

        this.touchTimeout = window.setTimeout(() => {
          // NOTE: these next two methods are order dependent

          // on mobile, we want special behavior if user taps & holds on a revealed hint
          this.revealNeighbors(tapped);

          // this method will return early if the tapped cell is already revealed
          this.action(tapped);
        }, 250);
    }

    onTouchMove(event) {
      if (this.gameOver || this.cancelTouch) {
        return;
      }

      // cancel any pending game action
      // user is probably trying to pan/scroll
      window.clearTimeout(this.touchTimeout);

      this.cancelTouch = true;
    };

    onTouchEnd(event) {
      // Player lifted their finger; allow touches with next interaction
      if (this.cancelTouch && event.touches.length === 0) {
        this.cancelTouch = false;
        return;
      }

      if (this.gameOver || this.cancelTouch) {
        return;
      }

      this.button.textContent = '😃';

      const tapped = {
        x: parseInt(event.target.dataset.x, 10),
        y: parseInt(event.target.dataset.y, 10)
      };

      // if user lifts finger before the `touchTimeout` (set in `onTouchStart`) fires,
      // then clear it out to prevent it running
      window.clearTimeout(this.touchTimeout);

      const delta = Date.now() - this.touchStartTime;

      if (delta < 250) {
        this.toggleFlag(tapped);
      }
    }

    onMouseDown(event) {
        event.preventDefault();

        if (this.gameOver) {
            return;
        }

        if (event.button === MAIN_MOUSE_BUTTON) {
            this.button.textContent = '😮';
        }
    }

    onMouseUp(event) {
        event.preventDefault();

        if (this.gameOver) {
            return;
        }

        // TODO: clicking & dragging can produce NaN here
        const clicked = {
            x: parseInt(event.target.dataset.x, 10),
            y: parseInt(event.target.dataset.y, 10)
        };

        if (event.button === MAIN_MOUSE_BUTTON) {
            this.button.textContent = '😃';

            this.action(clicked);
        } else {
            this.toggleFlag(clicked);
        }
    }

    action({ x, y }) {
        this.startTimer();

        // don't do anything if cell contents are revealed
        if (this.state[x][y] !== UNKNOWN) {
            return;
        }

        let nextState = this.currentState;

        // o no, u clicked a mine
        if (this.mineGrid[x][y] === MINE) {
            this.lose({ x, y }, nextState);
        } else {
            // TODO: this works by reference
            this.reveal({ x, y }, nextState);
        }

        // update display
        this.render(nextState);

        // did we win?
        this.checkWinCondition();
    }

    toggleFlag({ x, y }) {
        // don't do anything if cell contents are revealed
        if (this.state[x][y] !== UNKNOWN &&
            this.state[x][y] !== FLAG) {
            return;
        }

        let nextState = this.currentState;

        // toggle flag in this cell
        if (this.state[x][y] === FLAG) {
            nextState[x][y] = UNKNOWN;
            this.flagCount += 1;
        } else {
            // You placed too many flags!
            if (this.flagCount === 0) {
                return;
            }

            nextState[x][y] = FLAG;
            this.flagCount -= 1;
        }

        this.flagCountDisplay.textContent = `left:${this.flagCount}`;

        // update display
        this.render(nextState);
    }

    // recursive function that will reveal as much of the game board
    // as possible if player clicks on an empty cell
    reveal({ x, y }, nextState) {

        // if this space has already been revealed, then stop
        if (nextState[x][y] !== UNKNOWN) {
            return;
        }

        // reveal the space
        nextState[x][y] = this.mineGrid[x][y];

        // if this space is a hint, then stop
        if (nextState[x][y] !== EMPTY) {
            return;
        }

        // otherwise, since the cell is empty, we check
        // all 8 neighbors for more empty cells
        this.getNeighbors(x, y).forEach(neighbor => {
            this.reveal(neighbor, nextState);
        });
    }

    // this method is specifically for mobile players so they can quickly reveal
    // multiple neighboring cells without tapping & holding repeatedly
    // Tap & hold on a revealed hint will then reveal all neighboring cells that
    // aren't marked with flags
    revealNeighbors({ x, y }) {
        if (this.gameOver) {
            return;
        }

        // don't do anything unless cell contents are a hint
        if (this.displayState[x][y] >= UNKNOWN) {
            return;
        }

        let nextState = this.currentState;

        this.getNeighbors(x, y).forEach(neighbor => {
            // this method will return early if already a hint
            this.reveal(neighbor, nextState);

            // check if any of the immediate neighbors is a mine
            // extract the "lose" logic and call it here
            if (nextState[neighbor.x][neighbor.y] === MINE) {
                this.lose({ x: neighbor.x, y: neighbor.y }, nextState);
            }
        });

        // update display
        this.render(nextState);

        // this needs to run _after_ the display is updated, as we check
        // the status of the most recent move
        this.checkWinCondition();
    }

    startTimer() {
        // only init timer once
        if (this.timerInterval) {
            return;
        }

        const timerRef = document.querySelector('#timer');

        this.timerInterval = window.setInterval(() => {
            // attempt to fix an issue in Mobile Safari
            // where interval is not actually cleared
            if (this.gameOver) {
                this.stopTimer();
                return;
            }

            this.timeInSeconds += 1;
            timerRef.textContent = format(this.timeInSeconds);
        }, 1000);
    }

    stopTimer() {
        window.clearInterval(this.timerInterval);

        // timerInterval still stores the integer ID; clear it out
        // so if the player resets, the timer will start again
        this.timerInterval = null;
    }

    resetTimer() {
        this.timeInSeconds = 0;
        const timerRef = document.querySelector('#timer');
        timerRef.textContent = format(this.timeInSeconds);
    }

    lose({ x, y }, nextState) {
        this.stopTimer();

        // show all mines in the level
        for (let x = 0; x < this.columns; x += 1) {
            for (let y = 0; y < this.rows; y += 1) {
                if (this.mineGrid[x][y] === MINE) {
                    // if player marked the mine with a flag, show
                    // they got that one right
                    if (nextState[x][y] === FLAG) {
                        nextState[x][y] = MARKED;
                    } else {
                        nextState[x][y] = MINE;
                    }
                }
            }
        }

        // highlight the one you clicked
        nextState[x][y] = EXPLODED;

        // show a sad face
        this.button.textContent = '😫';

        this.gameOver = true;
    }

    // compare state with mineGrid; if every space in
    // state is revealed except for mines, you win!
    checkWinCondition() {
        // search through state for unrevealed cells;
        for (let y = 0; y < this.rows; y += 1) {
            for (let x = 0; x < this.columns; x += 1) {
                const value = this.state[x][y];

                // if the cell is unrevealed, and _doesn't_ have a mine
                // in it, then the player hasn't won yet
                if ((value === UNKNOWN || value === FLAG) && this.mineGrid[x][y] !== MINE) {
                    return;
                }
            }
        }

        // if you got here, you won!
        this.gameOver = true;

        let nextState = this.currentState;

        // highlight all the correctly avoided mines in the level
        for (let y = 0; y < this.rows; y += 1) {
            for (let x = 0; x < this.columns; x += 1) {
                if (this.mineGrid[x][y] === MINE) {
                    nextState[x][y] = SUCCESS;
                }
            }
        }

        this.render(nextState);

        this.button.textContent = '😎';
        this.flagCountDisplay.textContent = `left:0`;

        this.saveHighScore();
    }

    test() {
        const previousValues = [this.columns, this.rows];
        this.columns = 10;
        this.rows = 10;

        const stringify = point => `(${point.x},${point.y})`;

        console.assert(this.getNeighbors(0, 0).map(stringify).join(',') === '(1,0),(0,1),(1,1)', `getNeighbors(0,0) = ${this.getNeighbors(0, 0).map(stringify).join(',')}`);
        console.assert(this.getNeighbors(5, 5).map(stringify).join(',') === '(4,4),(5,4),(6,4),(4,5),(6,5),(4,6),(5,6),(6,6)', `getNeighbors(5, 5) = ${this.getNeighbors(5, 5).map(stringify).join(',')}`);
        console.assert(this.getNeighbors(9, 9).map(stringify).join(',') === '(8,8),(9,8),(8,9)', `getNeighbors(9, 9) = ${this.getNeighbors(9, 9).map(stringify).join(',')}`);

        [this.columns, this.rows] = previousValues;
    }
};
