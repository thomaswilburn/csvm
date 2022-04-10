export class Reference {
  constructor(address) {
    this.sheet = "";
    this.column = 1;
    this.row = 1;
    this.columns = 1;
    this.rows = 1;
    this.data = [];
    this.address = "";
    if (address) {
      this.setAddress(address);
    }
  }

  setAddress(address) {
    address = address.trim();
    var sheetRE = /^(?:(?<sheet>\w+)!)?/i;
    var sheetMatch = address.match(sheetRE);
    if (sheetMatch && sheetMatch.groups.sheet) {
      address.replace(sheetRE, "");
      this.sheet = sheetMatch.groups.sheet;
    }
    var isR1C1 = /^(r\d+c\d+|r\[-?\d+\]c\[-?\d+\])$/i;
    var pair = address.split(":");
    if (pair.length > 1) {
      var typed = pair.map(p => isR1C1.test(p));
      if (typed[0] != typed[1]) throw new Error(`Cannot mix A1 and R1C1 notation in address: ${address}`);
    }
    var parsed = pair.map(c => isR1C1.test(c) ? this.parseR1C1(c) : this.parseA1(c));
    var [ a, b ] = parsed;
    this.row = a.row;
    this.column = a.column;
    if (b) {
      this.column = Math.min(a.column, b.column);
      this.row = Math.min(a.row, b.row);
      this.columns += Math.max(a.column, b.column) - this.column;
      this.rows += Math.max(a.row, b.row) - this.row;
    }
    return this;
  }

  parseA1(cell) {
    var re = /^(?<column>[a-z]+)(?<row>\d+)$/i;
    var match = cell.match(re);
    if (!match) throw new Error(`Couldn't parse A1-style cell address ${cell}`);
    var { column, row } = match.groups;
    column = this.convertColumn(column);
    row = Number(row);
    return { column, row };
  }

  parseR1C1(cell) {
    var isRelative = cell.includes("[");
    var re = /^r\[?(?<row>-?\d+)\]?c\[?(?<column>-?\d+)\]?$/i
    var match = cell.match(re);
    if (!match) throw new Error(`Couldn't parse R1C1-style cell address ${cell}`);
    var { column, row } = match.groups;
    column = Number(column);
    row = Number(row);
    if (isRelative) {
      column += this.column;
      row += this.row;
    }
    return { column, row };
  }

  convertColumn(column) {
    var letters = column.split("").reverse();
    var result = 0;
    for (var i = 0; i < letters.length; i++) {
      var l = letters[i].toLowerCase();
      var code = l.charCodeAt() - 96;
      var place = 26 ** i;
      result += code * place;
    }
    return result;
  }

  *[Symbol.iterator]() {
    for (var y = 1; y <= this.rows; y++) {
      for (var x = 1; x <= this.columns; x++) {
        var row = y - 1 + this.row;
        var column = x - 1 + this.column;
        yield { row, column, x, y };
      }
    }
  }

}

export class Range {
  constructor(width = 1, height = 1) {
    this.columns = width;
    this.rows = height;
    this.protected = new Set();
    this.data = new Map();
  }

  key(c, r) {
    return c + ":" + r;
  }

  cell(c, r, v) {
    // for now, you can ask for a range outside the sheet, you just won't get anything
    if (c > this.columns) return undefined; //throw new Error("Out of bounds error");
    if (r > this.rows) this.rows = r;
    var key = this.key(c, r);
    if (typeof v == "undefined") {
      return this.data.get(key);
    } else {
      this.data.set(key, v);
    }
  }

  *[Symbol.iterator]() {
    for (var r = 1; r <= this.rows; r++) {
      for (var c = 1; c <= this.columns; c++) {
        yield {
          column: c,
          row: r,
          value: this.data.get(this.key(c, r))
        };
      }
    }
  }

  selectAll() {
    var ref = new Reference();
    ref.rows = this.rows;
    ref.columns = this.columns;
    return ref;
  }

  copy(ref = this.selectAll()) {
    if (typeof ref == "string") {
      ref = new Reference(ref);
    }
    var data = [];
    var copy = new Range(ref.columns, ref.rows);
    for (var cell of ref) {
      copy.cell(cell.x, cell.y, this.cell(cell.column, cell.row));
    }
    return copy;
  }

  values(data) {
    if (data) {
      data.forEach((value, index) => {
        var c = (index % this.columns) + 1;
        var r = Math.floor(index / this.columns) + 1;
        this.cell(c, r, value);
      });
      return this;
    } else {
      data = [];
      for (var cell of this) {
        data.push(cell.value);
      }
      return data;
    }
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

  print() {
    console.log(`${this.reference && this.reference.address || "Range"} (${this.columns}x${this.rows})`);
    var data = this.values();
    var rows = [];
    for (var i = 0; i < data.length; i += this.columns) {
      rows.push(data.slice(i, i + this.columns).map(v => typeof v == "undefined" ? "" : String(v)));
    }
    var columnWidths = new Array(this.columns).fill(0).map((a, i) => {
      return Math.max(...rows.map(r => r[i].length))
    });
    for (var i = 0; i < data.length; i += this.columns) {
      var row = data.slice(i, i + this.columns);
      var out = [];
      for (var c = 0; c < this.columns; c++) {
        out.push(String(row[c] || "").padStart(columnWidths[c], " "));
      }
      console.log(`[ ${out.join(" | ")} ]`);
    }
  }

}

export class Sheet extends Range {
  constructor(a, b) {
    if (typeof a == "string") {
      a = new Reference(a);
    }
    if (a instanceof Reference) {
      super(a.columns, a.rows);
    } else {
      super(a, b);
    }
    this.protected = new Set();
  }

  setProtected(ref, protect = true) {
    if (typeof ref == "string") {
      ref = new Reference(ref);
    }
    for (var { column, row } of ref) {
      var k = this.key(column, row);
      this.protected[protect ? "add" : "delete"](k);
    };
  }

  cell(c, r, v) {
    var k = this.key(c, r);
    if (v && this.protected.has(k)) return;
    return super.cell(c, r, v);
  }
}

var s = new Sheet(3, 4);

s.paste([1, 2, 3], "A1:C1");
s.paste([4, 5, 6, 7], "A2:B3");
s.paste([1, 2, 3, 4, 5], "A1:C2");
s.setProtected("A1:C1");

s.print();

var r = s.copy(new Reference("A1:C2").setAddress("R[1]C[1]"));
r.print();

var r2 = new Range(2, 2).values([1, 2, 3, 4]);
r2 = r2.copy();
r2.print();

r.paste(r2, (a, b) => a && b && a * b);
r.print();

s.paste(r, "A1:B2");
s.print();

s.paste(r2, new Reference("A1:B2").setAddress("R[1]C[1]"));
s.print();
s.paste(r2, "B2:C3", (a, b) => a && b && a * b);
s.print();