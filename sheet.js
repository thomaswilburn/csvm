import { Reference } from "./reference.js";

export class Range {
  constructor(width = 1, height = 1) {
    this.columns = width;
    this.rows = height;
    // Map may seem inefficient but it's better for sparse data
    // It also plays nice with 1-indexed rows/columns
    this.data = new Map();
  }

  [Symbol.toPrimitive]() {
    return `Range[${this.columns}x${this.rows}]`;
  }

  key(c, r) {
    return c + ":" + r;
  }

  cell(c, r, v) {
    // for now, you can ask for a range outside the sheet, you just won't get anything
    if (c > this.columns) return undefined; //throw new Error("Out of bounds error");
    var key = this.key(c, r);
    if (typeof v == "undefined") {
      return this.data.get(key);
    } else {
      this.data.set(key, v);
      if (r > this.rows) this.rows = r;
    }
  }

  selectAll() {
    var ref = new Reference();
    ref.rows = this.rows;
    ref.columns = this.columns;
    return ref;
  }

  *[Symbol.iterator]() {
    for (var { column, row } of this.selectAll()) {
      var value = this.data.get(this.key(column, row));
      yield { column, row, value };
    }
  }

  /**
   * Gets or sets data as a flat array
   */
  values(data) {
    if (data) {
      this.data = new Map();
      // read 2D arrays as individual rows
      var index = 0;
      for (var value of data) {
        var c = (index % this.columns) + 1;
        var r = Math.floor(index / this.columns) + 1;
        this.cell(c, r, value);
        index++;
      }
      return this;
    } else {
      data = [...this].map(cell => cell.value);
      return data;
    }
  }

  /**
   * Gets or sets data as a 2D array of arrays
   * Useful because some inputs (e.g., parsed CSV) may have truncated rows
   * values() would require them to be padded to full length
   */
  grid(data) {
    if (data) {
      this.data = new Map();
      var r = 1;
      for (var row of data) {
        var c = 1;
        for (var cell of row) {
          this.cell(c++, r, cell);
        }
        r++;
      }
      return this;
    } else {
      data = this.values();
      var grid = [];
      for (var i = 0; i < data.length; i += this.columns) {
        grid.push(data.slice(i, i + this.columns));
      }
      return grid;
    }
  }

  /**
   * Creates a new range from a selection of data
   * @param {(Reference|string)} [ref] - The subset of data to copy
   * @param {function} [transform] - A hook to alter values on copy
   */
  copy(ref = this.selectAll(), transform) {
    if (typeof ref == "string") {
      ref = new Reference(ref);
    }
    var data = [];
    var copy = new Range(ref.columns, ref.rows);
    for (var { column, row, x, y } of ref) {
      var value = this.cell(column, row);
      if (transform) {
        value = transform(column, row, value, this);
      }
      copy.cell(x, y, value);
    }
    return copy;
  }

  /**
   * Mutates a range by applying values from another range
   * @param {(Reference|string)} [ref] - A Reference declaring where the data be applied.
   * @param {function} [special] - A function used to combine the data with existing values.
   */
  paste(data, ref, special) {
    if (!ref) {
      ref = this.selectAll();
    }
    if (typeof ref == "string") {
      ref = new Reference(ref);
    }
    if (typeof ref == "function") {
      special = ref;
      ref = this.selectAll();
    }
    if (!(data instanceof Range)) {
      var values = data;
      data = new Range(ref.columns, ref.rows);
      data.values(values);
    }

    for (var { column, row, x, y } of ref) {
      var v = data.cell(x, y);
      if (special) {
        var existing = this.cell(column, row);
        v = special(existing, v);
      }
      this.cell(column, row, v);
    }
  }

  clear(ref) {
    if (typeof ref == "string") {
      ref = new Reference(ref);
    }
    for (var { column, row } of ref) {
      var key = this.key(column, row);
      this.data.delete(key);
    }
  }

  print() {
    console.log(`${this.reference && this.reference.address || "Range"} (${this.columns}x${this.rows})`);
    var rows = this.grid().map(row => row.map(v => typeof v == "undefined" ? " " : String(v)));
    // in browsers, just use the built-in table
    if (globalThis.document) return console.table(rows);
    // in Node, render our own, more compact version
    var columnWidths = new Array(this.columns).fill(0).map((a, i) => {
      return Math.max(...rows.map(r => r[i].length))
    });
    for (var row of rows) {
      var out = [];
      for (var c = 0; c < this.columns; c++) {
        out.push(row[c].padStart(columnWidths[c], " "));
      }
      console.log(`[ ${out.join(" | ")} ]`);
    }
  }
}

// Sheet adds range protection, and will be subclassed for memory-mapping
// Sheets are also named, for reference by other sheets, and can dispatch events on change.
export class Sheet extends Range {
  constructor(name, a, b) {
    if (typeof a == "string") {
      a = new Reference(a);
    }
    if (a instanceof Reference) {
      super(a.columns, a.rows);
    } else {
      super(a, b);
    }
    this.name = name;
    this.protected = new Set();
  }

  setProtected(ref, lock = true) {
    if (typeof ref == "string") {
      ref = new Reference(ref);
    }
    for (var { column, row } of ref) {
      var k = this.key(column, row);
      this.protected[lock ? "add" : "delete"](k);
    };
  }

  cell(c, r, v) {
    var k = this.key(c, r);
    if (v && this.protected.has(k)) return;
    return super.cell(c, r, v);
  }
}