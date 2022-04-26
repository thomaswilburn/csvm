import { Sheet, Reference } from "../workbook.js";

export default class SynthSheet extends Sheet {
  voices = [];
  scheduled = new Set();
  oninterrupt = null;

  constructor(voices = 4) {
    // layout is 8 cells wide: waveform, frequency, duration, start gain, end gain, interrupt
    super("synth", 8, voices + 1);
    this.cell(1, 1, voices);
    this.setProtected("A1");

    this.context = new AudioContext();
    this.poll = this.poll.bind(this);
  }

  poll() {
    for (var entry of this.scheduled) {
      this.scheduled.delete(entry);
      var config = this.copy(`R${entry}C1:R${entry}C6`).values();
      
      this.fireVoice(entry - 1, config);
    }
  }

  fireVoice(index, [type = "sine", frequency = 440, duration = 1, start = 1, end = 1, callback]) {
    if (this.voices[index]) {
      this.voices[index].stop();
    }
    if (!duration) return;
    var osc = new OscillatorNode(this.context, { type, frequency });
    var amp = new GainNode(this.context);
    osc.connect(amp);
    amp.connect(this.context.destination);
    var now = this.context.currentTime;
    var then = now + duration;
    amp.gain.setValueAtTime(start, now);
    amp.gain.linearRampToValueAtTime(end, then);
    osc.start();
    osc.stop(then);
    if (callback) {
      osc.onended = e => {
        if (!this.oninterrupt) return;
        this.oninterrupt(callback);
      }
    }
    this.voices[index] = osc;
  }

  cell(column, row, value) {
    if (value && row > 1) {
      if (!this.scheduled.size) requestAnimationFrame(this.poll);
      this.scheduled.add(row);
    }
    return super.cell(column, row, value);
  }
}