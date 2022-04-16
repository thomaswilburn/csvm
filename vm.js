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

// pointer operations
const DIRECT = "*";
const INDIRECT = "&";

const INSTRUCTIONS = `
clear copy
add sub mult div mod
and or not xor
jump if eq gt
call return
pointer address local
define concat
sleep exit

sin cos tan
dot normal mat 
pow abs rand
min max clamp
floor ceil
`.trim().split(/\s+/);

var { onlyReference, onlyValue } = Workbook;

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
    this.stack = [];
    this.step();
  }

  verbose(...items) {
    if (this.options.verbose) console.log(...items.map(n => String(n)));
  }

  /**
   * Range.copy() hook that dereferences addresses between sheets
   */
  copyTransform(column, row, cellValue) {
    if (typeof cellValue == "string") {
      cellValue = cellValue.trim();
      var operator = cellValue[0];
      if (operator != INDIRECT && operator != DIRECT) return cellValue;
      var address = cellValue.slice(1);
      if (this.namedRanges[address]) {
        address = this.namedRanges[address];
      }
      var ref = address instanceof Reference ? address : Reference.at(column, row).setAddress(address);
      if (!ref.sheet) ref.sheet = "data";
      switch (operator) {
        case DIRECT:
          // the reference itself is what we want
          return ref;

        case INDIRECT:
          // actually go out and get the data
          var value = this.book.cell(ref);
          value = this.copyTransform(ref.column, ref.row, value);
          // ref = ref.setAddress(value.slice(1));
          // substitute the actual pointer
          return value;
      }
    }
    return cellValue;
  }

  record(pcc, pcr, op, ...params) {
    this.verbose(op, ...params);
    this.history.push([pcc, pcr, op, ...params]);
    if (this.history.length > HISTORY_LENGTH) this.history.shift();
  }

  // TODO: this should probably loop as many times as it can in a given frame budget, say 4ms?
  step() {
    var { cpu, data, display } = this.book.sheets;
    var frame = Date.now();
    this.idle = false;
    while (this.running && !this.idle && Date.now() < frame + FRAME_BUDGET) {
      // set the clock
      cpu.data.set(KEYS.CLOCK, Date.now());
      // set the PC cell for inspection purposes
      var [pcc, pcr] = this.pc;
      cpu.data.set(KEYS.PC_COLUMN, pcc);
      cpu.data.set(KEYS.PC_ROW, pcr);

      try {
        // get the current opcode
        var op = data.cell(pcc, pcr);
        if (!op) return this.terminate(pcc, pcr);
        if (typeof op == "number") {
          op = instructions[op];
        }
        // only run allow-listed opcodes
        if (!INSTRUCTIONS.includes(op)) throw new Error(`Unknown instruction "${op}"`);
        var method = this[op];
        if (!method) throw new Error(`Opcode "${op}" not implemented`);
        // get params, using the arity of the VM instance
        var paramRef = Reference.at(pcc + 1, pcr, method.length);
        var params = data.copy(paramRef, this.copyTransform).values();

        this.record(pcc, pcr, op, ...params);
        // log operation
        
        // execute opcode
        // jumps will return true, so we don't re-increment the PCR
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
    // schedule the next CPU run
    if (this.running) tick(this.step);
  }

  terminate() {
    this.running = false;
    // any cleanup goes here
    var [row, column] = this.pc;
    console.log(`Exited at R${row}C${column}`);
    if (this.options.verbose) {
      console.log("CPU memory dump follows:");
      this.cpu.print();
      console.log("Data sheet dump follows:");
      this.book.sheets.data.print();
    }
  }

  crash() {
    console.log(`Crash! Last ${this.history.length} operations:`);
    for (var row of this.history) {
      console.log(row.join(" "));
    }
    this.book.sheets.data.print();
    this.terminate();
  }

  clear(location) {
    onlyReference(location);
    this.book.clear(location);
  }

  copy(from, to) {
    onlyReference(to);
    var data = [from];
    if (from instanceof Reference) {
      data = this.book.getValues(from, to);
    }
    this.book.paste(data, to);
  }

  add(location, value) {
    onlyReference(location);
    var a = this.book.getValues(location);
    var b = this.book.getValues(value, location);
    var result = b.map((v, i) => a[i] + v);
    this.book.paste(result, location);
  }

  sub(location, value) {
    onlyReference(location);
    var a = this.book.getValues(location);
    var b = this.book.getValues(value, location);
    var result = b.map((v, i) => a[i] - v);
    this.book.paste(result, location);
  }

  mult(location, value) {
    onlyReference(location);
    var a = this.book.getValues(location);
    var b = this.book.getValues(value, location);
    var result = b.map((v, i) => a[i] * v);
    this.book.paste(result, location);
  }

  div(location, value) {
    onlyReference(location);
    var a = this.book.getValues(location);
    var b = this.book.getValues(value, location);
    var result = b.map((v, i) => a[i] / v);
    this.book.paste(result, location);
  }

  mod(location, value) {
    onlyReference(location);
    var a = this.book.getValues(location);
    var b = this.book.getValues(value, location);
    var sums = b.map((v, i) => a[i] % v);
    this.book.paste(sums, location);
  }

  and(location, value) {}
  or(location, value) {}
  not(location) {}
  xor(location, value) {}

  jump(cell) {
    onlyReference(cell);
    if (cell.sheet && cell.sheet != "data") throw new Error("Tried to jump to non-executable memory");
    this.pc = [cell.column, cell.row];
    return true;
  }

  if(condition, cell) {
    onlyReference(cell);
    if (condition instanceof Reference) {
      condition = this.book.cell(condition);
    }
    if (condition) return this.jump(cell);
  }

  eq(a, b, cell) {}
  gt(a, b, cell) {}
  
  call(address) {
    this.stack.push(this.pc);
    return this.jump(address);
  }
  
  return() {
    if (!this.stack.length) throw new Error("Return from an empty stack!");
    var [pcc, pcr] = this.stack.pop();
    pcr++;
    this.pc = [pcc, pcr];
    return true;
  }

  pointer(range, dest) {
    onlyReference(range);
    onlyReference(dest);
    var pointer = [range.sheet, range.column, range.row, range.columns, range.rows];
    this.book.paste(pointer, dest);
  }

  address(range, to) {
    onlyReference(range);
    onlyReference(to);
    var [sheet = range.sheet, c, r, w = 1, h = 1] = this.book.getValues(range, to);
    var pointer = DIRECT + `${sheet}!R${r}C${c}:R${r + h - 1}C${c + w - 1}`;
    this.book.cell(to, pointer);
  }

  local(range, dest) {
    onlyReference(range);
    onlyReference(dest);
    var [c, r] = this.book.getValues(range, dest);
    var pointer = DIRECT + `R${r}C${c}`;
    this.book.cell(dest, pointer);
  }

  define(name, location) {
    onlyReference(location);
    this.namedRanges[name] = location;
  }

  concat(input, location) {}

  sleep() {
    this.idle = true;
  }

  exit() {
    var pc = [KEYS.PC_COLUMN, KEYS.PC_ROW].map(k => this.cpu.data.get(k));
    this.terminate(...pc);
  }

  sin(location) {
    onlyReference(location);
    var theta = this.book.cell(location);
    var result = Math.sin(theta);
    this.book.cell(location, result);
  }

  cos(location) {
    onlyReference(location);
    var theta = this.book.cell(location);
    var result = Math.cos(theta);
    this.book.cell(location, result);
  }

  tan(value) {}
  dot(a, b) {}
  normal(vector) {}
  mat(a, b, out) {}
  pow(a, b) {}
  min(range) {}
  max(range) {}
  clamp(value, min, max) {}
  
  floor(location) {
    onlyReference(location);
    var value = this.book.cell(location);
    var result = Math.floor(value);
    this.book.cell(location, result);
  }

  ceil(location) {
    onlyReference(location);
    var value = this.book.cell(location);
    var result = Math.ceil(value);
    this.book.cell(location, result);

  }

}