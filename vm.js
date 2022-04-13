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
clear copy 
`.trim().split(/\s+/);

console.table(Object.fromEntries(instructions.map((op, i) => [op, i])));

const DEFAULTS = {
  verbose: false
};

var tick = global.process ? global.process.nextTick : global.requestAnimationFrame;

export class CSVM {
  constructor(program, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    // bind some methods
    this.step = this.step.bind(this);
    this.copyTransform = this.copyTransform.bind(this);
    // create the CPU sheet
    var cpu = new Sheet("cpu", 8, 4);
    // define the first row - columns, rows, PC column, PC row, clock
    cpu.paste([8, 4, 1, 2, Date.now()], "R1C1:R1C8");
    // add I/O sheets
    // these should subclass Sheet, typically
    var stdout = new Sheet("stdout", 1, 1);
    // create the program sheet
    var [ sentinel, width ] = program[0];
    if (sentinel != "csvm" || typeof width != "number") throw new Error("Program is missing CSVM metadata");
    var data = new Sheet("data", width, program.length);
    data.grid(program);
    if (this.options.verbose) {
      console.log(`Program loaded, ${data.columns} columns and ${data.rows} rows`);
    }
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
      if (!ref.sheet) ref.sheet = "data";
      return ref;
    }
    return cellValue;
  }

  // TODO: this should probably loop as many times as it can in a given frame budget, say 4ms?
  step() {
    var { cpu, data } = this.sheets;
    var frame = Date.now();
    while (Date.now() < frame + FRAME_BUDGET) {
      // set the clock
      cpu.data.set(KEYS.CLOCK, Date.now());
      // get the current program counter directly
      var pcc = cpu.data.get(KEYS.PC_COLUMN);
      var pcr = cpu.data.get(KEYS.PC_ROW);
      var op = data.cell(pcc, pcr);
      if (!op) return this.exit(pcc, pcr);
      if (typeof op == "number") {
        op = instructions[op];
      }
      if (!instructions.includes(op)) throw new Error(`Unknown instruction "${op}"`);
      var method = this[op];
      if (!method) throw new Error(`Opcode "${op}" not implemented`);
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
    tick(this.step);
  }

  exit(column, row) {
    // any cleanup goes here
    console.log(`Program completed at R${row}C${column}`);
    if (this.options.verbose) {
      console.log("CPU memory dump follows:");
      this.sheets.cpu.print();
    }
  }

  dereference(value, bounds = new Reference()) {
    var data;
    if (value instanceof Reference) {
      var sheet = this.sheets[value.sheet];
      data = sheet.copy(value);
      data.name = "deref";
    } else {
      data = new Array(bounds.columns * bounds.rows).fill(value);
    }
    return data;
  }

  copy(from, to) {
    var data = this.dereference(from, to);
    var dest = this.sheets[to.sheet || "data"];
    if (this.options.verbose) console.log(`copy ${from} ${to}`);
    dest.paste(data, to);
  }

  clear(location) {
    if (!(location instanceof Reference)) throw new Error(`Expected reference, got value "${location}"`);
    var dest = this.sheets[location.sheet];
    if (this.options.verbose) console.log(`clear ${location}`)
    dest.clear(location);
  }
}