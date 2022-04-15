import { Sheet, Range, Reference, Workbook } from "./workbook.js";

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
var tick = globalThis.process ? globalThis.process.nextTick : globalThis.requestAnimationFrame;

// instructions logged on crash
const HISTORY_LENGTH = 10;

const instructions = `
clear copy jump if pack unpack define sleep exit
`.trim().split(/\s+/);

var { onlyReference } = Workbook;

const DEFAULTS = {
  verbose: false
};

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

    this.book = new Workbook({ cpu, data, stdout, display });
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
   */
  copyTransform(column, row, cellValue, target) {
    if (typeof cellValue == "string" && cellValue[0] == "&") {
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

  // TODO: this should probably loop as many times as it can in a given frame budget, say 4ms?
  step() {
    var { cpu, data, display } = this.book.sheets;
    var [pcc, pcr] = this.pc;
    var frame = Date.now();
    this.idle = false;
    while (this.running && !this.idle && Date.now() < frame + FRAME_BUDGET) {
      // set the clock
      cpu.data.set(KEYS.CLOCK, Date.now());
      // set the PC cell for inspection purposes
      cpu.data.set(KEYS.PC_COLUMN, pcc);
      cpu.data.set(KEYS.PC_ROW, pcr);

      try {
        // get the current opcode
        var op = data.cell(pcc, pcr);
        if (!op) return this.terminate(pcc, pcr);
        if (typeof op == "number") {
          op = instructions[op];
        }
        // if (!instructions.includes(op)) throw new Error(`Unknown instruction "${op}"`);
        var method = this[op];
        if (!method) throw new Error(`Opcode "${op}" not implemented`);
        var paramRef = Reference.at(pcc + 1, pcr, method.length);
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
    this.book.sheets.display.update();
    // any cleanup goes here
    var [row, column] = this.pc;
    console.log(`Exited at R${row}C${column}`);
    if (this.options.verbose) {
      console.log("CPU memory dump follows:");
      this.cpu.print();
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

  copy(from, to) {
    var data = this.book.getValues(from, to);
    this.book.paste(data, to);
  }

  clear(location) {
    onlyReference(location);
    this.book.clear(location);
  }

  add(location, value) {
    onlyReference(location);
    var a = this.book.getValues(location);
    var b = this.book.getValues(value, location);
    var sum = b.map((v, i) => a[i] + v);
    this.book.paste(sum, location);
  }

  jump(location) {
    onlyReference(location);
    this.pc = [location.column, location.row];
    return true;
  }

  if(condition, dest) {
    onlyReference(dest);
    if (condition instanceof Reference) {
      condition = this.book.cell(condition);
    }
    if (condition) return this.jump(dest);
  }

  address(range, to) {
    onlyReference(range);
    onlyReference(to);
    var [sheet = range.sheet, c, r, w = 1, h = 1] = this.book.getValues(range, to);
    var pointer = `&${sheet}!R${r}C${c}:R${r + h}C${c + w}`;
    this.book.cell(to, pointer);
  }

  pointer(range, dest) {
    onlyReference(range);
    onlyReference(dest);
    var pointer = [range.sheet, range.column, range.row, range.columns, range.rows];
    this.book.paste(pointer, dest);
  }

  local(range, dest) {
    onlyReference(range);
    onlyReference(dest);
    var [c, r] = this.book.getValues(range, dest);
    var pointer = `&R${r}C${c}`;
    this.book.cell(dest, pointer);
  }

  define(name, location) {
    onlyReference(location);
    this.namedRanges[name] = location;
  }

  sleep() {
    this.idle = true;
  }
}