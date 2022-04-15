import { Reference } from "./reference.js";
import { Range } from "./range.js";

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