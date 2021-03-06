CSVM
====

The year is 1934, and Alan Turing is working on the problem of computability at Cambridge. Sitting at a desk, idly toying with a pencil, he imagines a machine that would be able to solve any computable problem by moving a read/write head over an infinite surface. But what kind of surface? Turing looks around the room, his unfocused eyes passing over a roll of painter's tape, a reel-to-reel audio recorder, and a long strand of yarn protruding from a favorite sweater, before landing on a chessboard. Perfect! The Turing machine, with its signature infinite grid of values, will change the future of the world.

Decades later, some radical engineers suggest that an easier model for a universal computational machine would be an infinite 1-dimensional array, similar to the "spreadtape" programs that are commonly used in business to create reports and perform budgetary analysis, but by this point the grid model of computing is entirely too entrenched in the industry, and nobody takes the idea very seriously anyway.

Concept
-------

CSVM is a fantasy console from an alternate history where computers are constructed out of what we would recognize as spreadsheets. It loads "ROM images" from .csv files, and runs those in the browser, providing simple, low resolution graphics and audio synth voices. A planned version may run directly in the sidebar of Google Sheets.

Architecture
------------

The foundational structure of CSVM is a 2D grid of values broadly similar to a spreadsheet in Excel or Google sheets. These grids are used for data storage and program code, but are also used to address memory-mapped I/O to and from the keyboard, screen, and audio synthesizer. In this way, each VM instance is similar to a workbook with an interpreter bolted on top. Typically, within each sheet, the first row is used for configuration and metadata, and is often write-protected.

On boot, CSVM creates a ``cpu`` sheet for its own state and operational memory, similar to the registers or stack of a traditional CPU. This sheet may be sized differently depending on the capabilities of the machine, but is no less than 8x8. The first row is marked as read-only, and contains the following cells:

* The width of the sheet
* The number of writeable rows available
* The numerical column of the current program counter (initialized at 1)
* The numerical row of the current program counter (initialized at 2)
* The system clock value in milliseconds since the UNIX epoch

Once the CPU is ready, additional sheets are added to the instance, representing the screen (``display``), audio (``synth``), input (``keys``), and a crude printer (``stdout``). Finally, the VM loads from the provided ROM into the ``data`` sheet, and begins executing instructions from cell A2.

On each step, the VM reads the current instruction from the cell specified by the program counter, followed by any operands in the cells to its right, and executes that code. If the instruction is a jump, it may set the program counter anywhere in the ``data`` sheet, otherwise it simply increments the numerical row of the program counter to move to the next instruction. Instructions are typically stacked in the left-most column of the program, leaving the cells to the right free for local data storage, but there's no requirement for a program to do so.

In addition to the internal state of the ``cpu`` sheet, the VM maintains a function return stack that is not available for programs to inspect.

Instructions
------------

Each instruction takes one or more cells as instructions:

* Literal values consisting of numbers, strings, TRUE, or FALSE. As funny as it would be to provide a date type in a spreadsheet-inspired VM, we are not sadists. If a literal is used in an instruction that affects a range of multiple cells, it will be applied to all of them, as if in an ARRAYFORMULA in Sheets.
* Cell and range addresses, using the standard ``sheet!A1:B2`` format. If the sheet is omitted, it's assumed to be a reference to ``data``. 
* ``R1C1`` and ``R[1]C[1]`` notation is also supported, and can be useful for predetermined relative jumps or colocating data next to instructions.

Sheet addresses must be prefixed with one of two operators in order to use them with an opcode.

* ``*A1`` is a *direct* reference to call A1 and/or its value.
* ``&A1`` is an *indirect* reference: the VM will load A1 and use it to find the actual requested value.

For example, ``clear *B5`` means that the contents of cell B5 will be deleted. ``clear &B5`` means that the VM will take the value of B5, which should be a direct cell address prefixed with ``*``, and clear that cell.

When comparing or combining values of different types, or for the bitwise operations, values will be converted to numbers unless otherwise noted. Empty cells and FALSE are converted to 0, and TRUE or string values are converted to 1. 

When multiple ranges are used for an instruction, they should have the same dimensions unless otherwise noted.

Most arithmetic operations in CSVM are in-place, overwriting the first parameter. If you do not want to mutate your data, copy it into the ``cpu`` sheet or a free section of ``data`` and perform operations there, then copy it back to its destination. 

