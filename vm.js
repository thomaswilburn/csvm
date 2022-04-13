import { Sheet, Range } from "./sheet.js";
import { Reference } from "./reference.js";

// direct lookup keys for common known registers
const KEYS = {
  PC: "3:1",
  CLOCK: "4:1"
};

// Frame budget for CPU cycles
const FRAME_BUDGET = 4;

export class CSVM {
  constructor(program) {
    // bind some methods
    this.step = this.step.bind(this);
    this.copyTransform = this.copyTransform.bind(this);
    // create the CPU sheet
    var cpu = new Sheet("cpu", 8, 4);
    // define the first row - columns, rows, PC, clock
    cpu.paste([8, 4, "=data!A2", Date.now()], "R1C1:R1C8");
    // add I/O sheets
    // these should subclass Sheet, typically
    var console = new Sheet("console", 1, 1);
    // create the program sheet
    // TODO: load data for this sheet from the program
    var data = new Sheet("data", 8, 10);
    this.sheets = { cpu, data, console };
    // start execution
    this.step();
  }

  /**
   * Range.copy() hook that dereferences addresses between sheets
   * TODO: this should throw if a reference expansion would overwrite data
   * TODO: define named ranges here and cache them for faster lookup
   */
  copyTransform(cellValue, target) {

  }

  // TODO: this should probably loop as many times as it can in a given frame budget, say 4ms?
  step() {
    var { cpu } = this.sheets;
    var frame = Date.now();
    while (Date.now() < frame + FRAME_BUDGET) {
      // set the clock
      cpu.data.set(KEYS.CLOCK, Date.now());
      // get the current program counter
      var pc = cpu.data.get(KEYS.PC);
      // TODO: read and execute instructions at the PC location
    }
    // TODO: run any I/O processes at the end of execution
    // TODO: set rAF for the next step()
  }
}

var vm = new CSVM();