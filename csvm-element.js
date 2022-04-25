import { CSVM } from "./vm.js";
import parse from "./csv.js";
import DisplaySheet from "./display.js";

var template = `
<style>
canvas {
  width: 100%;
  display: block;
  aspect-ratio: 1 / 1;
  background: linear-gradient(to bottom right, #888, #898)
}
</style>
<canvas></canvas>
`;

var fetchController = Symbol();
var displayCanvas = Symbol();
var onResize = Symbol();
var vm = Symbol();

class CSVMElement extends HTMLElement {

  constructor() {
    super();
    var root = this.attachShadow({ mode: "open" });
    root.innerHTML = template;
    this[displayCanvas] = root.querySelector("canvas");
    this[fetchController] = null;

    window.addEventListener("resize", this[onResize].bind(this));
    this[onResize]();
  }

  static observedAttributes = ["src"];

  attributeChangedCallback(attr, was, value) {
    switch (attr) {
      case "src":
        return this.loadCSV(value);
    }
  }

  [onResize]() {
    var c = this[displayCanvas];
    c.width = c.offsetWidth;
    c.height = c.offsetWidth;
  }

  async loadCSV(src) {
    if (this[fetchController]) this[fetchController].abort();
    this[fetchController] = new AbortController();
    var { signal } = this[fetchController];

    var response = await fetch(src, { signal });
    var text = await response.text();
    var csv = parse(text);

    if (this[vm]) this[vm].terminate();

    var canvas = this[displayCanvas];
    var display = new DisplaySheet(canvas);
    this[vm] = new CSVM(csv, { display, verbose: 0 });
  }

}

window.customElements.define("csvm-element", CSVMElement);