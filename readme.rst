CSVM
====

CSVM is a virtual machine for people who love spreadsheets, aimed at making lo-fi games.

Architecture
------------

A CSVM instance is based around a unified memory model representing sheets, which are 2D arrays of values. On boot, the system creates a ``cpu`` sheet, which acts as the registers and heap for the machine. Its first row is read-only, and contains:

* The width of the ``cpu`` sheet
* The number of additional rows available to running code
* The program counter

The ``cpu`` sheet must provide at least 8 columns and 4 rows, but may have more. Additional sheets may be initialized and added to the machine at this time, including memory-mapped input and output for the keyboard, screen, console output, and audio synth.

Finally, CSVM loads program code into the ``data`` sheet, using configuration stored in the first row, sets the program counter to its initial value, and begins executing instructions. Each instruction is read across the row, starting at the cell referenced by the program counter and consuming as many cells are required by the opcode. Programs are typically aligned with the leftmost column of the ``data`` sheet, but you can jump to anywhere in a sheet, and the CPU will proceed vertically down the column from there.

In addition to the ``cpu`` sheet, the VM maintains a function return address stack that is not available for programs to inspect.

Instructions
------------

Each instruction takes one or more cells as instructions:

* Literal values consisting of numbers, strings, TRUE, or FALSE. As funny as it would be to provide a date type in a spreadsheet-inspired VM, we are not sadists.
* Cell and range addresses, using the standard ``sheet!A1:B2`` format. If the sheet is omitted, it's assumed to be in ``data``. 
* The ``&`` prefix can be used to tell the VM that you want to use the address itself as a literal, in which case it will be unpacked into a range containing ``[sheet, column, row, width, height]``. This can be used to perform "pointer arithmetic" on cell references. Rows and columns are 1-indexed, as in Excel.
* Similarly, using ``*`` as the prefix for a cell reference will cause it to read in five cells and treat them as though they were an address.
* R1C1 notation can be used internally to refer to a cell from the current location by offset, instead of by absolute address. These are purely syntactic sugar, and are converted to addresses when read by the VM.

When comparing or combining values of different types, they will be converted to numbers and then compared. Empty cells and FALSE are converted to 0, and TRUE or string values are converted to 1.

Instructions are numerically coded, but string aliases are also defined for each to make them easier to read when authoring a program. Except when specified, the dimensions of ranges passed in to an instruction should match, and operations are conducted on the corresponding cells in each range, similar to vector operations in GLSL.

Most arithmetic operations in CSVM are in-place, overwriting the first parameter. If you do not want to mutate your data, copy it into the ``cpu`` sheet and perform operations there, then copy it back to its destination.

* ``CLEAR A`` (0) - Erases the values from any cells in the range A.
* ``COPY A B`` (1) - Reads from range A and copies the cells to range B.
* ``ADD A B`` (2) - Adds the values in B to A, storing the result in A.
* ``SUB A B`` (3) - Subtracts B from A, storing the result in A.
* ``MULT A B`` (4) - Multiplies A by B, storing the result in A.
* ``DIV A B`` (5) - Divides A by B, storing the result in A.
* ``MOD A B`` (6) - Divides A by B and stores the remainder in A.
* ``AND A B`` (7) - Performs a bitwise AND of A and B, storing the result in A.
* ``OR A B`` (8) - Performs a bitwise OR of A and B, storing the result in A. 
* ``XOR A B`` (9) - Performs a bitwise XOR of A and B, storing the result in A.
* ``NOT A`` (10) - Performs a bitwise NOT of A, storing the result in A.
* ``IF A B`` (11) - Checks the value in A, and if it is non-zero, jump to B.
* ``GT A B C`` (12) - Compare A and B, and if A is greater, jump to C.
* ``LT A B C`` (13) - Compare A and B, and if B is greater, jump to C.
* ``EQ A B C`` (14) - Compare A and B, and if they're equal, jump to C.
* ``NE A B C`` (15) - Compare A and B, and if they're different, jump to C.
* ``CALL A`` (16) - Set the program counter to A, and add the current address to the return stack.
* ``RET`` (17) - Pop the most recent value from the call stack and jump to its location.

In addition to these basic instructions, CSVM provides a number of game/shader inspired instructions.

* ``SIN A`` (18) - Take the sine of A and store the result in-place.
* ``COS A`` (19) - Take the cosine of A and store the result in-place.
* ``TAN A`` (20) - Take the tangent of A and store the result in-place.
* ``DOT A B`` (21) - Perform the dot product of A and B, storing the result in A.
* ``MAT A B C`` (22) - Perform matrix multiplication of A and B, storing the result in C.
* ``POW A B`` (23) - Take A to the power of B and store the result in A.
* ``CLAMP A B C`` (24) - Clamp A to the bounds of B and C, storing the result in A.
* ``MIN A B`` (25) - Set A to the lower of A and B
* ``MAX A B`` (26) - Set A to the higher of A and B
* ``ABS A`` (27) - Set A to the absolute value of A.
* ``RAND A`` (28) - Set A to a random number in the range of 0 to 1.

