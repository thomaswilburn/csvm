import { Reference } from "./reference.js";
import { Range } from "./range.js";
import { Sheet } from "./sheet.js";

export { Reference, Range, Sheet };

export class Workbook {
  constructor(sheets, home) {
    this.sheets = { ...sheets };
    this.home = home;
  }

  copy(reference) {
    return this.sheets[reference.sheet || this.home].copy(reference);
  }

  paste(value, reference) {
    return this.sheets[reference.sheet || this.home].paste(value, reference);
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
}