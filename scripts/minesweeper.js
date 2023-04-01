const EMPTY = 0;
const UNKNOWN = 9;
const FLAG = 10;
const MINE = 11;
const EXPLODED = 12;
const SUCCESS = 13;

const format = timeInSeconds => {
    const minutes = String(Math.floor(timeInSeconds / 60));
    const seconds = String(timeInSeconds % 60);
    const pad = input => input.length === 1 ? `0${input}` : input;

    return `${pad(minutes)}:${pad(seconds)}`;
};

/*
TODO
3. watch hash change for difficulty select (https://caniuse.com/?search=hash)
    -> dunno if this'll work, as the class constructor would have to be re-invoked
4. implement touch control
    -> change "click" to "mouseup" to differentiate between touch/mouse
5. Fix styling

Mobile control ideas:
  tap for flag, long tap to reveal
  pinch-to-zoom? tap and drag to show more of a larger board
*/

class Game extends Grid {
    constructor() {
        let rows;
        let columns;
        let mineCount;

        switch (window.location.hash) {
            case '#intermediate':
                rows = 16;
                columns = 16;
                mineCount = 40;
                break;
            case '#hard':
                rows = 30;
                columns = 16;
                mineCount = 99;
                break;
            default:
                rows = 10;
                columns = 10;
                mineCount = 10;
        }

        super(rows, columns);

        this.mineCount = mineCount;

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
            13: 'success'
        };

        // Set up grid that persists state of mines/clues
        this.mineGrid = Array(columns).fill().map(_ => Array(rows).fill());

        // bind context variable to the current Game() object
        // for each of these global handlers/interval
        const grid = document.querySelector('#grid');

        grid.addEventListener('touchend', this.onClick.bind(this));
        grid.addEventListener('click', this.onClick.bind(this));

        // intercept right clicks within the game board, but not the whole window
        grid.addEventListener('contextmenu', this.onRightClick.bind(this));

        // store ref to the reset button (also changes content based on player actions)
        this.button = document.querySelector('button.face');
        this.button.addEventListener('click', this.reset.bind(this));

        // store ref to the flag counter
        this.flagCountDisplay = document.querySelector('.flags');

        // run any logic tests
        this.test();

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
        this.flagCountDisplay.textContent = this.flagCount;

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

    onTouchEnd(e) {
        // TODO: fill this out
        // store local ref to last touch
        const endTouch = e.changedTouches[0];

        let xDiff = endTouch.clientX - this.currentTouch.clientX;
        let yDiff = endTouch.clientY - this.currentTouch.clientY;
    }

    // TODO: change this to mouseUp to allow face to change when clicking
    // 😮
    onClick(event) {
        event.preventDefault();

        if (this.gameOver) {
            return;
        }

        // TODO: clicking & dragging can produce NaN here
        const clicked = {
            x: parseInt(event.target.dataset.x, 10),
            y: parseInt(event.target.dataset.y, 10)
        };

        this.startTimer();

        // don't do anything if cell contents are revealed
        if (this.displayState[clicked.x][clicked.y] !== UNKNOWN) {
            return;
        }

        let nextDisplayState = this.displayStateCopy();

        // o no, u clicked a mine
        if (this.mineGrid[clicked.x][clicked.y] === MINE) {
            this.stopTimer();

            // show all mines in the level
            this.mineGrid.forEach((row, x) => {
                row.forEach((column, y) => {
                    if (this.mineGrid[x][y] === MINE) {
                        nextDisplayState[x][y] = MINE;
                    }
                })
            });

            // highlight the one you clicked
            nextDisplayState[clicked.x][clicked.y] = EXPLODED;

            // show a sad face
            this.button.textContent = '😫';

            this.gameOver = true;
        } else {
            // TODO: this works by reference
            this.reveal(clicked, nextDisplayState);
        }

        // update display
        this.render(nextDisplayState);

        // did we win?
        this.checkWinCondition();
    }

    onRightClick(event) {
        event.preventDefault();

        if (this.gameOver) {
            return;
        }

        const clicked = {
            x: parseInt(event.target.dataset.x, 10),
            y: parseInt(event.target.dataset.y, 10)
        };

        // don't do anything if cell contents are revealed
        if (this.displayState[clicked.x][clicked.y] !== UNKNOWN &&
            this.displayState[clicked.x][clicked.y] !== FLAG) {
            return;
        }

        let nextDisplayState = this.displayStateCopy();

        // toggle flag in this cell
        if (this.displayState[clicked.x][clicked.y] === FLAG) {
            nextDisplayState[clicked.x][clicked.y] = UNKNOWN;
            this.flagCount += 1;
        } else {
            // You placed too many flags!
            if (this.flagCount === 0) {
                return;
            }

            nextDisplayState[clicked.x][clicked.y] = FLAG;
            this.flagCount -= 1;
        }

        this.flagCountDisplay.textContent = this.flagCount;

        // update display
        this.render(nextDisplayState);
    }

    // recursive function that will reveal as much of the game board
    // as possible if player clicks on an empty cell
    reveal({ x, y }, nextDisplayGrid) {

        // if this space has already been revealed, then stop
        if (nextDisplayGrid[x][y] !== UNKNOWN) {
            return;
        }

        // reveal the space
        nextDisplayGrid[x][y] = this.mineGrid[x][y];

        // if this space is a hint, then stop
        if (nextDisplayGrid[x][y] !== EMPTY) {
            return;
        }

        // otherwise, since the cell is empty, we check
        // all 8 neighbors for more empty cells
        this.getNeighbors(x, y).forEach(neighbor => {
            this.reveal(neighbor, nextDisplayGrid);
        });
    }

    startTimer() {
        // only init timer once
        if (this.timerInterval) {
            return;
        }

        this.timeInSeconds = 0;
        const timerRef = document.querySelector('.timer');

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
        const timerRef = document.querySelector('.timer');
        timerRef.textContent = format(this.timeInSeconds);
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
        this.gameOver = true;
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
