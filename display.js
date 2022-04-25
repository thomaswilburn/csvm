import { Sheet } from "./sheet.js";
import { Reference } from "./reference.js";

var testCanvas = document.createElement("canvas");
testCanvas.style.background = "linear-gradient(#888, #999)";
testCanvas.width = testCanvas.height = 600;
testCanvas.style.maxWidth = "100%";
document.body.append(testCanvas);
var counter = 0;
// LED refresh interval in ms
const LCD_LAG = 30;

export default class DisplaySheet extends Sheet {
  constructor(canvas = testCanvas, width = 64) {
    super();
    this.columns = width;
    this.rows = width * 2 + 1;
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { antialias: false });
    this.context.fillStyle = "#0000";
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.imageSmoothingEnabled = false;
    // set the top row
    // width, height, buffer offset, display mode
    this.paste([width, width, 0, 0], "A1:G1");
    this.setProtected("A1:B1");
    this.ready = true;
    this.vram = this.getCurrentVRAM();
    this.render = this.render.bind(this);
    this.lastUpdated = 0;
    this.lcd = document.createElement("canvas");
    this.lcd.width = this.lcd.height = width;
    this.lcdContext = this.lcd.getContext("2d", { antialias: false });
    this.lcdImage = this.lcdContext.getImageData(0, 0, width, width);
    this.render();
  }

  getCurrentVRAM() {
    var buffer = this.cell(3, 1);
    var start = 2 + this.columns * buffer;
    var end = start + this.columns;
    var values = this.copy(`R${start}C1:R${end}C${this.columns}`).grid();
    return values;
  }

  update() {
    this.vram = this.getCurrentVRAM();
  }

  render(t) {
    var elapsed = this.lastUpdated ? t - this.lastUpdated : 0;
    var blur = elapsed / LCD_LAG;
    if (blur > 1) blur = 1;
    this.lastUpdated = t;
    var size = this.columns;
    var lcd = this.lcdImage;
    var values = this.vram;
    for (var quad = 0; quad < lcd.data.length; quad += 4) {
      var alpha = quad + 3;
      var index = quad / 4;
      var pixel = Number(values[(index / this.columns) | 0][index % this.columns]);
      lcd.data[alpha] = ((lcd.data[alpha] * (1 - blur)) + (pixel ? 255 : 0) * blur) | 0;
    }
    this.lcdContext.putImageData(lcd, 0, 0);
    this.canvas.width = this.canvas.width;
    this.context.imageSmoothingEnabled = false;
    this.context.drawImage(this.lcd, 0, 0, this.canvas.width, this.canvas.height);
    requestAnimationFrame(this.render);
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