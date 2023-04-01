class Grid {
    // our grid contains simple integers to represent game objects;
    // this map translates the numbers to a string, that can then be used as
    // human-readable reference or CSS class (for display purposes)
    cssClassMap = {};

    constructor(rows, columns) {
        this.rows = rows;
        this.columns = columns;

        // set up 2D array to use as data store for game logic & display
        this.displayState = Array(rows).fill().map(_ => Array(columns).fill());

        // set up DOM references
        this.gridRef = Array(rows).fill().map(_ => Array(columns).fill());

        let boardRef = document.querySelector('#grid');

        this.displayState.forEach((row, x) => {
            row.forEach((column, y) => {
                // create a DOM node for each element in the backing array
                let node = document.createElement('div');

                // For games that use the mouse, set `data-` attributes
                // to easily reference the clicked node
                // NOTE: this is reversed, so we can manipulate our backing
                // 2D array in a more natural way (x,y) and have it displayed as expected
                node.dataset.x = y;
                node.dataset.y = x;

                // save a reference to the node, so it can be quickly updated later
                // NOTE: this is reversed, so we can manipulate our backing
                // 2D array in a more natural way (x,y) and have it displayed as expected
                this.gridRef[y][x] = node;

                // add the node to the actual page
                boardRef.appendChild(node);
            });
        });
    }

    render(nextDisplayState) {
        // enumerate through the current/new display state arrays to update the changed values
        this.displayState.forEach((row, x) => {
            row.forEach((column, y) => {
                if (this.displayState[x][y] === nextDisplayState[x][y]) {
                    return;
                }

                // update the CSS class of the cell 
                this.gridRef[x][y].classList = this.cssClassMap[nextDisplayState[x][y]];
            });
        });

        // set the next state as current state
        this.displayState = nextDisplayState;
    }

    // Returns a new object with the same structure/values as the current display state
    displayStateCopy() {
        return JSON.parse(JSON.stringify(this.displayState));
    }

    fill(grid, value) {
        return grid.map(row => row.fill(value));
    }

    randomPoint() {
        return {
            x: Math.floor(Math.random() * this.rows),
            y: Math.floor(Math.random() * this.columns)
        };
    }
}
