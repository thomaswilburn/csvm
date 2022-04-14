import { CSVM } from "./vm.js";
import parse from "./csv.js";

var program = parse(`
csvm,6
copy,=R[0]C[2]:R[0]C[5],=cpu!A2:C2,a,b,c
copy,=cpu!A2,=cpu!D2
copy,12,=cpu!A3:H3
clear,=cpu!C3:F3
copy,=cpu!A1:G4,=stdout!A1
`);

var vm = new CSVM(program, { verbose: true });
