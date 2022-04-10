export class Reference {
  constructor(address) {
    this.sheet = "";
    this.column = 1;
    this.row = 1;
    this.columns = 1;
    this.rows = 1;
    this.data = [];
    this.address = "";
    if (address) this.setAddress(address);
  }

  setAddress(address) {
    var re = /(?:(?<sheet>\w+)!)?(?<column>[a-z]+)(?<row>\d+)(?:\:(?<rangeColumn>[a-z]+)(?<rangeRow>\d+))?/i;
    var match = address.match(re);
    if (!match) throw new Error(`Unable to parse cell reference ${address}`);
    var { groups } = match;
    if (!groups.column || !groups.row) throw new Error(`Missing cell reference coordinate in ${address}`);
    if (groups.sheet) {
      this.sheet = groups.sheet
    };
    this.column = this.convertColumn(groups.column);
    this.row = Number(groups.row);
    this.columns = 1;
    this.rows = 1;
    if (groups.rangeRow || groups.rangeColumn) {
      if (!groups.rangeRow || !groups.rangeColumn) throw new Error(`Mangled range extent in ${address}`);
      var c = this.convertColumn(groups.rangeColumn);
      var r = Number(groups.rangeRow);
      if (c < this.column) {
        [this.column, c] = [c, this.column];
      }
      if (r < this.row) {
        [this.row, r] = [r, this.row];
      }
      this.columns = c - this.column + 1;
      this.rows = r - this.row + 1;
    }
    this.address = address;
    return this;
  }

  parseR1C1(r1c1) {
    var re = /r\[(?<rows>-?\d+)\]c\[(?<columns>-?\d+)\]/i;
    var match = r1c1.match(re);
    if (!match) throw new Error(`Unable to parse R1C1 reference ${r1c1}`);
    this.column += Number(match.groups.columns);
    this.row += Number(match.groups.rows);
    return this;
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

  forEach(fn) {
    for (var r = this.row; r < this.row + this.rows; r++) {
      for (var c = this.column; c < this.column + this.columns; c++) {
        fn(c, r);
      }
    }
  }

}

export class Range extends Array {
  constructor(width = 1, height = 1) {
    super(width * height);
    this.columns = width;
    this.rows = height;
    this.protected = new Set();
  }

  cellToIndex(c, r) {
    if (c > this.columns) return undefined;
    if (r > this.rows) return undefined;
    var x = c - 1;
    var y = r - 1;
    return x + (y * this.columns);
  }

  indexToCell(index) {
    var c = (index % this.columns) + 1;
    var r = ((index / this.columns) | 0) + 1
    return [c, r];
  }

  getCell(c, r) {
    var i = this.cellToIndex(c, r);
    return this[i];
  }

  setCell(c, r, v) {
    var i = this.cellToIndex(c, r);
    this[i] = v;
  }

  eachCell(fn) {
    for (var i = 0; i < this.length; i++) {
      var [c, r] = this.indexToCell(i);
      fn(c, r, this[i]);
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
    ref.forEach((c, r) => data.push(this.getCell(c, r)));
    var r = Range.from(data);
    r.columns = ref.columns;
    r.rows = ref.rows;
    r.reference = ref;
    return r;
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
      data = Range.from(data);
      data.columns = ref.columns;
      data.rows = ref.rows;
    }
    for (var r = 0; r < ref.rows; r++) {
      for (var c = 0; c < ref.columns; c++) {
        var v = data.getCell(c + 1, r + 1);
        if (special) {
          var over = this.getCell(c + ref.column, r + ref.row);
          v = special(over, v);
        }
        this.setCell(c + ref.column, r + ref.row, v);
      }
    }
  }

  print() {
    console.log(`${this.reference && this.reference.address || "Range"} (${this.columns}x${this.rows})`);
    var columnWidths = new Array(this.columns).fill(1);
    for (var i = 0; i < this.length; i++) {
      var c = i % this.columns;
      var len = String(this[i] || "").length;
      if (len > columnWidths[c]) columnWidths[c] = len;
    }
    for (var i = 0; i < this.length; i += this.columns) {
      var row = this.slice(i, i + this.columns);
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
    ref.forEach((c, r) => {
      var i = this.cellToIndex(c, r);
      this.protected[protect ? "add" : "delete"](i);
    });
  }

  setCell(c, r, v) {
    var i = this.cellToIndex(c, r);
    if (this.protected.has(i)) return;
    this[i] = v;
  }
}

var s = new Sheet(3, 4);

s.paste([1, 2, 3], "A1:C1");
s.paste([4, 5, 6, 7], "A2:B3");
s.paste([1, 2, 3, 4, 5], "A1:C2");
s.setProtected("A1:C1");

s.print();

var r = s.copy("B2:D3");
r.print();

var r2 = Range.from([1, 2, 3, 4]);
r2.rows = r2.columns = 2;
r2 = r2.copy();
r2.print();

r.paste(r2, (a, b) => a * b);
r.print();

s.paste(r, "A1:B2");
s.print();

s.paste(r2, "B2:C3");
s.print();
s.paste(r2, "B2:C3", (a, b) => a * b);
s.print();