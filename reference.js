// Reference is used to turn text into row/column indexes and manipulate them.
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