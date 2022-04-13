import { CSVM } from "./vm.js";
import parse from "./csv.js";

var program = parse(`
csvm,8
copy,=R[0]C[2]:R[0]C[5],=cpu!A2:C2,a,b,c
`);

var vm = new CSVM(program);
