const EMPTY = 0;
const UNKNOWN = 9;
const FLAG = 10;
const MINE = 11;
const EXPLODED = 12;
const MARKED = 13;
const SUCCESS = 14;

// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
const MAIN_MOUSE_BUTTON = 0;
const SECONDARY_MOUSE_BUTTON = 2;

const format = timeInSeconds => {
    const minutes = String(Math.floor(timeInSeconds / 60));
    const seconds = String(timeInSeconds % 60);
    const pad = input => input.length === 1 ? `0${input}` : input;

    return `${pad(minutes)}:${pad(seconds)}`;
};

/*
TODO
- [x] add service worker for offline access
- [x] add feature to reveal all unmarked neighbors when tap & hold on mobile
*/

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

        // our grid contains simple integers to represent game objects;
        // this map translates the numbers to a string, that can then be used as
        // human-readable reference or CSS class (for display purposes)
        this.cssClassMap = {
            0: 'empty',
            1: 'one',
            2: 'two',
            3: 'three',
            4: 'four',
            5: 'five',
            6: 'six',
            7: 'seven',
            8: 'eight',
            9: 'unknown',
            10: 'flag',
            11: 'mine',
            12: 'exploded',
            13: 'marked',
            14: 'success'
        };

        // Set up grid that persists state of mines/clues
        this.mineGrid = Array(columns).fill().map(_ => Array(rows).fill());

        // bind context variable to the current Game() object
        // for each of these global handlers/interval
        const grid = document.querySelector('#grid');

        grid.addEventListener('touchstart', this.onTouchStart.bind(this));
        grid.addEventListener('touchend', this.onTouchEnd.bind(this));
        grid.addEventListener('mousedown', this.onMouseDown.bind(this));
        grid.addEventListener('mouseup', this.onMouseUp.bind(this));

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

        let nextDisplayState = this.displayStateCopy();

        // set initial background
        nextDisplayState = this.fill(nextDisplayState, UNKNOWN);

        // do initial draw
        this.render(nextDisplayState);

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
                let hint = this.getNeighbors(x, y).filter(({ x, y }) => this.mineGrid[x][y] === MINE).length;

                this.mineGrid[x][y] = hint;
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
        // function to ensure that (x, y) coords are within our data structure
        const withinBounds = ({ x, y }) => x >= 0 && x < this.columns && y >= 0 && y < this.rows;

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
        ].filter(withinBounds);
    }

    onTouchStart(event) {
        event.preventDefault();

        const tapped = {
            x: parseInt(event.target.dataset.x, 10),
            y: parseInt(event.target.dataset.y, 10)
        };

        this.touchStartTime = Date.now();

        this.touchTimeout = window.setTimeout(event => {
            // the order in which these methods are called is important

            // on mobile, we want special behavior if user taps & holds on a revealed hint
            this.revealNeighbors(tapped);

            // this method will return early if the tapped cell is already revealed
            this.action(tapped);
        }, 250);
    }

    onTouchEnd(event) {
        event.preventDefault();

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

        if (event.button === MAIN_MOUSE_BUTTON) {
            this.button.textContent = '😮';
        }
    }

    onMouseUp(event) {
        event.preventDefault();

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
        if (this.gameOver) {
            return;
        }

        this.startTimer();

        // don't do anything if cell contents are revealed
        if (this.displayState[x][y] !== UNKNOWN) {
            return;
        }

        let nextDisplayState = this.displayStateCopy();

        // o no, u clicked a mine
        if (this.mineGrid[x][y] === MINE) {
            this.lose({ x, y }, nextDisplayState);
        } else {
            // TODO: this works by reference
            this.reveal({ x, y }, nextDisplayState);
        }

        // update display
        this.render(nextDisplayState);

        // did we win?
        this.checkWinCondition();
    }

    toggleFlag({ x, y }) {
        if (this.gameOver) {
            return;
        }

        // don't do anything if cell contents are revealed
        if (this.displayState[x][y] !== UNKNOWN &&
            this.displayState[x][y] !== FLAG) {
            return;
        }

        let nextDisplayState = this.displayStateCopy();

        // toggle flag in this cell
        if (this.displayState[x][y] === FLAG) {
            nextDisplayState[x][y] = UNKNOWN;
            this.flagCount += 1;
        } else {
            // You placed too many flags!
            if (this.flagCount === 0) {
                return;
            }

            nextDisplayState[x][y] = FLAG;
            this.flagCount -= 1;
        }

        this.flagCountDisplay.textContent = `left:${this.flagCount}`;

        // update display
        this.render(nextDisplayState);
    }

    // recursive function that will reveal as much of the game board
    // as possible if player clicks on an empty cell
    reveal({ x, y }, nextDisplayState) {

        // if this space has already been revealed, then stop
        if (nextDisplayState[x][y] !== UNKNOWN) {
            return;
        }

        // reveal the space
        nextDisplayState[x][y] = this.mineGrid[x][y];

        // if this space is a hint, then stop
        if (nextDisplayState[x][y] !== EMPTY) {
            return;
        }

        // otherwise, since the cell is empty, we check
        // all 8 neighbors for more empty cells
        this.getNeighbors(x, y).forEach(neighbor => {
            this.reveal(neighbor, nextDisplayState);
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

        let nextDisplayState = this.displayStateCopy();

        this.getNeighbors(x, y).forEach(neighbor => {
            // this method will return early if already a hint
            this.reveal(neighbor, nextDisplayState);

            // check if any of the immediate neighbors is a mine
            // extract the "lose" logic and call it here
            if (nextDisplayState[neighbor.x][neighbor.y] === MINE) {
                this.lose({ x: neighbor.x, y: neighbor.y }, nextDisplayState);
            }
        });

        // update display
        this.render(nextDisplayState);

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

    lose({ x, y }, nextDisplayState) {
        this.stopTimer();

        // show all mines in the level
        for (let x = 0; x < this.columns; x += 1) {
            for (let y = 0; y < this.rows; y += 1) {
                if (this.mineGrid[x][y] === MINE) {
                    // if player marked the mine with a flag, show
                    // they got that one right
                    if (nextDisplayState[x][y] === FLAG) {
                        nextDisplayState[x][y] = MARKED;
                    } else {
                        nextDisplayState[x][y] = MINE;
                    }
                }
            }
        }

        // highlight the one you clicked
        nextDisplayState[x][y] = EXPLODED;

        // show a sad face
        this.button.textContent = '😫';

        this.gameOver = true;
    }

    // compare displayState with mineGrid; if every space in
    // displayState is revealed except for mines, you win!
    checkWinCondition() {
        // search through displayState for unrevealed cells;
        for (let y = 0; y < this.rows; y += 1) {
            for (let x = 0; x < this.columns; x += 1) {
                const value = this.displayState[x][y];

                // if the cell is unrevealed, and _doesn't_ have a mine
                // in it, then the player hasn't won yet
                if ((value === UNKNOWN || value === FLAG) && this.mineGrid[x][y] !== MINE) {
                    return;
                }
            }
        }

        // if you got here, you win!

        let nextDisplayState = this.displayStateCopy();

        // highlight all the correctly avoided mines in the level
        this.mineGrid.forEach((row, x) => {
            row.forEach((column, y) => {
                if (this.mineGrid[x][y] === MINE) {
                    nextDisplayState[x][y] = SUCCESS;
                }
            })
        });

        this.render(nextDisplayState);

        this.stopTimer();
        this.button.textContent = '😎';
        this.flagCountDisplay.textContent = `left:0`;
        this.gameOver = true;

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
