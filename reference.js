// Reference is used to turn text into row/column indexes and manipulate them.
export class Reference {
  constructor(address, from) {
    this.sheet = from ? from.name : "";
    this.column = 1;
    this.row = 1;
    this.columns = 1;
    this.rows = 1;
    this.address = "";
    if (address) {
      this.setAddress(address);
    }
  }

  static at(column, row, width = 1, height = 1) {
    var ref = new Reference();
    ref.column = column;
    ref.row = row;
    ref.columns = width;
    ref.rows = height;
    ref.address = ref + "";
    return ref;
  }

  [Symbol.toPrimitive]() {
    var sheet = this.sheet ? this.sheet + "!" : "";
    var start = `R${this.row}C${this.column}`;
    var end = `R${this.row + this.rows - 1}C${this.column + this.columns - 1}`;
    return `=${sheet}${start}:${end}`;
  }

  setAddress(address) {
    address = address.trim();
    this.address = address;
    var sheetRE = /^(?:(?<sheet>\w+)!)?/i;
    var sheetMatch = address.match(sheetRE);
    if (sheetMatch && sheetMatch.groups.sheet) {
      address = address.replace(sheetRE, "");
      this.sheet = sheetMatch.groups.sheet;
    }
    var isR1C1 = /^r(\[-?\d+\]|\d+)c(\[-?\d+\]|\d+)$/i;
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
    var re = /^r(\[(?<rRow>-?\d+)\]|(?<aRow>-?\d+))c(\[?(?<rColumn>-?\d+)\]|(?<aColumn>-?\d+))$/i
    var match = cell.match(re);
    if (!match) throw new Error(`Couldn't parse R1C1-style cell address ${cell}`);
    var column = typeof match.groups.aColumn != "undefined" ?
      Number(match.groups.aColumn) : 
      Number(match.groups.rColumn) + this.column;
    var row = typeof match.groups.aRow != "undefined" ?
      Number(match.groups.aRow) : 
      Number(match.groups.rRow) + this.row;
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