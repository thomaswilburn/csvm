import { Sheet } from "./sheet.js";
import { Reference } from "./reference.js";

// LED refresh interval in ms
const LCD_LAG = 20;

var debugCounter = 0;

function lerp(a, b, d) {
  return a.map((v, i) => (v * (1 - d) + b[i] * d) & 0xFF);
}

export default class DisplaySheet extends Sheet {
  constructor(canvas, width = 64) {
    super();
    this.columns = width;
    this.rows = width * 2 + 1;

    // set the top row
    // width, height, buffer offset, display mode
    this.paste([width, width, 0, 0], "A1:G1");
    this.setProtected("A1:B1");

    // canvas setup
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { antialias: false });
    this.context.fillStyle = "#0000";
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // actual render buffer
    this.lcd = document.createElement("canvas");
    this.lcd.width = this.lcd.height = width;
    this.lcdContext = this.lcd.getContext("2d", { antialias: false });
    this.lcdImage = this.lcdContext.getImageData(0, 0, width, width);
    
    // draw setup
    this.ready = true;
    this.shader = DisplaySheet.oneBit;
    this.vram = this.getCurrentVRAM();
    this.render = this.render.bind(this);
    this.lastUpdated = 0;
    this.render();
  }

  getCurrentVRAM() {
    var buffer = this.cell(3, 1);
    var start = 2 + this.columns * buffer;
    var end = start + this.columns;
    var values = this.copy(`R${start}C1:R${end}C${this.columns}`).values();
    return values;
  }

  update() {
    this.vram = this.getCurrentVRAM();
  }

  render(t) {
    var elapsed = this.lastUpdated ? t - this.lastUpdated : 0;
    var lag = elapsed / LCD_LAG;
    if (lag > 1) lag = 1;
    this.lastUpdated = t;
    var size = this.columns;
    var lcd = this.lcdImage;
    var values = this.vram;
    for (var quad = 0; quad < lcd.data.length; quad += 4) {
      var index = quad / 4;
      var pixel = values[index];
      var original = lcd.data.slice(quad, quad + 4);
      var update = this.shader(pixel, index);
      var bytes = lerp(original, update, lag);
      lcd.data.set(bytes, quad);
    }
    this.lcdContext.putImageData(lcd, 0, 0);
    this.canvas.width = this.canvas.width;
    var shadow = this.canvas.width / size * .5;
    this.context.imageSmoothingEnabled = false;
    this.context.shadowOffsetX = shadow;
    this.context.shadowOffsetY = shadow;
    this.context.shadowBlur = shadow;
    this.context.shadowColor = "#0003";
    this.context.drawImage(this.lcd, 0, 0, this.canvas.width, this.canvas.height);
    requestAnimationFrame(this.render);
  }

  // different LCD shaders, selectable by display mode
  static oneBit(input) {
    return [0, 0, 0, Number(input) ? 0xCC : 0];
  }

  static confetti(input, index) {
    var x = index % this.columns;
    var y = (index / this.columns) | 0;
    var r = (x / this.columns * 0xFF);
    var g = (y / this.columns * 0xFF);
    var b = (index % this.columns) * 0xFF;
    var a = Number(input) ? 255 : 0;
    return [r, g, b, a];
  }

  static twoBit(input) {
    var v = Number(input);
    var scaled = (v & 0x3) * 64;
    return [0, 0, 0, scaled];
  }

  cell(c, r, v) {
    var value = super.cell(c, r, v);
    // if the buffer offset or display mode is written, update()
    if (this.ready && r == 1 && typeof v != "undefined") {
      // if the display mode is changed, set the shader
      if (c == 4) {
        var shaders = [DisplaySheet.oneBit, DisplaySheet.twoBit, DisplaySheet.confetti];
        var mode = shaders[v] || DisplaySheet.oneBit;
        this.shader = mode;
      }
      this.update();
    }
    return value;
  }
}