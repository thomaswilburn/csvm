import { Sheet, Range } from "./sheet.js";
import { Reference } from "./reference.js";

// direct lookup keys for common known registers
const KEYS = {
  PC_COLUMN: "3:1",
  PC_ROW: "4:1",
  CLOCK: "5:1"
};

// Frame budget for CPU cycles
const FRAME_BUDGET = 4;

const instructions = `
copy
`.trim().split(/\s+/);

export class CSVM {
  constructor(program) {
    // bind some methods
    this.step = this.step.bind(this);
    this.copyTransform = this.copyTransform.bind(this);
    // create the CPU sheet
    var cpu = new Sheet("cpu", 8, 4);
    // define the first row - columns, rows, PC column, PC row, clock
    cpu.paste([8, 4, 1, 1, Date.now()], "R1C1:R1C8");
    // add I/O sheets
    // these should subclass Sheet, typically
    var stdout = new Sheet("stdout", 1, 1);
    // create the program sheet
    // TODO: load data for this sheet from the program
    var [ sentinel, width ] = program.shift();
    var data = new Sheet("data", width, program.length);
    data.values(program);
    this.sheets = { cpu, data, stdout };
    // start execution
    this.step();
  }

  /**
   * Range.copy() hook that dereferences addresses between sheets
   * TODO: this should throw if a reference expansion would overwrite data
   * TODO: define named ranges here and cache them for faster lookup
   */
  copyTransform(column, row, cellValue, target) {
    if (typeof cellValue == "string" && cellValue[0] == "=") {
      var address = cellValue.slice(1);
      var ref = Reference.at(column, row).setAddress(address);
      return ref;
    }
    return cellValue;
  }

  // TODO: this should probably loop as many times as it can in a given frame budget, say 4ms?
  step() {
    var { cpu, data } = this.sheets;
    data.print();
    var frame = Date.now();
    while (Date.now() < frame + FRAME_BUDGET) {
      // set the clock
      cpu.data.set(KEYS.CLOCK, Date.now());
      // get the current program counter directly
      var pcc = cpu.data.get(KEYS.PC_COLUMN);
      var pcr = cpu.data.get(KEYS.PC_ROW);
      var instruction = data.cell(pcc, pcr);
      if (!instruction) return this.exit(pcc, pcr);
      var method = this[instruction];
      if (!method) throw new Error(`No instruction matching opcode ${instruction}`);
      var paramRef = Reference.at(pcc + 1, pcr, method.length);
      var params = data.copy(paramRef, this.copyTransform);
      var jumped = method.call(this, ...params.values());
      if (!jumped) {
        // move to the next instruction
        cpu.data.set(KEYS.PC_ROW, pcr + 1);
      }
    }
    // TODO: run any I/O processes at the end of execution
    // TODO: set rAF for the next step()
  }

  exit(column, row) {
    // any cleanup goes here
    console.log(`Program completed at R${row}C${column}`);
    console.log("CPU memory dump follows:");
    this.sheets.cpu.print();
  }

  copy(from, to) {
    var data;
    if (from instanceof Reference) {
      var sheet = this.sheets[from.sheet || "data"];
      data = sheet.copy(from);
      data.name = "from";
    } else {
      data = new Array(to.columns * to.rows).fill(from);
    }
    var dest = this.sheets[to.sheet || "data"];
    dest.paste(data, to);
    console.log(`copy ${from} ${to}`);
  }
}