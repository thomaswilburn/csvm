// stdout is not really a sheet, but it acts like one and then logs all writes.

import { Range } from "./range.js";

var log = function(output) {
  if (output instanceof Range) {
    if (output.rows > 1 || output.columns > 1) {
      return output.print();
    } else {
      var [ value ] = output.values();
      return console.log(value);
    }
  }
  
  if (output[Symbol.iterator]) {
    for (var value of output) {
      console.log(value);
    }
    return;
  }

  console.log(output);
}

export default class StdOut {
  cell(c, r, v) {
    if (v) log(v);
  }

  copy() {
    return null;
  }

  paste(data) {
    log(data);
  }

}