=========== ======== ===========
instruction operands description
----------- -------- -----------
clear       A        Erases values from any cells in the range A.
copy        A B      Sets B = A
add         A B      Sets A = A + B
sub         A B      Sets A = A - B
mult        A B      Sets A = A * B
div         A B      Sets A = A / B
mod         A B      Sets A equal to the remainder of A / B
and         A B      Sets A = A & B
or          A B      Sets A = A | B
not         A        Sets A = !A
xor         A B      Sets A = A ^ B
jump        A        Sets the program counter to the address in A
if          A B      If the value of A is non-zero, jumps to the address in B
eq          A B C    If the values of A and B are the same, jumps to C
gt          A B C    If A is greater than B, jumps to C
call        A        Pushes the next instruction address onto the return stack and jumps to A
return               Pop the most recent address from return stack and jump to it
pointer     A B      Take the textual address at A and unpack it into five values at B (sheet, column number, row number, width, height)
address     A B      Take five cell values from A and turn them into a *sheet!R1C1:R1C1 address at B
local       A B      Take two cell values from A and turn them into a *R1C2 address at B
define      A B      Define a named range "A" for the VM with the location or value of B
concat      A B      Set B = the combined textual values of A
sleep                Pause execution until the next display tick (usually 60Hz)
exit                 Terminate the VM
=========== ======== ===========

In addition to these basic instructions, CSVM provides a number of game/shader inspired instructions.

=========== ======== ===========
instruction operands description
----------- -------- -----------
sin         A        Set A = sin(A)
cos         A        Set A = cos(A)
tan         A        Set A = tan(A)
dot         A B      Set A = the dot product of A and B
normal      A        Normalize values in A to the range of 0 to 1
mat         A B C    Set C = matrix multiplication of A and B
pow         A B      Set A = A**B
min         A        Set A = min(A) where A is a range of cells
max         A        Set A = max(A) where A is a range of cells
clamp       A B C    Set A = max(B, min(C, A))
abs         A        Set A = abs(A)
rand        A        Set A = random values between 0 and 1
=========== ======== ===========

CSVM provides some named ranges that are specially cached and accessed when referenced, effectively acting as registers:

* ``*clock`` - current CPU clock time, which is Date.now() for a given cycle
* ``*pcr`` and ``*pcc`` - current program counter index, row and column
* ``*stdout`` - ``*stdout!A1`` (simplifies things, since any value written to any address in the ``stdout`` sheet is immediately logged and discarded)

Display
-------

The ``display`` sheet can be used to show graphics. By default, a CSVM instance has a 64x64 black-and-white "LCD" screen. The first row of the sheet provides some key configuration in the following cells:

* The width of the screen in pixels (defaults to 64)
* The height of the screen in pixels (defaults to 64)
* The VRAM page (defaults to 0)
* The current display mode (defaults to 0)

Setting either the VRAM page or display mode will refresh the display's internal buffer and trigger a screen update. The width and height of the screen are read-only.

After the first row, the display sheet contains two square blocks of cells, each equal in size. The VRAM page value selects between these two. For example, when the page value is 0, the screen will be drawn from the values in R2C1:R65C64 (A2:BL65). Setting the page to 1 will cause it to draw from R66C1:R129C64 (A66:BL129). This allows developers to either double-buffer the display, or to use only a single VRAM page for drawing and use the other for arbitrary data.

Display modes are effectively pixel shader presets that take the VRAM values and translate them into display colors. The currently implemented modes are:

* 0 - One-bit rendering, with non-zero numerical values turning the pixel on.
* 1 - Four-shade grayscale, with 0 being "off" and 3 being the darkest shade
* 2 - "confetti" colors for any non-zero numerical value.

Synth
-----

The ``synth`` sheet offers access to a number of voices. Cell A1 in the sheet will be an indicator of how many voices are available, with a minimum of 4. Each row after that triggers a voice when it is set or edited, with any voice currently playing for that row being silenced. The cells in each row control:

* The waveform of the voice, which is mostly based on what's available in WebAudio: "sine", "square", "sawtooth", "triangle"
* The duration of the note.
* Starting volume
* Ending volume (linear interpolation will be used, if this is provided)
* A cell address to for an interrupt to call when the note ends.

Interrupts are treated as function calls, and should return when they're complete. They can be called at any time, so make sure that you don't collide with any existing values. One interrupt will be called per browser animation frame as long as no other interrupt is currently running.

Input
-----

(not currently implemented)

The input sheet is 4x3 range fed by a keyboard or gamepad. The top row represents the up/down/left/right inputs, the second row are the face buttons, and the third row are the triggers.

When a button is pressed, the cell will be marked as TRUE. When it isn't pressed, the cell will be empty or FALSE.

TODO
----
- Build I/O sheets
  - keyboard
  - networking?
- add the Noise synth
- Finish any remaining instructions
- Write shims for Range and Reference that work in Sheets for the add-on version
