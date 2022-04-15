import { Sheet, Range } from "./sheet.js";
import { Reference } from "./reference.js";

// memory-mapped hardware
import StdOut from "./stdout.js";
import DisplaySheet from "./display.js";

// direct lookup keys for common known registers
const KEYS = {
  PC_COLUMN: "3:1",
  PC_ROW: "4:1",
  CLOCK: "5:1"
};

// Frame budget for CPU cycles
const FRAME_BUDGET = 4;
// instructions logged on crash
const HISTORY_LENGTH = 10;

const instructions = `
clear copy jump if pack unpack define sleep exit
`.trim().split(/\s+/);

// console.table(Object.fromEntries(instructions.map((op, i) => [op, i])));

const DEFAULTS = {
  verbose: false
};

function requireReference(v) {
  if (!(v instanceof Reference)) throw new Error(`Expected reference, got value "${v}"`)
}

var tick = globalThis.process ? globalThis.process.nextTick : globalThis.requestAnimationFrame;

export class CSVM {
  constructor(program, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    // bind some methods
    this.step = this.step.bind(this);
    this.copyTransform = this.copyTransform.bind(this);
    // create the CPU sheet
    var cpu = this.cpu = new Sheet("cpu", 8, 4);
    // define the first row - columns, rows, PC column, PC row, clock
    cpu.paste([8, 4, 1, 2, Date.now()], "R1C1:R1C8");
    this.pc = [1, 2];
    cpu.setProtected("R1C1:R1C8");
    // add I/O sheets
    // these should subclass Sheet, typically
    var stdout = new StdOut();
    var display = new DisplaySheet();
    // create the program sheet
    var [ sentinel, width ] = program[0];
    if (sentinel != "csvm" || typeof width != "number") throw new Error("Program is missing CSVM metadata");
    var data = new Sheet("data", width, program.length);
    data.grid(program);
    this.verbose(`Program loaded, ${data.columns} columns and ${data.rows} rows`);
    this.sheets = { cpu, data, stdout, display };
    this.namedRanges = {
      stdout: "stdout!A1",
      pcc: "cpu!C1",
      pcr: "cpu!D1",
      clock: "cpu!E1"
    }
    // start execution
    this.running = true;
    this.history = [];
    this.step();
  }

  verbose(...items) {
    if (this.options.verbose) console.log(...items.map(n => String(n)));
  }

  /**
   * Range.copy() hook that dereferences addresses between sheets
   * TODO: define named ranges here and cache them for faster lookup
   */
  copyTransform(column, row, cellValue, target) {
    if (typeof cellValue == "string" && cellValue[0] == "=") {
      var address = cellValue.slice(1);
      if (this.namedRanges[address]) {
        address = this.namedRanges[address];
        // named ranges can be stored references
        if (address instanceof Reference) return address;
      }
      var ref = Reference.at(column, row).setAddress(address);
      if (!ref.sheet) ref.sheet = "data";
      return ref;
    }
    return cellValue;
  }

  sheetCopy(reference) {
    return this.sheets[reference.sheet].copy(reference);
  }

  sheetPaste(value, reference) {
    return this.sheets[reference.sheet].paste(value, reference);
  }

  sheetCell(reference, value) {
    return this.sheets[reference.sheet].cell(reference.column, reference.row, value)
  }

  // TODO: this should probably loop as many times as it can in a given frame budget, say 4ms?
  step() {
    var { cpu, data, display } = this.sheets;
    var [pcc, pcr] = this.pc;
    var frame = Date.now();
    this.idle = false;
    while (this.running && !this.idle && Date.now() < frame + FRAME_BUDGET) {
      // set the clock
      cpu.data.set(KEYS.CLOCK, Date.now());
      // set the PC cell for inspection purposes
      cpu.data.set(KEYS.PC_COLUMN, pcc);
      cpu.data.set(KEYS.PC_ROW, pcr);
      // get the current program counter directly
      var op = data.cell(pcc, pcr);
      if (!op) return this.terminate(pcc, pcr);
      if (typeof op == "number") {
        op = instructions[op];
      }
      // if (!instructions.includes(op)) throw new Error(`Unknown instruction "${op}"`);
      var method = this[op];
      if (!method) throw new Error(`Opcode "${op}" not implemented`);
      var paramRef = Reference.at(pcc + 1, pcr, method.length);
      try {
        var params = data.copy(paramRef, this.copyTransform).values();
        this.verbose(op, ...params);
        this.history.push([pcc, pcr, op, ...params]);
        if (this.history.length > HISTORY_LENGTH) this.history.shift();
        var jumped = method.call(this, ...params);
        if (!jumped) {
          // move to the next instruction
          pcr++;
          this.pc = [pcc, pcr];
        }
      } catch (err) {
        console.error(err);
        return this.crash(pcc, pcr);
      }
    }
    // run any I/O processes at the end of execution
    display.update();
    // schedule the next CPU run
    if (this.running) tick(this.step);
  }

  terminate() {
    this.running = false;
    // final I/O
    this.sheets.display.update();
    // any cleanup goes here
    var [row, column] = this.pc;
    console.log(`Exited at R${row}C${column}`);
    if (this.options.verbose) {
      console.log("CPU memory dump follows:");
      this.sheets.cpu.print();
    }
  }

  crash() {
    console.log(`Crash! Last ${this.history.length} operations:`);
    for (var row of this.history) {
      console.log(row.join(" "));
    }
    this.terminate();
  }

  exit() {
    var pc = [KEYS.PC_COLUMN, KEYS.PC_ROW].map(k => this.cpu.data.get(k));
    this.terminate(...pc);
  }

  dereference(value, bounds = new Reference()) {
    var data;
    if (value instanceof Reference) {
      data = this.sheetCopy(value);
      data.name = "deref";
    } else {
      data = new Array(bounds.columns * bounds.rows).fill(value);
    }
    return data;
  }

  copy(from, to) {
    var data = this.dereference(from, to);
    this.sheetPaste(data, to);
  }

  clear(location) {
    requireReference(location);
    var dest = this.sheets[location.sheet];
    dest.clear(location);
  }

  add(location, value) {
    requireReference(location);
    var a = this.sheetCopy(location).values();
    var b = this.dereference(value, location);
    if (b instanceof Reference) {
      b = this.sheetCopy(b).values();
    }
    var sum = b.map((v, i) => a[i] + v);
    this.sheetPaste(sum, location)
  }

  jump(location) {
    requireReference(location);
    this.pc = [location.column, location.row];
    return true;
  }

  if(condition, dest) {
    requireReference(dest);
    if (condition instanceof Reference) {
      condition = this.sheetCell(condition);
    }
    if (condition) return this.jump(dest);
  }

  pack(range, to) {
    requireReference(range);
    requireReference(to);
    var [sheet = range.sheet, c, r, w = 1, h = 1] = this.dereference(range, to).values();
    var pointer = `=${sheet}!R${r}C${c}:R${r + h}C${c + w}`;
    this.sheetCell(to, pointer);
  }

  unpack(range, dest) {
    requireReference(range);
    requireReference(dest);
    var pointer = [range.sheet, range.column, range.row, range.columns, range.rows];
    this.sheetPaste(pointer, dest);
  }

  pointer(range, dest) {
    requireReference(range);
    requireReference(dest);
    var [c, r] = this.dereference(range, dest).values();
    var pointer = `=R${r}C${c}`;
    this.sheetPaste([pointer], dest);
  }

  define(name, location) {
    requireReference(location);
    this.namedRanges[name] = location;
  }

  sleep() {
    this.idle = true;
  }
}