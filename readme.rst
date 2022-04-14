CSVM
====

CSVM is a virtual machine for people who love spreadsheets, aimed at making lo-fi games.

Architecture
------------

A CSVM instance is based around a unified memory model representing sheets, which are 2D arrays of values. On boot, the system creates a ``cpu`` sheet, which acts as the registers and heap for the machine. Its first row is read-only, and contains:

* The width of the ``cpu`` sheet
* The number of additional rows available to running code
* The program counter
* The current system clock value in milliseconds

The ``cpu`` sheet must provide at least 8 columns and 4 rows, but may have more. Additional sheets may be initialized and added to the machine at this time, including memory-mapped input and output for the keyboard, screen, console output, and audio synth.

Finally, CSVM loads program code into the ``data`` sheet, using configuration stored in the first row, sets the program counter to its initial value, and begins executing instructions. Each instruction is read across the row, starting at the cell referenced by the program counter and consuming as many cells are required by the opcode. Programs are typically aligned with the leftmost column of the ``data`` sheet, but you can jump to anywhere in a sheet, and the CPU will proceed vertically down the column from there.

In addition to the ``cpu`` sheet, the VM maintains a function return address stack that is not available for programs to inspect.

Instructions
------------

Each instruction takes one or more cells as instructions:

* Literal values consisting of numbers, strings, TRUE, or FALSE. As funny as it would be to provide a date type in a spreadsheet-inspired VM, we are not sadists.
* Cell and range addresses, using the standard ``=sheet!A1:B2`` format. If the sheet is omitted, it's assumed to be in ``data``. 
* R1C1 notation is also permitted, and can be useful for predetermined relative jumps or colocating data next to instructions.

When comparing or combining values of different types, they will be converted to numbers and then compared. Empty cells and FALSE are converted to 0, and TRUE or string values are converted to 1.

Instructions are numerically coded, but string aliases are also defined for each to make them easier to read when authoring a program. Except when specified, the dimensions of ranges passed in to an instruction should match, and operations are conducted on the corresponding cells in each range, similar to vector operations in GLSL.

Most arithmetic operations in CSVM are in-place, overwriting the first parameter. If you do not want to mutate your data, copy it into the ``cpu`` sheet and perform operations there, then copy it back to its destination.

* ``clear A`` - Erases the values from any cells in the range A.
* ``copy A B`` - Reads from range A and copies the cells to range B.
* ``add A B`` - Adds the values in B to A, storing the result in A.
* ``sub A B`` - Subtracts B from A, storing the result in A.
* ``mult A B`` - Multiplies A by B, storing the result in A.
* ``div A B`` - Divides A by B, storing the result in A.
* ``mod A B`` - Divides A by B and stores the remainder in A.
* ``and A B`` - Performs a bitwise AND of A and B, storing the result in A.
* ``or A B`` - Performs a bitwise OR of A and B, storing the result in A. 
* ``xor A B`` - Performs a bitwise XOR of A and B, storing the result in A.
* ``not A`` - Performs a bitwise NOT of A, storing the result in A.
* ``goto A`` - Set the program counter to the location from A.
* ``if A B`` - Checks the value in A, and if it is non-zero, jump to B.
* ``eq A B C`` - Compare A and B, and if they're equal, jump to C.
* ``gt A B C`` - Compare A and B, and if A is greater, jump to C.
* ``call A`` - Set the program counter to A, and add the current address to the return stack.
* ``ret`` - Pop the most recent value from the call stack and jump to its location.
* ``expand A B`` - Unpack the A1/R1C1 reference at A into five cell values at B (sheet, column, row, width, height)
* ``compact A B`` - Convert five cell values at A into an A1 reference at B
* ``define A B`` - Define named range A in this sheet with the location or value of B.

In addition to these basic instructions, CSVM provides a number of game/shader inspired instructions.

* ``sin A`` - Take the sine of A and store the result in-place.
* ``cos A`` - Take the cosine of A and store the result in-place.
* ``tan A`` - Take the tangent of A and store the result in-place.
* ``dot A B`` - Perform the dot product of A and B, storing the result in A.
* ``mat A B C`` - Perform matrix multiplication of A and B, storing the result in C.
* ``pow A B`` - Take A to the power of B and store the result in A.
* ``clamp A B C`` - Clamp A to the bounds of B and C, storing the result in A.
* ``min A B`` - Set A to the lower of A and B
* ``max A B`` - Set A to the higher of A and B
* ``abs A`` - Set A to the absolute value of A.
* ``rand A`` - Set A to a random number in the range of 0 to 1.

CSVM provides some named ranges that are specially cached and accessed when referenced, effectively acting as registers:

* ``=clock`` - current CPU clock time, which is Date.now() for a given cycle
* ``=pcr`` and ``=pcc`` - current program counter index, row and column

I/O
---

Input and output in CSVM are "memory-mapped" via specific sheets for each port. In the case of input, the values in the sheet will changed in response to events. For output, writing to the sheet will trigger updates.

TODO
----

- Build I/O sheets
  - stdout
    - just a single cell, and when you write to it it's immediately streamed outward
  - graphics
    - should have two buffers, which you can flip between with a cell
    - also a text mode? I'd like that
    - conditional shading modes instead of a traditional pixel value
  - keyboard
  - audio
    - 4+ synth voices
    - each voice gets a row: waveform, frequency, decay rate, duration, interrupt
  - networking?
- Finish building out instructions
- Make I/O sheets swappable, to support browser and terminal versions