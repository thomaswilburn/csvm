import { Sheet } from "./sheet.js";
import { Reference } from "./reference.js";

var testCanvas = document.createElement("canvas");
testCanvas.width = testCanvas.height = 64 * 8;
testCanvas.style.background = "#888";
document.body.append(testCanvas);

export default class DisplaySheet extends Sheet {
  constructor(canvas = testCanvas, width = 64) {
    super();
    this.columns = width;
    this.rows = width * 2 + 1;
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { antialias: false });
    // set the top row
    // width, height, buffer offset, display mode
    this.paste([width, width, 0, 0], "A1:G1");
    this.setProtected("A1:B1");
    this.ready = true;
  }

  update() {
    this.canvas.width = this.canvas.width;
    var buffer = this.cell(3, 1);
    var start = 2 + this.columns * buffer;
    var end = start + this.columns;
    var values = this.copy(`R${start}C1:R${end}C${this.columns}`).grid();
    var px = this.canvas.width / this.columns;
    // this.print(); debugger;
    for (var y = 0; y < values.length; y++) {
      var row = values[y];
      for (var x = 0; x < row.length; x++) {
        var pixel = Number(row[x]);
        if (pixel) {
          this.context.fillStyle = "#000C";
          this.context.fillRect(x * px, y * px, px, px);
        }
      }
    }
  }

  cell(c, r, v) {
    var value = super.cell(c, r, v);
    // if the buffer offset or display mode is written, update()
    if (this.ready && r == 1 && typeof v != "undefined") {
      this.update();
    }
    return value;
  }
}