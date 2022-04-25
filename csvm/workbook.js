import { Reference } from "./workbook/reference.js";
import { Range } from "./workbook/range.js";
import { Sheet } from "./workbook/sheet.js";

export { Reference, Range, Sheet };

export class Workbook {
  constructor(sheets, home) {
    this.sheets = { ...sheets };
    this.home = home;
  }

  copy(reference, transform) {
    return this.sheets[reference.sheet || this.home].copy(reference, transform);
  }

  paste(value, reference, special) {
    return this.sheets[reference.sheet || this.home].paste(value, reference, special);
  }

  cell(reference, value) {
    return this.sheets[reference.sheet || this.home].cell(reference.column, reference.row, value)
  }

  clear(reference) {
    return this.sheets[reference.sheet || this.home].clear(reference);
  }

  getValues(v, bounds = new Reference()) {
    if (v instanceof Reference) {
      return this.copy(v).values();
    }
    return new Array(bounds.columns * bounds.rows).fill(v);
  }

  static onlyReference(r) {
    if (r instanceof Reference) return;
    throw new Error(`Expected Reference, got ${r}`);
  }

  static onlyValue(v) {
    if (v instanceof Object) throw new Error(`Expected value, got ${v}`);
  }
}