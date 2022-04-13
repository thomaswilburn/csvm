function cast(value) {
  if (value.match(/^-?(0?\.|[1-9])[\d\.]*$/) || value == "0") {
    return Number(value);
  }
  if (value.toLowerCase() == "true") return true;
  if (value.toLowerCase() == "false") return false;
  return value;
}

var defaults = {
  quote: `"`,
  separator: `,`,
  ending: `\n`
};

export default function parse(text, options) {
  text = text.trim();
  var quoting = false;
  var csv = [];
  var row = [];
  var buffer = [];

  var finishCell = function() {
    var value = cast(buffer.join(""));
    row.push(value);
    buffer = [];
  };

  var finishRow = function() {
    if (buffer.length) finishCell();
    csv.push(row);
    row = [];
  };

  options = Object.assign({}, options, defaults);
  var { quote, separator, ending } = options;

  for (var i = 0; i < text.length; i++) {
    var char = text[i];
    var next = text[i + 1];

    if (quoting) {
      if (char == quote) {
        if (next == quote) {
          buffer.push(quote);
          i++;
        } else if (next != separator) {
          console.log(char, next);
          throw new Error("Field continued after ending quote");
        } else {
          quoting = false;
        }
      } else {
        buffer.push(char);
      }
    } else {
      switch (char) {
        case separator:
          finishCell();
          break;

        case ending:
          finishRow();
          break;

        case quote:
          // tolerate quotes if a field has already opened
          if (!buffer.length) {
            quoting = true;
            // looks like a bug, but isn't!
            break;
          }

        default:
          buffer.push(char);
      }
    }
  }

  if (buffer.length) finishCell();
  if (row.length) finishRow();

  return csv;
}